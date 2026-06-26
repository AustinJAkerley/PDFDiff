import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdfDocument } from './pdfLoader'
import { extractTokensByPage, type Box, type PositionedToken } from './pdfText'
import { extractImagesByPage, type PositionedImage } from './pdfImages'
import { diffTokens } from './diffEngine'
import type { Highlight } from '../diff-page/PdfViewer'

/** Highlights to overlay on each side's rendered PDF. */
export type DiffHighlights = {
  left: Highlight[]
  right: Highlight[]
}

// Red boxes mark content present on the left (PDF 1) but gone/changed on the
// right; green boxes mark content added/changed on the right (PDF 2).
const CLASS_REMOVED = 'pdf-highlight--removed'
const CLASS_ADDED = 'pdf-highlight--added'

// Two tokens are treated as being on the same visual line when their vertical
// centers are within this fraction of their height of each other.
const SAME_LINE_TOLERANCE = 0.5

// Minimum intersection-over-union for two images to be considered "the same"
// image across the two documents (and therefore unchanged).
const IMAGE_MATCH_IOU = 0.5

/**
 * Merge a run of contiguous tokens into one box per visual line. Tokens within
 * a diff segment are contiguous in reading order, so this collapses the many
 * per-word boxes into a single box that spans each changed line - far less
 * cluttered than boxing every word separately.
 */
function mergeTokensIntoLineBoxes(tokens: PositionedToken[]): Array<{ page: number; box: Box }> {
  const result: Array<{ page: number; box: Box }> = []

  let page = -1
  let minLeft = 0
  let minTop = 0
  let maxRight = 0
  let maxBottom = 0
  let started = false

  const flush = () => {
    if (!started) return
    result.push({
      page,
      box: { left: minLeft, top: minTop, width: maxRight - minLeft, height: maxBottom - minTop },
    })
    started = false
  }

  for (const token of tokens) {
    const { box } = token
    const center = box.top + box.height / 2
    const groupCenter = minTop + (maxBottom - minTop) / 2
    const sameLine =
      started &&
      token.page === page &&
      Math.abs(center - groupCenter) <= SAME_LINE_TOLERANCE * box.height

    if (!sameLine) {
      flush()
      page = token.page
      minLeft = box.left
      minTop = box.top
      maxRight = box.left + box.width
      maxBottom = box.top + box.height
      started = true
      continue
    }

    minLeft = Math.min(minLeft, box.left)
    minTop = Math.min(minTop, box.top)
    maxRight = Math.max(maxRight, box.left + box.width)
    maxBottom = Math.max(maxBottom, box.top + box.height)
  }
  flush()

  return result
}

function toHighlights(boxes: Array<{ page: number; box: Box }>, className: string): Highlight[] {
  return boxes.map(({ page, box }) => ({
    page,
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    className,
  }))
}

/**
 * Build the left/right text highlights for a single page pair. Removed text and
 * the original side of a modification are boxed red on the left; added text and
 * the new side of a modification are boxed green on the right. Each contiguous
 * change is merged into one box per line.
 */
function textHighlightsForPage(
  leftTokens: PositionedToken[],
  rightTokens: PositionedToken[],
): DiffHighlights {
  const removedTokens: PositionedToken[] = []
  const addedTokens: PositionedToken[] = []

  const segments = diffTokens(
    leftTokens.map((t) => t.text),
    rightTokens.map((t) => t.text),
  )

  for (const segment of segments) {
    if (segment.kind === 'equal') continue

    // removed + modified contribute the left-side tokens (red).
    if (segment.kind === 'removed' || segment.kind === 'modified') {
      for (const idx of segment.leftIndices) removedTokens.push(leftTokens[idx])
    }
    // added + modified contribute the right-side tokens (green).
    if (segment.kind === 'added' || segment.kind === 'modified') {
      for (const idx of segment.rightIndices) addedTokens.push(rightTokens[idx])
    }
  }

  return {
    left: toHighlights(mergeTokensIntoLineBoxes(removedTokens), CLASS_REMOVED),
    right: toHighlights(mergeTokensIntoLineBoxes(addedTokens), CLASS_ADDED),
  }
}

function intersectionOverUnion(a: Box, b: Box): number {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const right = Math.min(a.left + a.width, b.left + b.width)
  const bottom = Math.min(a.top + a.height, b.top + b.height)
  const interW = right - left
  const interH = bottom - top
  if (interW <= 0 || interH <= 0) return 0
  const intersection = interW * interH
  const union = a.width * a.height + b.width * b.height - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * Diff the images on a single page pair. Images are matched across documents by
 * positional overlap; an unmatched left image was removed (red on the left) and
 * an unmatched right image was added (green on the right).
 */
function imageHighlightsForPage(
  leftImages: PositionedImage[],
  rightImages: PositionedImage[],
): DiffHighlights {
  const matchedRight = new Set<number>()
  const left: Highlight[] = []
  const right: Highlight[] = []

  for (const leftImage of leftImages) {
    let bestIdx = -1
    let bestIou = IMAGE_MATCH_IOU
    for (let j = 0; j < rightImages.length; j += 1) {
      if (matchedRight.has(j)) continue
      const iou = intersectionOverUnion(leftImage.box, rightImages[j].box)
      if (iou >= bestIou) {
        bestIou = iou
        bestIdx = j
      }
    }

    if (bestIdx === -1) {
      // No counterpart on the right: this image was removed.
      left.push({ page: leftImage.page, ...leftImage.box, className: CLASS_REMOVED })
    } else {
      matchedRight.add(bestIdx)
    }
  }

  // Any right image without a left match was added.
  for (let j = 0; j < rightImages.length; j += 1) {
    if (matchedRight.has(j)) continue
    const image = rightImages[j]
    right.push({ page: image.page, ...image.box, className: CLASS_ADDED })
  }

  return { left, right }
}

/**
 * Compute diff highlights between two rendered PDFs by extracting positioned
 * word tokens and images from each, diffing them page-by-page, and mapping the
 * changes back to page-relative boxes. Removed/changed content is boxed red on
 * the left (PDF 1); added/changed content is boxed green on the right (PDF 2).
 * Pages beyond the shorter document are treated as fully removed or added.
 */
export async function computeDiffHighlights(leftUrl: string, rightUrl: string): Promise<DiffHighlights> {
  let leftDoc: PDFDocumentProxy | null = null
  let rightDoc: PDFDocumentProxy | null = null

  try {
    ;[leftDoc, rightDoc] = await Promise.all([loadPdfDocument(leftUrl), loadPdfDocument(rightUrl)])

    const [leftPages, rightPages, leftImagePages, rightImagePages] = await Promise.all([
      extractTokensByPage(leftDoc),
      extractTokensByPage(rightDoc),
      extractImagesByPage(leftDoc),
      extractImagesByPage(rightDoc),
    ])

    const left: Highlight[] = []
    const right: Highlight[] = []
    const pageCount = Math.max(leftPages.length, rightPages.length)

    for (let p = 0; p < pageCount; p += 1) {
      const textHighlights = textHighlightsForPage(leftPages[p] ?? [], rightPages[p] ?? [])
      left.push(...textHighlights.left)
      right.push(...textHighlights.right)

      const imageHighlights = imageHighlightsForPage(leftImagePages[p] ?? [], rightImagePages[p] ?? [])
      left.push(...imageHighlights.left)
      right.push(...imageHighlights.right)
    }

    return { left, right }
  } finally {
    await leftDoc?.loadingTask.destroy()
    await rightDoc?.loadingTask.destroy()
  }
}

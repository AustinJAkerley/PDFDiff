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

// Red boxes mark content present on the left (PDF 1) but gone on the right;
// green boxes mark content added on the right (PDF 2); orange boxes mark an
// in-place edit (text changed in the same spot) and are drawn on both sides.
const CLASS_REMOVED = 'pdf-highlight--removed'
const CLASS_ADDED = 'pdf-highlight--added'
const CLASS_MODIFIED = 'pdf-highlight--modified'

// Two tokens are treated as being on the same visual line when their vertical
// centers are within this fraction of their height of each other.
const SAME_LINE_TOLERANCE = 0.5

// Same-color boxes whose bounding boxes come within this fraction of the page
// (on both axes) are flood-filled together into a single region. This groups the
// per-line boxes of a multi-line change - and adjacent same-color changes - into
// one box instead of leaving a scatter of disconnected rectangles.
const MERGE_GAP = 0.02

// Minimum intersection-over-union for two images to be considered "the same"
// image across the two documents (and therefore unchanged). This is a
// position/size match only - content is not compared - so an image swapped for
// a different one at the same spot is treated as unchanged.
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
 * Build the left/right text highlights for a single page pair. Removed text is
 * boxed red on the left, added text green on the right, and an in-place edit
 * (a removed run immediately followed by an added run) is boxed orange on both
 * sides. Each contiguous change is merged into one box per line; nearby boxes of
 * the same color are flood-filled together later in {@link computeDiffHighlights}.
 */
function textHighlightsForPage(
  leftTokens: PositionedToken[],
  rightTokens: PositionedToken[],
): DiffHighlights {
  const removedTokens: PositionedToken[] = []
  const addedTokens: PositionedToken[] = []
  const modifiedLeftTokens: PositionedToken[] = []
  const modifiedRightTokens: PositionedToken[] = []

  const segments = diffTokens(
    leftTokens.map((t) => t.text),
    rightTokens.map((t) => t.text),
  )

  for (const segment of segments) {
    if (segment.kind === 'equal') continue

    if (segment.kind === 'removed') {
      for (const idx of segment.leftIndices) removedTokens.push(leftTokens[idx])
    } else if (segment.kind === 'added') {
      for (const idx of segment.rightIndices) addedTokens.push(rightTokens[idx])
    } else {
      // modified: an in-place edit, boxed orange on both sides.
      for (const idx of segment.leftIndices) modifiedLeftTokens.push(leftTokens[idx])
      for (const idx of segment.rightIndices) modifiedRightTokens.push(rightTokens[idx])
    }
  }

  return {
    left: [
      ...toHighlights(mergeTokensIntoLineBoxes(removedTokens), CLASS_REMOVED),
      ...toHighlights(mergeTokensIntoLineBoxes(modifiedLeftTokens), CLASS_MODIFIED),
    ],
    right: [
      ...toHighlights(mergeTokensIntoLineBoxes(addedTokens), CLASS_ADDED),
      ...toHighlights(mergeTokensIntoLineBoxes(modifiedRightTokens), CLASS_MODIFIED),
    ],
  }
}

// Gap between two intervals on one axis; 0 when they overlap.
function intervalGap(aMin: number, aMax: number, bMin: number, bMax: number): number {
  if (aMax < bMin) return bMin - aMax
  if (bMax < aMin) return aMin - bMax
  return 0
}

// True when two boxes are close enough (on both axes) to be flood-filled into
// the same region.
function boxesAreClose(a: Highlight, b: Highlight): boolean {
  const hGap = intervalGap(a.left, a.left + a.width, b.left, b.left + b.width)
  const vGap = intervalGap(a.top, a.top + a.height, b.top, b.top + b.height)
  return hGap <= MERGE_GAP && vGap <= MERGE_GAP
}

/**
 * Flood-fill (DFS-style, via union-find) over highlight boxes: boxes that share
 * a page and color and lie within {@link MERGE_GAP} of one another - directly or
 * transitively - are combined into a single bounding box. This turns the per-line
 * boxes of a multi-line change into one grouped region.
 */
function mergeNearbyHighlights(highlights: Highlight[]): Highlight[] {
  // Only boxes of the same color on the same page may merge.
  const groups = new Map<string, Highlight[]>()
  for (const hl of highlights) {
    const key = `${hl.page}|${hl.className ?? ''}`
    const list = groups.get(key)
    if (list) list.push(hl)
    else groups.set(key, [hl])
  }

  const merged: Highlight[] = []
  for (const list of groups.values()) {
    // Union-find connecting boxes that are close to one another.
    const parent = list.map((_, i) => i)
    const find = (i: number): number => {
      let root = i
      while (parent[root] !== root) root = parent[root]
      while (parent[i] !== root) {
        const next = parent[i]
        parent[i] = root
        i = next
      }
      return root
    }
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (boxesAreClose(list[i], list[j])) parent[find(i)] = find(j)
      }
    }

    // Collapse each connected component into its bounding box.
    const components = new Map<number, Highlight>()
    for (let i = 0; i < list.length; i += 1) {
      const root = find(i)
      const hl = list[i]
      const existing = components.get(root)
      if (!existing) {
        components.set(root, { ...hl })
        continue
      }
      const left = Math.min(existing.left, hl.left)
      const top = Math.min(existing.top, hl.top)
      const right = Math.max(existing.left + existing.width, hl.left + hl.width)
      const bottom = Math.max(existing.top + existing.height, hl.top + hl.height)
      existing.left = left
      existing.top = top
      existing.width = right - left
      existing.height = bottom - top
    }
    merged.push(...components.values())
  }

  return merged
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
 * changes back to page-relative boxes. Removed content is boxed red on the left
 * (PDF 1); added content is boxed green on the right (PDF 2); in-place edits are
 * boxed orange on both sides. Nearby same-color boxes are grouped into one
 * region. Pages beyond the shorter document are treated as fully removed/added.
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

    const leftText: Highlight[] = []
    const rightText: Highlight[] = []
    const leftImages: Highlight[] = []
    const rightImages: Highlight[] = []
    const pageCount = Math.max(leftPages.length, rightPages.length)

    for (let p = 0; p < pageCount; p += 1) {
      const textHighlights = textHighlightsForPage(leftPages[p] ?? [], rightPages[p] ?? [])
      leftText.push(...textHighlights.left)
      rightText.push(...textHighlights.right)

      const imageHighlights = imageHighlightsForPage(leftImagePages[p] ?? [], rightImagePages[p] ?? [])
      leftImages.push(...imageHighlights.left)
      rightImages.push(...imageHighlights.right)
    }

    // Flood-fill nearby same-color text boxes into grouped regions, then overlay
    // the image highlights (kept separate so a change box never swallows a logo).
    return {
      left: [...mergeNearbyHighlights(leftText), ...leftImages],
      right: [...mergeNearbyHighlights(rightText), ...rightImages],
    }
  } finally {
    await leftDoc?.loadingTask.destroy()
    await rightDoc?.loadingTask.destroy()
  }
}

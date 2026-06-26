import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdfDocument } from './pdfLoader'
import { extractTokensByPage, type PositionedToken } from './pdfText'
import { diffTokens } from './diffEngine'
import type { Highlight } from '../diff-page/PdfViewer'

/** Highlights to overlay on each side's rendered PDF. */
export type DiffHighlights = {
  left: Highlight[]
  right: Highlight[]
}

// Width of the thin red marker drawn on the right page to indicate where text
// was removed (and therefore has no box of its own on the right).
const REMOVAL_MARKER_WIDTH = 0.004

const CLASS_ADDED = 'pdf-highlight--added'
const CLASS_REMOVED = 'pdf-highlight--removed'
const CLASS_MODIFIED = 'pdf-highlight--modified'
const CLASS_REMOVED_MARKER = 'pdf-highlight--removed-marker'

function toHighlight(token: PositionedToken, className: string): Highlight {
  return {
    page: token.page,
    left: token.box.left,
    top: token.box.top,
    width: token.box.width,
    height: token.box.height,
    className,
  }
}

/**
 * Build the left/right highlight overlays for a single page pair.
 *
 * - Left page: removed tokens (red) and the original side of modified tokens
 *   (orange).
 * - Right page: added tokens (green), the new side of modified tokens (orange),
 *   and thin red markers where tokens were removed.
 */
function highlightsForPage(
  leftTokens: PositionedToken[],
  rightTokens: PositionedToken[],
  rightPageExists: boolean,
): DiffHighlights {
  const left: Highlight[] = []
  const right: Highlight[] = []

  const segments = diffTokens(
    leftTokens.map((t) => t.text),
    rightTokens.map((t) => t.text),
  )

  // First box on the right for each segment that owns right tokens. Used to
  // anchor removal markers to the gap where text used to be.
  const firstRightBox = (segmentIndex: number) => {
    for (let s = segmentIndex; s < segments.length; s += 1) {
      const idx = segments[s].rightIndices[0]
      if (idx !== undefined) return rightTokens[idx]
    }
    return null
  }

  let lastRightToken: PositionedToken | null = null

  for (let s = 0; s < segments.length; s += 1) {
    const segment = segments[s]

    switch (segment.kind) {
      case 'equal':
        for (const idx of segment.rightIndices) lastRightToken = rightTokens[idx]
        break

      case 'added':
        for (const idx of segment.rightIndices) {
          const token = rightTokens[idx]
          right.push(toHighlight(token, CLASS_ADDED))
          lastRightToken = token
        }
        break

      case 'modified':
        for (const idx of segment.leftIndices) left.push(toHighlight(leftTokens[idx], CLASS_MODIFIED))
        for (const idx of segment.rightIndices) {
          const token = rightTokens[idx]
          right.push(toHighlight(token, CLASS_MODIFIED))
          lastRightToken = token
        }
        break

      case 'removed': {
        for (const idx of segment.leftIndices) left.push(toHighlight(leftTokens[idx], CLASS_REMOVED))

        // Show a marker on the right at the position the text was removed from,
        // anchored to the next retained token, or the previous one at end.
        if (rightPageExists) {
          const anchor = firstRightBox(s + 1) ?? lastRightToken
          if (anchor) {
            const atEnd = firstRightBox(s + 1) === null
            const markerLeft = atEnd ? anchor.box.left + anchor.box.width : anchor.box.left
            right.push({
              page: anchor.page,
              left: Math.max(0, markerLeft - REMOVAL_MARKER_WIDTH / 2),
              top: anchor.box.top,
              width: REMOVAL_MARKER_WIDTH,
              height: anchor.box.height,
              className: CLASS_REMOVED_MARKER,
            })
          }
        }
        break
      }
    }
  }

  return { left, right }
}

/**
 * Compute diff highlights between two rendered PDFs by extracting positioned
 * word tokens from each, diffing them page-by-page, and mapping the changes
 * back to page-relative boxes. Pages beyond the shorter document are treated as
 * fully removed (left) or fully added (right).
 */
export async function computeDiffHighlights(leftUrl: string, rightUrl: string): Promise<DiffHighlights> {
  let leftDoc: PDFDocumentProxy | null = null
  let rightDoc: PDFDocumentProxy | null = null

  try {
    ;[leftDoc, rightDoc] = await Promise.all([loadPdfDocument(leftUrl), loadPdfDocument(rightUrl)])

    const [leftPages, rightPages] = await Promise.all([
      extractTokensByPage(leftDoc),
      extractTokensByPage(rightDoc),
    ])

    const left: Highlight[] = []
    const right: Highlight[] = []
    const pageCount = Math.max(leftPages.length, rightPages.length)

    for (let p = 0; p < pageCount; p += 1) {
      const leftTokens = leftPages[p] ?? []
      const rightTokens = rightPages[p] ?? []
      const pageHighlights = highlightsForPage(leftTokens, rightTokens, p < rightPages.length)
      left.push(...pageHighlights.left)
      right.push(...pageHighlights.right)
    }

    return { left, right }
  } finally {
    await leftDoc?.loadingTask.destroy()
    await rightDoc?.loadingTask.destroy()
  }
}

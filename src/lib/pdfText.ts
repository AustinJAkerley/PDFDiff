import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

/** A page-relative bounding box. All values are fractions in the range [0, 1]. */
export type Box = {
  left: number
  top: number
  width: number
  height: number
}

/** A single word extracted from a PDF, with its 1-based page and page-relative box. */
export type PositionedToken = {
  text: string
  page: number
  box: Box
}

type TextItemLike = {
  str: string
  transform: number[]
  width: number
  height: number
}

// Fraction of a glyph's height that sits above the text baseline. The remainder
// (1 - ASCENT_RATIO) accounts for descenders below the baseline. Used to anchor
// highlight boxes snugly over the visible glyphs instead of floating above them.
// pdf.js reports `item.height` as the full font em, which is taller than the
// visible cap/ascender height; using the full em as the ascent left the box
// floating slightly above the text, so we anchor the top near the cap height.
const ASCENT_RATIO = 0.7

function isTextItem(item: unknown): item is TextItemLike {
  return typeof (item as TextItemLike)?.str === 'string' && Array.isArray((item as TextItemLike).transform)
}

/**
 * Split a text item into individual word tokens, approximating each word's
 * horizontal box by distributing the item width proportionally to the number of
 * characters. This keeps boxes tight around words rather than whole text runs,
 * which makes the resulting diff highlights far more precise.
 */
function splitItemIntoTokens(
  item: TextItemLike,
  page: number,
  viewportWidth: number,
  viewportHeight: number,
): PositionedToken[] {
  const text = item.str
  if (text.trim() === '') return []

  // Map the text origin into viewport (device) space with a top-left origin.
  const tx = pdfjs.Util.transform(
    [1, 0, 0, -1, 0, viewportHeight],
    item.transform,
  )
  const originX = tx[4]
  const baselineY = tx[5]

  // item.height is the font height in device units; fall back to the transform
  // scale when the PDF reports a zero height.
  const height = item.height || Math.hypot(item.transform[2], item.transform[3])

  // The text item's origin sits on the baseline. Glyphs extend mostly above the
  // baseline (ascent) with a little below it (descent). Anchoring the box at
  // `baseline - height` left a gap of empty space above the text and made the
  // box look too high, so split `height` into an ascent above and a descent
  // below the baseline to sit snugly over the glyphs.
  const top = baselineY - height * ASCENT_RATIO
  const totalWidth = item.width

  // Distribute the run width across characters so each word gets a slice.
  const charWidth = text.length > 0 ? totalWidth / text.length : 0

  const tokens: PositionedToken[] = []
  // Match words and remember where each starts so we can offset its box.
  const wordPattern = /\S+/g
  let match: RegExpExecArray | null
  while ((match = wordPattern.exec(text)) !== null) {
    const word = match[0]
    const startChar = match.index
    const left = originX + startChar * charWidth
    const width = word.length * charWidth

    tokens.push({
      text: word,
      page,
      box: {
        left: left / viewportWidth,
        top: top / viewportHeight,
        width: width / viewportWidth,
        height: height / viewportHeight,
      },
    })
  }
  return tokens
}

/**
 * Extract positioned word tokens for every page of a PDF document. Tokens are
 * returned grouped by page (index 0 = page 1) so callers can diff page-by-page.
 */
export async function extractTokensByPage(doc: PDFDocumentProxy): Promise<PositionedToken[][]> {
  const pages: PositionedToken[][] = []

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum)
    try {
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const tokens: PositionedToken[] = []
      for (const item of content.items) {
        if (!isTextItem(item)) continue
        tokens.push(...splitItemIntoTokens(item, pageNum, viewport.width, viewport.height))
      }
      pages.push(tokens)
    } finally {
      page.cleanup()
    }
  }

  return pages
}

import { OPS } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdfDocument } from './pdfLoader'

const TOKEN_REGEX = /[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)?/gu

export type PdfPageClassification =
  | 'TEXT_BASED'
  | 'SCANNED_IMAGE'
  | 'IMAGE_HEAVY'
  | 'MIXED'
  | 'VECTOR_HEAVY'
  | 'UNKNOWN'

export type PdfPageSignals = {
  textItemCount: number
  wordCount: number
  imageCount?: number
  estimatedImageCoverage?: number
  vectorObjectCount?: number
  confidence: number
}

export type PdfPageClassificationEntry = {
  pageNumber: number
  type: PdfPageClassification
  signals: PdfPageSignals
}

export type PdfClassificationResult = {
  documentType: PdfPageClassification
  pages: PdfPageClassificationEntry[]
}

/**
 * Diff strategy decided from a page classification. `text` runs the textual
 * diff only, `visual` runs the image/visual fallback only, and
 * `text-and-visual` runs both.
 */
export type DiffStrategy = 'text' | 'visual' | 'text-and-visual'

// Heuristic thresholds. These are intentionally conservative so that a page is
// only labelled as scanned/visual when text extraction genuinely comes up short.
const HIGH_WORD_COUNT = 50
const LOW_WORD_COUNT = 10
const LARGE_IMAGE_COVERAGE = 0.6
const VECTOR_HEAVY_COUNT = 25

const IMAGE_OPS = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintInlineImageXObject,
  OPS.paintInlineImageXObjectGroup,
  OPS.paintImageMaskXObject,
  OPS.paintImageMaskXObjectGroup,
  OPS.paintImageMaskXObjectRepeat,
  OPS.paintSolidColorImageMask,
])

const VECTOR_OPS = new Set<number>([
  OPS.stroke,
  OPS.closeStroke,
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
  OPS.constructPath,
  OPS.rawFillPath,
  OPS.shadingFill,
])

type Matrix = [number, number, number, number, number, number]

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

// Concatenate two affine transforms expressed as PDF matrices
// [a, b, c, d, e, f]. Mirrors pdf.js `Util.transform`.
const multiply = (m1: Matrix, m2: Matrix): Matrix => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
]

// Area of the unit square once the current transform is applied. Images are
// painted in the unit square [0,1]x[0,1] in the current user space, so the
// absolute determinant of the matrix gives the painted area.
const transformedUnitArea = (m: Matrix): number => Math.abs(m[0] * m[3] - m[1] * m[2])

type RawPageSignals = {
  textItemCount: number
  wordCount: number
  imageCount: number
  estimatedImageCoverage: number
  vectorObjectCount: number
}

const collectPageSignals = async (
  pdfDocument: PDFDocumentProxy,
  pageNumber: number,
): Promise<RawPageSignals> => {
  const page = await pdfDocument.getPage(pageNumber)

  let textItems: Array<{ str?: string }>
  try {
    const textContent = await page.getTextContent()
    textItems = textContent.items.filter((item) => 'str' in item) as Array<{ str?: string }>
  } catch {
    // Text extraction can fail (for example a missing font resource); treat the
    // page as having no extractable text rather than aborting classification.
    textItems = []
  }
  const textItemCount = textItems.length
  const text = textItems
    .map((item) => item.str ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const wordCount = (text.match(TOKEN_REGEX) ?? []).length

  const [, , pageWidth, pageHeight] = page.view
  const pageArea = Math.abs((pageWidth - page.view[0]) * (pageHeight - page.view[1]))

  let imageCount = 0
  let imageArea = 0
  let vectorObjectCount = 0

  try {
    const operatorList = await page.getOperatorList()
    const ctmStack: Matrix[] = []
    let ctm: Matrix = IDENTITY

    for (let i = 0; i < operatorList.fnArray.length; i += 1) {
      const fn = operatorList.fnArray[i]

      if (fn === OPS.save) {
        ctmStack.push(ctm)
      } else if (fn === OPS.restore) {
        ctm = ctmStack.pop() ?? IDENTITY
      } else if (fn === OPS.transform) {
        const args = operatorList.argsArray[i] as number[]
        ctm = multiply(ctm, args as Matrix)
      } else if (IMAGE_OPS.has(fn)) {
        imageCount += 1
        imageArea += transformedUnitArea(ctm)
      } else if (VECTOR_OPS.has(fn)) {
        vectorObjectCount += 1
      }
    }
  } catch {
    // Operator-list extraction can fail on malformed pages; fall back to the
    // text-only signals already collected above.
  }

  const estimatedImageCoverage = pageArea > 0 ? Math.min(1, imageArea / pageArea) : 0

  return { textItemCount, wordCount, imageCount, estimatedImageCoverage, vectorObjectCount }
}

const classifyFromSignals = (raw: RawPageSignals): { type: PdfPageClassification; confidence: number } => {
  const { wordCount, imageCount, estimatedImageCoverage, vectorObjectCount } = raw
  const hasLargeImage = imageCount >= 1 && estimatedImageCoverage >= LARGE_IMAGE_COVERAGE

  // Very low extractable text behind a large image: a scanned page.
  if (wordCount <= LOW_WORD_COUNT && hasLargeImage) {
    return { type: 'SCANNED_IMAGE', confidence: Math.min(1, 0.6 + estimatedImageCoverage * 0.35) }
  }

  // Meaningful text plus large image coverage: mixed content. A lot of text
  // means MIXED, otherwise the image dominates and it is IMAGE_HEAVY.
  if (wordCount > LOW_WORD_COUNT && hasLargeImage) {
    if (wordCount >= HIGH_WORD_COUNT) {
      return { type: 'MIXED', confidence: 0.7 }
    }
    return { type: 'IMAGE_HEAVY', confidence: 0.65 }
  }

  // Plenty of extractable words and no dominating image: a text page.
  if (wordCount >= HIGH_WORD_COUNT) {
    return { type: 'TEXT_BASED', confidence: 0.9 }
  }

  // Little text but lots of vector drawing operations: a chart/diagram page.
  if (wordCount <= LOW_WORD_COUNT && vectorObjectCount >= VECTOR_HEAVY_COUNT) {
    return { type: 'VECTOR_HEAVY', confidence: 0.6 }
  }

  // Some text, no large image and not vector-dominated: still usable as text.
  if (wordCount > LOW_WORD_COUNT) {
    return { type: 'TEXT_BASED', confidence: 0.6 }
  }

  // Weak signals all round.
  return { type: 'UNKNOWN', confidence: 0.3 }
}

const summarizeDocumentType = (pages: PdfPageClassificationEntry[]): PdfPageClassification => {
  if (!pages.length) {
    return 'UNKNOWN'
  }

  const counts = new Map<PdfPageClassification, number>()
  for (const page of pages) {
    counts.set(page.type, (counts.get(page.type) ?? 0) + 1)
  }

  let documentType: PdfPageClassification = pages[0].type
  let best = 0
  for (const [type, count] of counts) {
    if (count > best) {
      best = count
      documentType = type
    }
  }

  return documentType
}

/**
 * Classify an already-loaded pdf.js document: the whole document plus each
 * page. No OCR is performed; only structural signals are inspected.
 */
export async function classifyPdfDocument(pdfDocument: PDFDocumentProxy): Promise<PdfClassificationResult> {
  const pages: PdfPageClassificationEntry[] = []

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    let raw: RawPageSignals
    try {
      raw = await collectPageSignals(pdfDocument, pageNumber)
    } catch {
      // A single unreadable page must not abort classification of the whole
      // document; record empty signals so it falls through to UNKNOWN.
      raw = { textItemCount: 0, wordCount: 0, imageCount: 0, estimatedImageCoverage: 0, vectorObjectCount: 0 }
    }
    const { type, confidence } = classifyFromSignals(raw)

    pages.push({
      pageNumber,
      type,
      signals: {
        textItemCount: raw.textItemCount,
        wordCount: raw.wordCount,
        imageCount: raw.imageCount,
        estimatedImageCoverage: raw.estimatedImageCoverage,
        vectorObjectCount: raw.vectorObjectCount,
        confidence,
      },
    })
  }

  return { documentType: summarizeDocumentType(pages), pages }
}

/**
 * Classify a PDF file: the whole document plus each page.
 */
export async function classifyPdf(file: File): Promise<PdfClassificationResult> {
  const pdfDocument = await loadPdfDocument(new Uint8Array(await file.arrayBuffer()))
  const result = await classifyPdfDocument(pdfDocument)
  logClassification(file.name, result)
  return result
}

/**
 * Diff routing for a page classification.
 * - TEXT_BASED        → text diff
 * - SCANNED_IMAGE     → visual image diff fallback
 * - IMAGE_HEAVY/MIXED → both text diff and visual diff
 * - VECTOR_HEAVY      → visual diff first
 * - UNKNOWN           → visual diff fallback
 */
export function getDiffStrategy(type: PdfPageClassification): DiffStrategy {
  switch (type) {
    case 'TEXT_BASED':
      return 'text'
    case 'IMAGE_HEAVY':
    case 'MIXED':
      return 'text-and-visual'
    case 'SCANNED_IMAGE':
    case 'VECTOR_HEAVY':
    case 'UNKNOWN':
    default:
      return 'visual'
  }
}

/**
 * Short, user-facing badge label for a page or document classification.
 */
export function getClassificationBadgeLabel(type: PdfPageClassification): string {
  switch (type) {
    case 'TEXT_BASED':
      return 'Text-based'
    case 'SCANNED_IMAGE':
      return 'Scanned'
    case 'IMAGE_HEAVY':
      return 'Image-heavy'
    case 'MIXED':
      return 'Mixed'
    case 'VECTOR_HEAVY':
    case 'UNKNOWN':
    default:
      return 'Visual fallback'
  }
}

/**
 * Emit per-page classification signals to the console for debugging. No OCR is
 * performed; this surfaces the structural signals used for routing.
 */
export function logClassification(label: string, result: PdfClassificationResult): void {
  console.debug(
    `[pdfdiff] classification for ${label}: document=${result.documentType}`,
    result.pages.map((page) => ({
      page: page.pageNumber,
      type: page.type,
      strategy: getDiffStrategy(page.type),
      ...page.signals,
    })),
  )
}

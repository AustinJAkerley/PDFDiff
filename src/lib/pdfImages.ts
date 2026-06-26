import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Box } from './pdfText'

/** An image (logo, photo, figure) found on a page, with its page-relative box. */
export type PositionedImage = {
  page: number
  box: Box
}

// Operators that paint raster image content. When any of these run, an image
// occupies the unit square [0,1]×[0,1] transformed by the current matrix.
const IMAGE_OPS = new Set<number>([
  pdfjs.OPS.paintImageXObject,
  pdfjs.OPS.paintImageXObjectRepeat,
  pdfjs.OPS.paintInlineImageXObject,
  pdfjs.OPS.paintInlineImageXObjectGroup,
  pdfjs.OPS.paintImageMaskXObject,
  pdfjs.OPS.paintImageMaskXObjectGroup,
  pdfjs.OPS.paintImageMaskXObjectRepeat,
])

// Ignore hairline images (rules, 1px spacers) that would only add diff noise.
const MIN_IMAGE_FRACTION = 0.005

type Matrix = number[]

// Apply a 2D affine matrix [a,b,c,d,e,f] to a point, returning device coords.
function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

/**
 * Compute the device-space bounding box of the unit square under `ctm`, then
 * normalize it to page-relative fractions. Images in PDF are always drawn into
 * the unit square, so its transformed bounds are the image's bounds.
 */
function unitSquareBox(ctm: Matrix, viewportWidth: number, viewportHeight: number): Box {
  const corners: Array<[number, number]> = [
    applyMatrix(ctm, 0, 0),
    applyMatrix(ctm, 1, 0),
    applyMatrix(ctm, 1, 1),
    applyMatrix(ctm, 0, 1),
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of corners) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return {
    left: minX / viewportWidth,
    top: minY / viewportHeight,
    width: (maxX - minX) / viewportWidth,
    height: (maxY - minY) / viewportHeight,
  }
}

/**
 * Walk a page's operator list, tracking the current transformation matrix
 * through save/restore/transform operators, and record a bounding box for every
 * image-painting operator encountered.
 */
function imagesFromOperatorList(
  fnArray: number[],
  argsArray: unknown[],
  baseTransform: Matrix,
  page: number,
  viewportWidth: number,
  viewportHeight: number,
): PositionedImage[] {
  const images: PositionedImage[] = []
  let ctm: Matrix = baseTransform
  const stack: Matrix[] = []

  for (let i = 0; i < fnArray.length; i += 1) {
    const op = fnArray[i]

    if (op === pdfjs.OPS.save) {
      stack.push(ctm)
    } else if (op === pdfjs.OPS.restore) {
      ctm = stack.pop() ?? ctm
    } else if (op === pdfjs.OPS.transform) {
      const args = argsArray[i] as number[]
      ctm = pdfjs.Util.transform(ctm, args)
    } else if (IMAGE_OPS.has(op)) {
      const box = unitSquareBox(ctm, viewportWidth, viewportHeight)
      if (box.width >= MIN_IMAGE_FRACTION && box.height >= MIN_IMAGE_FRACTION) {
        images.push({ page, box })
      }
    }
  }

  return images
}

/**
 * Extract positioned image boxes for every page of a PDF document, grouped by
 * page (index 0 = page 1). Used to detect added/removed figures and logos that
 * a text-only diff would miss.
 */
export async function extractImagesByPage(doc: PDFDocumentProxy): Promise<PositionedImage[][]> {
  const pages: PositionedImage[][] = []

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum)
    try {
      const viewport = page.getViewport({ scale: 1 })
      const opList = await page.getOperatorList()
      pages.push(
        imagesFromOperatorList(
          opList.fnArray,
          opList.argsArray,
          viewport.transform,
          pageNum,
          viewport.width,
          viewport.height,
        ),
      )
    } finally {
      page.cleanup()
    }
  }

  return pages
}

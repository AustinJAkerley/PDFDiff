import type { CV, Mat } from '@techstark/opencv-js'
import { loadOpenCv } from './opencvLoader'
import { loadPdfDocument } from './pdfLoader'

// A difference region expressed as fractions (0..1) of the page so the same box
// can be overlaid on a canvas that is displayed at a responsive `width: 100%`.
export type DiffBox = {
  left: number
  top: number
  width: number
  height: number
}

export type PageStatus = 'changed' | 'unchanged' | 'added' | 'removed'

export type PageVisualDiff = {
  pageNumber: number
  status: PageStatus
  regionCount: number
}

export type VisualDiffResult = {
  pages: PageVisualDiff[]
  changedPageCount: number
  totalRegions: number
  failedPages: number
  openCvAvailable: boolean
}

export type VisualDiffOptions = {
  leftFile: File
  rightFile: File
  leftContainer: HTMLElement
  rightContainer: HTMLElement
}

// Pages are rasterized at this scale before being compared and displayed. A
// value above 1 keeps text crisp on screen; the pixel diff is computed at the
// same resolution so the boxes line up with what the user sees.
const RENDER_SCALE = 2

// Pixel-difference tuning. Small per-pixel intensity changes (anti-aliasing,
// subpixel font rendering) are ignored via the blur + threshold, and nearby
// changed pixels are merged into a single region via dilation so a changed word
// or figure becomes one box instead of dozens of speckles.
const DIFF_THRESHOLD = 30
const BLUR_KERNEL = 5
const DILATE_KERNEL = 11
const DILATE_ITERATIONS = 2
const MIN_REGION_AREA_FRACTION = 0.00008

type RenderedPage = {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

// Compare two equally-rendered page canvases and return the bounding boxes of
// the regions that differ, as fractions of the page dimensions.
const computeDiffBoxes = (cv: CV, left: HTMLCanvasElement, right: HTMLCanvasElement): DiffBox[] => {
  const mats: Mat[] = []
  const track = <T extends Mat>(mat: T): T => {
    mats.push(mat)
    return mat
  }

  const contours = new cv.MatVector()
  const hierarchy = track(new cv.Mat())

  try {
    const src1 = track(cv.imread(left))
    const src2 = track(cv.imread(right))

    const gray1 = track(new cv.Mat())
    const gray2 = track(new cv.Mat())
    cv.cvtColor(src1, gray1, cv.COLOR_RGBA2GRAY)
    cv.cvtColor(src2, gray2, cv.COLOR_RGBA2GRAY)

    // The two pages may differ slightly in size; align the second onto the
    // first so a pixel-wise comparison is meaningful.
    if (gray2.rows !== gray1.rows || gray2.cols !== gray1.cols) {
      const resized = track(new cv.Mat())
      cv.resize(gray2, resized, new cv.Size(gray1.cols, gray1.rows), 0, 0, cv.INTER_AREA)
      resized.copyTo(gray2)
    }

    const blurSize = new cv.Size(BLUR_KERNEL, BLUR_KERNEL)
    cv.GaussianBlur(gray1, gray1, blurSize, 0, 0, cv.BORDER_DEFAULT)
    cv.GaussianBlur(gray2, gray2, blurSize, 0, 0, cv.BORDER_DEFAULT)

    const diff = track(new cv.Mat())
    cv.absdiff(gray1, gray2, diff)

    const thresh = track(new cv.Mat())
    cv.threshold(diff, thresh, DIFF_THRESHOLD, 255, cv.THRESH_BINARY)

    const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(DILATE_KERNEL, DILATE_KERNEL)))
    cv.dilate(thresh, thresh, kernel, new cv.Point(-1, -1), DILATE_ITERATIONS, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue())

    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    const pageWidth = gray1.cols
    const pageHeight = gray1.rows
    const minArea = pageWidth * pageHeight * MIN_REGION_AREA_FRACTION

    const boxes: DiffBox[] = []
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i)
      const rect = cv.boundingRect(contour)
      contour.delete()

      if (rect.width * rect.height < minArea) {
        continue
      }

      boxes.push({
        left: rect.x / pageWidth,
        top: rect.y / pageHeight,
        width: rect.width / pageWidth,
        height: rect.height / pageHeight,
      })
    }

    return boxes
  } finally {
    contours.delete()
    for (const mat of mats) {
      mat.delete()
    }
  }
}

const appendBoxes = (canvasWrap: HTMLElement, boxes: DiffBox[]) => {
  if (!boxes.length) {
    return
  }

  const overlay = document.createElement('div')
  overlay.className = 'pdf-page-highlight-layer'

  for (const box of boxes) {
    const el = document.createElement('span')
    el.className = 'pdf-highlight pdf-highlight-visual'
    el.style.left = `${100 * box.left}%`
    el.style.top = `${100 * box.top}%`
    el.style.width = `${100 * box.width}%`
    el.style.height = `${100 * box.height}%`
    overlay.append(el)
  }

  canvasWrap.append(overlay)
}

// Rasterize a single PDF page to a canvas at RENDER_SCALE. Returns the canvas so
// the full, unedited page is always displayed regardless of the diff outcome.
const renderPage = async (
  pdfDocument: Awaited<ReturnType<typeof loadPdfDocument>>,
  pageNumber: number,
): Promise<RenderedPage> => {
  const page = await pdfDocument.getPage(pageNumber)
  const viewport = page.getViewport({ scale: RENDER_SCALE })

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D context is not available')
  }

  canvas.width = viewport.width
  canvas.height = viewport.height

  await page.render({ canvasContext: context, viewport, canvas }).promise

  return { canvas, width: viewport.width, height: viewport.height }
}

const createPageSection = (idPrefix: 'left' | 'right', pageNumber: number): HTMLElement => {
  const section = document.createElement('section')
  section.className = 'pdf-page'
  section.id = `${idPrefix}-page-${pageNumber}`

  const label = document.createElement('h3')
  label.className = 'pdf-page-label'
  label.textContent = `Page ${pageNumber}`
  section.append(label)

  return section
}

const appendMissingPage = (section: HTMLElement, message: string) => {
  const note = document.createElement('p')
  note.className = 'page-empty-text'
  note.textContent = message
  section.append(note)
}

const appendCanvas = (section: HTMLElement, rendered: RenderedPage): HTMLElement => {
  const wrap = document.createElement('div')
  wrap.className = 'pdf-page-canvas-wrap'
  wrap.append(rendered.canvas)
  section.append(wrap)
  return wrap
}

/**
 * Render both PDFs page by page as full page images and use OpenCV to compare
 * each pair of pages visually, boxing the regions of the page image that
 * differ. The whole, unedited page is always shown; the OpenCV comparison only
 * adds the difference boxes on top.
 */
export async function renderVisualDiff({ leftFile, rightFile, leftContainer, rightContainer }: VisualDiffOptions): Promise<VisualDiffResult> {
  leftContainer.innerHTML = ''
  rightContainer.innerHTML = ''

  // OpenCV is best-effort: if it fails to initialize we still render every page
  // so the user sees the whole PDF, just without the difference boxes.
  let cv: CV | null = null
  try {
    cv = await loadOpenCv()
  } catch (error) {
    console.warn('[pdfdiff] OpenCV failed to initialize; rendering without difference boxes:', error)
  }

  const [leftDoc, rightDoc] = await Promise.all([
    loadPdfDocument(new Uint8Array(await leftFile.arrayBuffer())),
    loadPdfDocument(new Uint8Array(await rightFile.arrayBuffer())),
  ])

  const maxPages = Math.max(leftDoc.numPages, rightDoc.numPages)

  const pages: PageVisualDiff[] = []
  let totalRegions = 0
  let changedPageCount = 0
  let failedPages = 0

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const leftSection = createPageSection('left', pageNumber)
    const rightSection = createPageSection('right', pageNumber)

    const hasLeft = pageNumber <= leftDoc.numPages
    const hasRight = pageNumber <= rightDoc.numPages

    let leftRendered: RenderedPage | null = null
    let rightRendered: RenderedPage | null = null
    let leftWrap: HTMLElement | null = null
    let rightWrap: HTMLElement | null = null

    try {
      if (hasLeft) {
        leftRendered = await renderPage(leftDoc, pageNumber)
        leftWrap = appendCanvas(leftSection, leftRendered)
      } else {
        appendMissingPage(leftSection, 'This page does not exist in the original PDF.')
      }

      if (hasRight) {
        rightRendered = await renderPage(rightDoc, pageNumber)
        rightWrap = appendCanvas(rightSection, rightRendered)
      } else {
        appendMissingPage(rightSection, 'This page does not exist in the new PDF.')
      }
    } catch (error) {
      failedPages += 1
      console.warn(`[pdfdiff] could not render page ${pageNumber} as an image:`, error)
    }

    let status: PageStatus = 'unchanged'
    let regionCount = 0

    if (hasLeft && hasRight && leftRendered && rightRendered) {
      if (cv && leftWrap && rightWrap) {
        try {
          const boxes = computeDiffBoxes(cv, leftRendered.canvas, rightRendered.canvas)
          regionCount = boxes.length
          if (boxes.length) {
            appendBoxes(leftWrap, boxes)
            appendBoxes(rightWrap, boxes)
            status = 'changed'
          }
        } catch (error) {
          console.warn(`[pdfdiff] could not compute visual diff for page ${pageNumber}:`, error)
        }
      }
    } else if (hasLeft && !hasRight) {
      status = 'removed'
    } else if (!hasLeft && hasRight) {
      status = 'added'
    }

    if (status === 'changed' || status === 'added' || status === 'removed') {
      changedPageCount += 1
    }
    totalRegions += regionCount

    pages.push({ pageNumber, status, regionCount })

    leftContainer.append(leftSection)
    rightContainer.append(rightSection)
  }

  return {
    pages,
    changedPageCount,
    totalRegions,
    failedPages,
    openCvAvailable: cv !== null,
  }
}

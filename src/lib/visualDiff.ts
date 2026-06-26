import { computeDiffBoxes, type DiffBox, type ImageDiffOptions } from './imageDiff'
import { loadPdfDocument } from './pdfLoader'

export type { DiffBox } from './imageDiff'

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
const DIFF_OPTIONS: ImageDiffOptions = {
  threshold: 30,
  blurKernel: 5,
  dilateKernel: 11,
  dilateIterations: 2,
  minRegionAreaFraction: 0.00008,
}

type RenderedPage = {
  canvas: HTMLCanvasElement
  width: number
  height: number
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
 * Render both PDFs page by page as full page images and compare each pair of
 * pages visually with a pure-TypeScript pixel diff, boxing the regions of the
 * page image that differ. The whole, unedited page is always shown; the
 * comparison only adds the difference boxes on top.
 */
export async function renderVisualDiff({ leftFile, rightFile, leftContainer, rightContainer }: VisualDiffOptions): Promise<VisualDiffResult> {
  leftContainer.innerHTML = ''
  rightContainer.innerHTML = ''

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

    if (hasLeft && hasRight && leftRendered && rightRendered && leftWrap && rightWrap) {
      try {
        const boxes = computeDiffBoxes(leftRendered.canvas, rightRendered.canvas, DIFF_OPTIONS)
        regionCount = boxes.length
        if (boxes.length) {
          appendBoxes(leftWrap, boxes)
          appendBoxes(rightWrap, boxes)
          status = 'changed'
        }
      } catch (error) {
        console.warn(`[pdfdiff] could not compute visual diff for page ${pageNumber}:`, error)
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
  }
}

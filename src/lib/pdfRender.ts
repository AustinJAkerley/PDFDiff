import { Util } from 'pdfjs-dist'
import type { PageViewport } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { loadPdfDocument } from './pdfLoader'
import { createTokenRegex } from './tokenize'

type RenderMode = 'added' | 'removed'

export type RenderTextPage = {
  pageNumber: number
  tokens: string[]
}

export type RenderOptions = {
  file: File
  container: HTMLElement
  textPages: RenderTextPage[]
  highlightMap: Map<number, Set<string>>
  mode: RenderMode
  pageBadges?: Map<number, string>
}

const TOKENS_PER_LINE = 20

const chunk = (tokens: string[], size: number) => {
  const chunks: string[][] = []

  for (let i = 0; i < tokens.length; i += size) {
    chunks.push(tokens.slice(i, i + size))
  }

  return chunks
}

export type RenderResult = {
  renderedPages: number
  failedPages: number
}

const appendTextBlock = (pageSection: HTMLElement, tokens: string[], highlighted: Set<string> | undefined, mode: RenderMode) => {
  const textBlock = document.createElement('div')
  textBlock.className = 'pdf-page-text'

  if (!tokens.length) {
    const emptyText = document.createElement('p')
    emptyText.className = 'page-empty-text'
    emptyText.textContent = 'No selectable text found on this page.'
    textBlock.append(emptyText)
  } else {
    for (const lineTokens of chunk(tokens, TOKENS_PER_LINE)) {
      const line = document.createElement('p')
      line.className = 'pdf-page-line'

      for (const token of lineTokens) {
        const tokenEl = document.createElement('span')
        tokenEl.textContent = `${token} `

        if (highlighted?.has(token)) {
          tokenEl.className = mode === 'added' ? 'change-added' : 'change-removed'
        }

        line.append(tokenEl)
      }

      textBlock.append(line)
    }
  }

  pageSection.append(textBlock)
}

// Locate the changed words inside a single text item and emit absolutely
// positioned highlight boxes over the rendered page. Positions are expressed as
// percentages of the page so they stay aligned while the canvas scales
// responsively (the canvas is rendered at `width: 100%`).
const appendItemHighlights = (
  overlay: HTMLElement,
  item: TextItem,
  viewport: PageViewport,
  highlighted: Set<string>,
  mode: RenderMode,
) => {
  const str = item.str
  if (!str) {
    return
  }

  // Map the item's text-space transform into viewport (top-left origin) space.
  const tx = Util.transform(viewport.transform, item.transform)
  const fontHeight = Math.hypot(tx[2], tx[3])
  if (fontHeight <= 0) {
    return
  }

  const itemLeft = tx[4]
  const itemTop = tx[5] - fontHeight
  const itemWidth = item.width * viewport.scale

  const highlightClass = mode === 'added' ? 'pdf-highlight-added' : 'pdf-highlight-removed'

  const tokenRegex = createTokenRegex()
  let match: RegExpExecArray | null
  while ((match = tokenRegex.exec(str)) !== null) {
    const token = match[0].toLowerCase()
    if (!highlighted.has(token)) {
      continue
    }

    // Approximate the word's horizontal span from its character offset within
    // the item; pdf.js does not expose per-glyph positions for text items.
    const startFraction = match.index / str.length
    const widthFraction = match[0].length / str.length
    const wordLeft = itemLeft + itemWidth * startFraction
    const wordWidth = itemWidth * widthFraction

    const box = document.createElement('span')
    box.className = `pdf-highlight ${highlightClass}`
    box.style.left = `${(100 * wordLeft) / viewport.width}%`
    box.style.top = `${(100 * itemTop) / viewport.height}%`
    box.style.width = `${(100 * wordWidth) / viewport.width}%`
    box.style.height = `${(100 * fontHeight) / viewport.height}%`
    overlay.append(box)
  }
}

export async function renderPdfWithHighlights({ file, container, textPages, highlightMap, mode, pageBadges }: RenderOptions): Promise<RenderResult> {
  container.innerHTML = ''

  let pdfDocument
  try {
    pdfDocument = await loadPdfDocument(new Uint8Array(await file.arrayBuffer()))
  } catch {
    const failure = document.createElement('p')
    failure.className = 'page-empty-text'
    failure.textContent = 'This PDF could not be displayed.'
    container.append(failure)
    return { renderedPages: 0, failedPages: 0 }
  }

  let renderedPages = 0
  let failedPages = 0

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const pageSection = document.createElement('section')
    pageSection.className = 'pdf-page'
    pageSection.id = `${mode}-page-${pageNumber}`

    const pageLabel = document.createElement('h3')
    pageLabel.className = 'pdf-page-label'
    pageLabel.textContent = `Page ${pageNumber}`

    const badgeLabel = pageBadges?.get(pageNumber)
    if (badgeLabel) {
      const badge = document.createElement('span')
      badge.className = `classification-badge badge-${badgeLabel.toLowerCase().replace(/[^a-z]+/g, '-')}`
      badge.textContent = badgeLabel
      pageLabel.append(' ', badge)
    }

    pageSection.append(pageLabel)

    const tokens = textPages[pageNumber - 1]?.tokens ?? []
    const highlighted = highlightMap.get(pageNumber)

    let rendered = false

    try {
      const page = await pdfDocument.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1.2 })

      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('Canvas 2D context is not available')
      }

      canvas.width = viewport.width
      canvas.height = viewport.height

      await page.render({ canvasContext: context, viewport, canvas }).promise

      // Wrap the canvas so the highlight overlay can be positioned over it.
      const canvasWrap = document.createElement('div')
      canvasWrap.className = 'pdf-page-canvas-wrap'
      canvasWrap.append(canvas)

      if (highlighted?.size) {
        const overlay = document.createElement('div')
        overlay.className = 'pdf-page-highlight-layer'

        const textContent = await page.getTextContent()
        for (const item of textContent.items) {
          if ('str' in item) {
            appendItemHighlights(overlay, item, viewport, highlighted, mode)
          }
        }

        canvasWrap.append(overlay)
      }

      pageSection.append(canvasWrap)
      renderedPages += 1
      rendered = true
    } catch {
      // A single page may fail to render (for example an unsupported image
      // codec) without preventing the rest of the document from displaying.
      failedPages += 1
      const failure = document.createElement('p')
      failure.className = 'page-empty-text'
      failure.textContent = 'This page could not be displayed.'
      pageSection.append(failure)
    }

    // Only fall back to the reflowed text dump when the page image is
    // unavailable, so the diff is still visible without duplicating the
    // already-highlighted rendered page.
    if (!rendered) {
      appendTextBlock(pageSection, tokens, highlighted, mode)
    }

    container.append(pageSection)
  }

  return { renderedPages, failedPages }
}

import { Util } from 'pdfjs-dist'
import type { PageViewport } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import type { HighlightKind, HighlightMap } from './diffEngine'
import { loadPdfDocument } from './pdfLoader'
import { createTokenRegex } from './tokenize'

export type RenderTextPage = {
  pageNumber: number
  tokens: string[]
}

export type RenderOptions = {
  file: File
  container: HTMLElement
  textPages: RenderTextPage[]
  highlights: HighlightMap
  idPrefix: 'left' | 'right'
  pageBadges?: Map<number, string>
}

const TOKENS_PER_LINE = 20

const HIGHLIGHT_CLASS: Record<HighlightKind, string> = {
  added: 'pdf-highlight-added',
  removed: 'pdf-highlight-removed',
  modified: 'pdf-highlight-modified',
}

const TEXT_CLASS: Record<HighlightKind, string> = {
  added: 'change-added',
  removed: 'change-removed',
  modified: 'change-modified',
}

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

const appendTextBlock = (pageSection: HTMLElement, tokens: string[], highlighted: Map<string, HighlightKind> | undefined) => {
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

        const kind = highlighted?.get(token)
        if (kind) {
          tokenEl.className = TEXT_CLASS[kind]
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
  highlighted: Map<string, HighlightKind>,
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

  const tokenRegex = createTokenRegex()
  let match: RegExpExecArray | null
  while ((match = tokenRegex.exec(str)) !== null) {
    const token = match[0].toLowerCase()
    const kind = highlighted.get(token)
    if (!kind) {
      continue
    }

    // Approximate the word's horizontal span from its character offset within
    // the item; pdf.js does not expose per-glyph positions for text items.
    const startFraction = match.index / str.length
    const widthFraction = match[0].length / str.length
    const wordLeft = itemLeft + itemWidth * startFraction
    const wordWidth = itemWidth * widthFraction

    const box = document.createElement('span')
    box.className = `pdf-highlight ${HIGHLIGHT_CLASS[kind]}`
    box.style.left = `${(100 * wordLeft) / viewport.width}%`
    box.style.top = `${(100 * itemTop) / viewport.height}%`
    box.style.width = `${(100 * wordWidth) / viewport.width}%`
    box.style.height = `${(100 * fontHeight) / viewport.height}%`
    overlay.append(box)
  }
}

export async function renderPdfWithHighlights({ file, container, textPages, highlights, idPrefix, pageBadges }: RenderOptions): Promise<RenderResult> {
  container.innerHTML = ''

  let pdfDocument
  try {
    pdfDocument = await loadPdfDocument(new Uint8Array(await file.arrayBuffer()))
  } catch (loadError) {
    console.warn('[pdfdiff] could not load PDF for rendering:', loadError)
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
    pageSection.id = `${idPrefix}-page-${pageNumber}`

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
    const highlighted = highlights.get(pageNumber)

    let rendered = false

    try {
      const page = await pdfDocument.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1.5 })

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

      // The page image rendered successfully: commit it to the DOM right away.
      // Everything below (highlight overlay) is best-effort decoration and must
      // never be able to discard an already-rendered page — otherwise a PDF
      // that Chrome can display perfectly would fall back to the text dump.
      pageSection.append(canvasWrap)
      renderedPages += 1
      rendered = true

      if (highlighted?.size) {
        try {
          const overlay = document.createElement('div')
          overlay.className = 'pdf-page-highlight-layer'

          const textContent = await page.getTextContent()
          for (const item of textContent.items) {
            if ('str' in item) {
              appendItemHighlights(overlay, item, viewport, highlighted)
            }
          }

          canvasWrap.append(overlay)
        } catch (overlayError) {
          // Losing the diff boxes for a page is acceptable; losing the page
          // image is not. Keep the rendered canvas and just log the problem.
          console.warn(`[pdfdiff] could not overlay diff highlights on page ${pageNumber}:`, overlayError)
        }
      }
    } catch (renderError) {
      // A single page may fail to render (for example an unsupported image
      // codec) without preventing the rest of the document from displaying.
      failedPages += 1
      console.warn(`[pdfdiff] could not render page ${pageNumber} as an image:`, renderError)
      const failure = document.createElement('p')
      failure.className = 'page-empty-text'
      failure.textContent = 'This page could not be displayed.'
      pageSection.append(failure)
    }

    // Only fall back to the reflowed text dump when the page image is
    // unavailable, so the diff is still visible without duplicating the
    // already-highlighted rendered page.
    if (!rendered) {
      appendTextBlock(pageSection, tokens, highlighted)
    }

    container.append(pageSection)
  }

  return { renderedPages, failedPages }
}

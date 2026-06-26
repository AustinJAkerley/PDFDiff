import { loadPdfDocument } from './pdfLoader'

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
      pageSection.append(canvas)
      renderedPages += 1
    } catch {
      // A single page may fail to render (for example an unsupported image
      // codec) without preventing the rest of the document from displaying.
      failedPages += 1
      const failure = document.createElement('p')
      failure.className = 'page-empty-text'
      failure.textContent = 'This page could not be displayed.'
      pageSection.append(failure)
    }

    appendTextBlock(pageSection, tokens, highlighted, mode)
    container.append(pageSection)
  }

  return { renderedPages, failedPages }
}

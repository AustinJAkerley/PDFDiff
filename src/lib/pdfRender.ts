import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

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
}

const chunk = (tokens: string[], size: number) => {
  const chunks: string[][] = []

  for (let i = 0; i < tokens.length; i += size) {
    chunks.push(tokens.slice(i, i + size))
  }

  return chunks
}

export async function renderPdfWithHighlights({ file, container, textPages, highlightMap, mode }: RenderOptions) {
  container.innerHTML = ''

  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const pdfDocument = await loadingTask.promise

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1.2 })

    const pageSection = document.createElement('section')
    pageSection.className = 'pdf-page'
    pageSection.id = `${mode}-page-${pageNumber}`

    const pageLabel = document.createElement('h3')
    pageLabel.className = 'pdf-page-label'
    pageLabel.textContent = `Page ${pageNumber}`

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      continue
    }

    canvas.width = viewport.width
    canvas.height = viewport.height

    await page.render({ canvasContext: context, viewport, canvas }).promise

    const textBlock = document.createElement('div')
    textBlock.className = 'pdf-page-text'

    const tokens = textPages[pageNumber - 1]?.tokens ?? []
    const highlighted = highlightMap.get(pageNumber)

    if (!tokens.length) {
      const emptyText = document.createElement('p')
      emptyText.className = 'page-empty-text'
      emptyText.textContent = 'No selectable text found on this page.'
      textBlock.append(emptyText)
    } else {
      for (const lineTokens of chunk(tokens, 20)) {
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

    pageSection.append(pageLabel, canvas, textBlock)
    container.append(pageSection)
  }
}

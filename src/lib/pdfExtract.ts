import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const TOKEN_REGEX = /[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g

export type ExtractedPdfPage = {
  pageNumber: number
  text: string
  tokens: string[]
}

export type ExtractedPdf = {
  pages: ExtractedPdfPage[]
  pageCount: number
  hasSelectableText: boolean
}

export async function extractPdfText(file: File): Promise<ExtractedPdf> {
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const document = await loadingTask.promise
  const pages: ExtractedPdfPage[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    const tokens = (text.match(TOKEN_REGEX) ?? []).map((token) => token.toLowerCase())
    pages.push({ pageNumber, text, tokens })
  }

  const hasSelectableText = pages.some((page) => page.tokens.length > 0)
  return { pages, pageCount: document.numPages, hasSelectableText }
}

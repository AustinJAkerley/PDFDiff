import { loadPdfDocument } from './pdfLoader'
import { tokenize } from './tokenize'

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
  const document = await loadPdfDocument(new Uint8Array(await file.arrayBuffer()))
  const pages: ExtractedPdfPage[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    const tokens = tokenize(text)
    pages.push({ pageNumber, text, tokens })
  }

  const hasSelectableText = pages.some((page) => page.tokens.length > 0)
  return { pages, pageCount: document.numPages, hasSelectableText }
}

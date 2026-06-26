import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

// Base URL where the copied pdf.js runtime assets live. `diff-page.html` sits
// at the app/extension root, so a relative `pdfjs/` folder resolves correctly
// in both `vite dev` and the packaged extension.
const assetBase = new URL('pdfjs/', document.baseURI).href

let workerConfigured = false

function configureWorker() {
  if (workerConfigured) return
  pdfjs.GlobalWorkerOptions.workerSrc = `${assetBase}pdf.worker.min.mjs`
  workerConfigured = true
}

/**
 * Load a PDF from a blob URL into a pdf.js document. The resource URLs are
 * required by pdf.js v6 to render documents that use CMaps, standard fonts,
 * JBIG2/JPEG2000 (wasm) or ICC color profiles.
 */
export async function loadPdfDocument(url: string): Promise<PDFDocumentProxy> {
  configureWorker()
  const task = pdfjs.getDocument({
    url,
    cMapUrl: `${assetBase}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetBase}standard_fonts/`,
    wasmUrl: `${assetBase}wasm/`,
    iccUrl: `${assetBase}iccs/`,
  })
  return task.promise
}

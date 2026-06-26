import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// pdf.js v6 externalizes several resource bundles instead of inlining them:
// predefined CMaps (for CID/CJK fonts), the standard 14 fonts (used when a PDF
// does not embed Helvetica/Times/etc.), and WebAssembly image decoders for
// JBIG2 and JPEG 2000 (used by scanned/image PDFs). These are copied into the
// extension under `pdfjs/` at build time (see vite.config.ts). Without these
// URLs, pdf.js throws "Ensure that the `<resource>Url` API parameter is
// provided." for any PDF that needs them, which surfaces as failed text
// extraction and failed rendering.

type ChromeRuntime = { runtime?: { getURL?: (path: string) => string } }

const resolveAssetBase = (): string => {
  const runtime = (globalThis as unknown as { chrome?: ChromeRuntime }).chrome
  if (runtime?.runtime?.getURL) {
    return runtime.runtime.getURL('pdfjs/')
  }

  // Fallback for non-extension contexts (for example `vite preview`).
  const base = typeof document !== 'undefined' ? document.baseURI : globalThis.location?.href
  return new URL('pdfjs/', base ?? 'http://localhost/').href
}

const assetBase = resolveAssetBase()

const documentParams = {
  cMapUrl: `${assetBase}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${assetBase}standard_fonts/`,
  wasmUrl: `${assetBase}wasm/`,
  iccUrl: `${assetBase}iccs/`,
}

/**
 * Load a PDF from raw bytes with all of pdf.js's external resource URLs
 * configured. Use this everywhere instead of calling `getDocument` directly so
 * that CMap, standard-font, and WASM image-decoder resources are always
 * available.
 */
export function loadPdfDocument(data: Uint8Array): Promise<PDFDocumentProxy> {
  return getDocument({ data, ...documentParams }).promise
}

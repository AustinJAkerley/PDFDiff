import { cpSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = dirname(fileURLToPath(import.meta.url))
const pdfjsRoot = resolve(projectRoot, 'node_modules/pdfjs-dist')

// pdf.js v6 ships CMaps, the standard 14 fonts, WASM image decoders, and ICC
// profiles as external files. Copy them into the build so the runtime can load
// them via `pdfjs/<dir>/` URLs (see src/lib/pdfLoader.ts). Without these,
// PDFs that use CID/standard fonts or scanned (JBIG2/JPEG2000) images fail to
// extract text or render.
const pdfjsAssets = ['cmaps', 'standard_fonts', 'wasm', 'iccs']

const copyPdfjsAssets = (): Plugin => ({
  name: 'copy-pdfjs-assets',
  apply: 'build',
  closeBundle() {
    const outDir = resolve(projectRoot, 'dist')
    for (const asset of pdfjsAssets) {
      const from = resolve(pdfjsRoot, asset)
      if (existsSync(from)) {
        cpSync(from, resolve(outDir, 'pdfjs', asset), { recursive: true })
      }
    }
  },
})

export default defineConfig({
  plugins: [react(), copyPdfjsAssets()],
  // pdf.js instantiates its worker with `{ type: 'module' }`, so the bundled
  // worker (src/lib/pdfWorker.ts, referenced via `?worker&url`) must be emitted
  // as an ES module rather than the default IIFE format.
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      input: {
        popup: resolve(projectRoot, 'popup.html'),
        diffPage: resolve(projectRoot, 'diff-page.html'),
      },
    },
  },
})

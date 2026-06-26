import { cpSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { ServerResponse } from 'node:http'
import { dirname, join, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)

// Resolve the installed pdfjs-dist package root so we can copy its runtime
// assets (worker, cmaps, fonts, wasm, icc profiles) alongside the built app.
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'))

// Path/name of the pdf.js worker. It is prepended with the getOrInsertComputed
// polyfill so rendering works in the worker on browsers lacking that TC39
// method (Firefox 115, older Chrome, iOS Safari); otherwise pages render black.
const WORKER_FROM = 'build/pdf.worker.min.mjs'
const WORKER_TO = 'pdf.worker.min.mjs'

// Source of the Map/WeakMap getOrInsertComputed polyfill, shared with the main
// thread (imported in src/lib/pdfLoader.ts) so there is a single source of truth.
const polyfillSource = readFileSync(resolve(__dirname, 'src/lib/mapGetOrInsertPolyfill.js'), 'utf8')

function withWorkerPolyfill(workerSource: string): string {
  return `${polyfillSource}\n${workerSource}`
}

// Items copied verbatim into `<out>/pdfjs/`. The worker is handled separately
// so the polyfill can be prepended. The viewer loads them from this stable
// location at runtime (see src/lib/pdfLoader.ts).
const PDFJS_ASSETS: Array<{ from: string; to: string }> = [
  { from: 'cmaps', to: 'cmaps' },
  { from: 'standard_fonts', to: 'standard_fonts' },
  { from: 'wasm', to: 'wasm' },
  { from: 'iccs', to: 'iccs' },
]

// For production builds, copy pdf.js assets into the output `pdfjs/` folder.
function copyPdfjsAssets(): Plugin {
  return {
    name: 'copy-pdfjs-assets',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir ?? resolve(__dirname, 'dist')
      const pdfjsOut = join(outDir, 'pdfjs')
      mkdirSync(pdfjsOut, { recursive: true })
      for (const asset of PDFJS_ASSETS) {
        const src = join(pdfjsRoot, asset.from)
        if (!existsSync(src)) continue
        cpSync(src, join(pdfjsOut, asset.to), { recursive: true })
      }
      // Emit the worker with the polyfill prepended.
      const workerSrc = readFileSync(join(pdfjsRoot, WORKER_FROM), 'utf8')
      writeFileSync(join(pdfjsOut, WORKER_TO), withWorkerPolyfill(workerSrc))
    },
  }
}

// During `vite dev` the assets are not on disk, so serve them straight from
// node_modules under the same `/pdfjs/` path the build uses.
function servePdfjsAssets(): Plugin {
  return {
    name: 'serve-pdfjs-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res: ServerResponse, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
        // Serve the worker (which lives under build/ in the package) with the
        // polyfill prepended, matching what the production build emits.
        if (rel === WORKER_TO) {
          res.setHeader('Content-Type', 'text/javascript')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(withWorkerPolyfill(readFileSync(join(pdfjsRoot, WORKER_FROM), 'utf8')))
          return
        }
        // Resolve and confirm the target stays inside the pdfjs package root to
        // prevent path traversal (e.g. `../../etc/passwd`).
        const target = resolve(pdfjsRoot, rel)
        const inside = target === pdfjsRoot || target.startsWith(pdfjsRoot + sep)
        if (!inside || !existsSync(target) || statSync(target).isDirectory()) {
          next()
          return
        }
        if (target.endsWith('.mjs')) res.setHeader('Content-Type', 'text/javascript')
        else if (target.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm')
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(target).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), copyPdfjsAssets(), servePdfjsAssets()],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        diffPage: resolve(__dirname, 'diff-page.html'),
      },
    },
  },
})

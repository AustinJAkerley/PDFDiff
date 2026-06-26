import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { loadPdfDocument } from '../lib/pdfLoader'

/**
 * A highlight box positioned in page-relative percentages (0-1) so it stays
 * aligned with the page regardless of the rendered scale. `page` is 1-based.
 */
export type Highlight = {
  page: number
  left: number
  top: number
  width: number
  height: number
  className?: string
}

type Props = {
  url: string
  highlights?: Highlight[]
  ariaLabel?: string
}

type PageEntry = {
  page: PDFPageProxy
  wrap: HTMLDivElement
  canvas: HTMLCanvasElement
  overlay: HTMLDivElement
}

// Render the given highlights into each page's overlay layer, replacing any
// previously drawn boxes. Positions are percentage-based so they remain aligned
// with the page at any render scale.
function applyHighlights(pages: PageEntry[], highlights: Highlight[] | undefined) {
  for (const entry of pages) {
    entry.overlay.replaceChildren()
  }
  for (const hl of highlights ?? []) {
    const entry = pages[hl.page - 1]
    if (!entry) continue
    const box = document.createElement('div')
    box.className = hl.className ? `pdf-highlight ${hl.className}` : 'pdf-highlight'
    box.style.left = `${hl.left * 100}%`
    box.style.top = `${hl.top * 100}%`
    box.style.width = `${hl.width * 100}%`
    box.style.height = `${hl.height * 100}%`
    entry.overlay.appendChild(box)
  }
}

export default function PdfViewer({ url, highlights, ariaLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  // Keep the latest highlights in a ref so re-rendering pages (on resize) can
  // re-apply them without re-running the whole load effect.
  const highlightsRef = useRef<Highlight[] | undefined>(highlights)
  const pagesRef = useRef<PageEntry[]>([])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let doc: PDFDocumentProxy | null = null
    const renderTasks = new Set<RenderTask>()

    setError(null)
    container.replaceChildren()
    pagesRef.current = []

    const renderPage = async (entry: PageEntry) => {
      const { page, wrap, canvas } = entry
      const width = container.clientWidth || page.getViewport({ scale: 1 }).width
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = width / baseViewport.width
      const viewport = page.getViewport({ scale })
      const dpr = Math.min(window.devicePixelRatio || 1, 2)

      wrap.style.width = `${viewport.width}px`
      wrap.style.height = `${viewport.height}px`
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const task = page.render({ canvas, canvasContext: ctx, viewport })
      renderTasks.add(task)
      try {
        await task.promise
      } catch {
        // Cancelled renders (e.g. on resize/unmount) throw; ignore them.
      } finally {
        renderTasks.delete(task)
      }
    }

    const applyHighlightsNow = () => applyHighlights(pagesRef.current, highlightsRef.current)

    const load = async () => {
      try {
        doc = await loadPdfDocument(url)
        if (cancelled) return

        for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
          const page = await doc.getPage(pageNum)
          if (cancelled) return

          const wrap = document.createElement('div')
          wrap.className = 'pdf-page-canvas-wrap'
          const canvas = document.createElement('canvas')
          canvas.className = 'pdf-page-canvas'
          const overlay = document.createElement('div')
          overlay.className = 'pdf-page-highlight-layer'
          wrap.append(canvas, overlay)
          container.appendChild(wrap)

          const entry: PageEntry = { page, wrap, canvas, overlay }
          pagesRef.current.push(entry)
          await renderPage(entry)
        }
        if (!cancelled) applyHighlightsNow()
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render PDF.')
        }
      }
    }

    void load()

    // Re-render at the new width when the container resizes.
    let resizeTimer: number | undefined
    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        if (cancelled) return
        void (async () => {
          for (const entry of pagesRef.current) {
            await renderPage(entry)
          }
          applyHighlightsNow()
        })()
      }, 150)
    })
    observer.observe(container)

    return () => {
      cancelled = true
      observer.disconnect()
      window.clearTimeout(resizeTimer)
      for (const task of renderTasks) task.cancel()
      for (const entry of pagesRef.current) entry.page.cleanup()
      pagesRef.current = []
      void doc?.loadingTask.destroy()
    }
  }, [url])

  // Re-apply highlights when they change without reloading the document.
  useEffect(() => {
    highlightsRef.current = highlights
    applyHighlights(pagesRef.current, highlights)
  }, [highlights])

  return (
    <div className="pdf-canvas-scroll" aria-label={ariaLabel}>
      {error ? <p className="pdf-fallback">{error}</p> : null}
      <div ref={containerRef} className="pdf-canvas-pages" />
    </div>
  )
}

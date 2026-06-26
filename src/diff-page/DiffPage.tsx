import { useMemo, useRef, useState } from 'react'
import { renderVisualDiff, type PageVisualDiff, type VisualDiffResult } from '../lib/visualDiff'

type Side = 'left' | 'right'

const STATUS_LABEL: Record<PageVisualDiff['status'], string> = {
  changed: 'Changed',
  unchanged: 'Unchanged',
  added: 'Added page',
  removed: 'Removed page',
}

function UploadZone({ label, ready, onFileSelected }: { label: string; ready: boolean; onFileSelected: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file?.type === 'application/pdf') {
      onFileSelected(file)
    }
  }

  return (
    <div
      className={`upload-zone${ready ? ' upload-zone-ready' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          inputRef.current?.click()
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            onFileSelected(file)
          }
        }}
      />
      <strong>{label}</strong>
      <p>Drag and drop a PDF here, or click to choose a file.</p>
    </div>
  )
}

function SummaryBar({ result }: { result: VisualDiffResult }) {
  return (
    <div className="summary-bar">
      <div className="summary-counts">
        <span className="summary-chip chip-modified">
          <span className="chip-swatch" /> {result.changedPageCount} pages changed
        </span>
        <span className="summary-chip chip-added">
          <span className="chip-swatch" /> {result.totalRegions} difference regions
        </span>
        <span className="summary-total">{result.pages.length} pages compared</span>
      </div>
    </div>
  )
}

export default function DiffPage() {
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [newFile, setNewFile] = useState<File | null>(null)
  const [result, setResult] = useState<VisualDiffResult | null>(null)
  const [activeChangeIndex, setActiveChangeIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renderNotice, setRenderNotice] = useState<string | null>(null)

  const leftContainerRef = useRef<HTMLDivElement>(null)
  const rightContainerRef = useRef<HTMLDivElement>(null)

  const processFiles = async (left: File, right: File) => {
    if (!leftContainerRef.current || !rightContainerRef.current) {
      return
    }

    setIsLoading(true)
    setError(null)
    setRenderNotice(null)
    setActiveChangeIndex(0)

    try {
      const diff = await renderVisualDiff({
        leftFile: left,
        rightFile: right,
        leftContainer: leftContainerRef.current,
        rightContainer: rightContainerRef.current,
      })
      setResult(diff)

      const notices: string[] = []
      if (!diff.openCvAvailable) {
        notices.push('The image comparison engine could not start, so the PDFs are shown without difference boxes.')
      }
      if (diff.failedPages > 0) {
        notices.push('Some pages could not be displayed as images.')
      }
      setRenderNotice(notices.length ? notices.join(' ') : null)
    } catch (diffError) {
      const detail = diffError instanceof Error ? ` (${diffError.message})` : ''
      setError(`Unable to compare the PDFs. Please try different files.${detail}`)
      setResult(null)
    } finally {
      setIsLoading(false)
    }
  }

  const changedPages = useMemo(
    () => (result?.pages ?? []).filter((page) => page.status !== 'unchanged'),
    [result],
  )
  const activeChange = useMemo(() => changedPages[activeChangeIndex] ?? null, [activeChangeIndex, changedPages])

  const scrollToPage = (pageNumber: number) => {
    document.getElementById(`left-page-${pageNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    document.getElementById(`right-page-${pageNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const selectChange = (index: number) => {
    if (!changedPages.length) {
      return
    }
    // Wrap around both ends so Previous/Next cycle through the list; the
    // extra `+ changedPages.length` keeps the result non-negative for index -1.
    const clamped = (index + changedPages.length) % changedPages.length
    setActiveChangeIndex(clamped)
    scrollToPage(changedPages[clamped].pageNumber)
  }

  const handleFileSelected = (side: Side, file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Please select a valid PDF file.')
      return
    }

    const left = side === 'left' ? file : originalFile
    const right = side === 'right' ? file : newFile

    setError(null)
    setResult(null)
    setActiveChangeIndex(0)

    if (side === 'left') {
      setOriginalFile(file)
    } else {
      setNewFile(file)
    }

    if (left && right) {
      void processFiles(left, right)
    }
  }

  return (
    <main className="diff-page-root">
      <header className="diff-header">
        <h1>PDF Diff</h1>
        <p className="privacy-note">
          Compare two PDFs side by side. Each page is rendered as an image and compared visually with OpenCV. Everything is
          processed locally in your browser and never uploaded.
        </p>
      </header>

      <section className="upload-grid">
        <UploadZone
          label={originalFile ? `Original: ${originalFile.name}` : 'Original PDF'}
          ready={Boolean(originalFile)}
          onFileSelected={(file) => handleFileSelected('left', file)}
        />
        <UploadZone
          label={newFile ? `New: ${newFile.name}` : 'New PDF'}
          ready={Boolean(newFile)}
          onFileSelected={(file) => handleFileSelected('right', file)}
        />
      </section>

      {error ? <p className="error-message">{error}</p> : null}
      {renderNotice ? <p className="render-notice">{renderNotice}</p> : null}
      {isLoading ? <p className="loading-note">Rendering pages and comparing images…</p> : null}

      {result ? (
        <section className="results">
          <SummaryBar result={result} />

          <div className="legend">
            <span className="legend-item">
              <span className="legend-swatch swatch-visual" /> Visual difference
            </span>
          </div>

          {changedPages.length ? (
            <div className="navigator">
              <div className="navigator-controls">
                <button className="secondary-button" onClick={() => selectChange(activeChangeIndex - 1)}>
                  ← Previous
                </button>
                <span className="navigator-status">
                  Change {activeChangeIndex + 1} of {changedPages.length}
                </span>
                <button className="secondary-button" onClick={() => selectChange(activeChangeIndex + 1)}>
                  Next →
                </button>
              </div>
              <ol className="change-list">
                {changedPages.map((page, index) => (
                  <li key={page.pageNumber}>
                    <button
                      type="button"
                      className={`change-row change-row-modified${index === activeChangeIndex ? ' change-row-active' : ''}`}
                      onClick={() => selectChange(index)}
                    >
                      <span className="change-row-meta">
                        <span className="change-dot dot-modified" aria-hidden="true" />
                        <span className="change-kind">{STATUS_LABEL[page.status]}</span>
                        <span className="change-page">Page {page.pageNumber}</span>
                      </span>
                      <span className="change-row-detail">
                        {page.regionCount > 0
                          ? `${page.regionCount} difference region${page.regionCount === 1 ? '' : 's'}`
                          : STATUS_LABEL[page.status]}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="no-changes">No visual differences detected between the two PDFs.</p>
          )}

          {activeChange ? (
            <p className="active-change-note">
              Showing page {activeChange.pageNumber}. {STATUS_LABEL[activeChange.status]}.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="viewer-grid">
        <article className="viewer-column">
          <h2 className="viewer-heading">
            <span className="viewer-dot dot-removed" aria-hidden="true" />
            Original PDF
          </h2>
          <div ref={leftContainerRef} className="pdf-container" />
        </article>
        <article className="viewer-column">
          <h2 className="viewer-heading">
            <span className="viewer-dot dot-added" aria-hidden="true" />
            New PDF
          </h2>
          <div ref={rightContainerRef} className="pdf-container" />
        </article>
      </section>
    </main>
  )
}

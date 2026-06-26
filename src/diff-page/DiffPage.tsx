import { useMemo, useRef, useState } from 'react'
import { buildDiff, type DiffChange, type DiffResult } from '../lib/diffEngine'
import { getChangeCategoryLabel, type ChangeCategory } from '../lib/changeClassify'
import {
  classifyPdf,
  getClassificationBadgeLabel,
  getDiffStrategy,
  type PdfClassificationResult,
} from '../lib/pdfClassify'
import { extractPdfText, type ExtractedPdf } from '../lib/pdfExtract'
import { renderPdfWithHighlights } from '../lib/pdfRender'

type Side = 'left' | 'right'

const KIND_LABEL: Record<DiffChange['type'], string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
}

const buildBadgeMap = (classification: PdfClassificationResult | null): Map<number, string> => {
  const badges = new Map<number, string>()
  if (classification) {
    for (const page of classification.pages) {
      badges.set(page.pageNumber, getClassificationBadgeLabel(page.type))
    }
  }
  return badges
}

function ClassificationBadge({ label }: { label: string }) {
  const modifier = label.toLowerCase().replace(/[^a-z]+/g, '-')
  return <span className={`classification-badge badge-${modifier}`}>{label}</span>
}

function ClassificationDebug({ title, classification }: { title: string; classification: PdfClassificationResult }) {
  return (
    <details className="classification-debug">
      <summary>
        Page-type signals — {title} (document: {getClassificationBadgeLabel(classification.documentType)})
      </summary>
      <table className="classification-debug-table">
        <thead>
          <tr>
            <th>Page</th>
            <th>Type</th>
            <th>Strategy</th>
            <th>Text items</th>
            <th>Words</th>
            <th>Images</th>
            <th>Image coverage</th>
            <th>Vectors</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {classification.pages.map((page) => (
            <tr key={page.pageNumber}>
              <td>{page.pageNumber}</td>
              <td>{page.type}</td>
              <td>{getDiffStrategy(page.type)}</td>
              <td>{page.signals.textItemCount}</td>
              <td>{page.signals.wordCount}</td>
              <td>{page.signals.imageCount ?? 0}</td>
              <td>{((page.signals.estimatedImageCoverage ?? 0) * 100).toFixed(0)}%</td>
              <td>{page.signals.vectorObjectCount ?? 0}</td>
              <td>{(page.signals.confidence * 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
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

function SummaryBar({ summary }: { summary: DiffResult['summary'] }) {
  const categories = (Object.entries(summary.byCategory) as Array<[ChangeCategory, number]>).filter(([, count]) => count > 0)

  return (
    <div className="summary-bar">
      <div className="summary-counts">
        <span className="summary-chip chip-modified">
          <span className="chip-swatch" /> {summary.modified} modified
        </span>
        <span className="summary-chip chip-removed">
          <span className="chip-swatch" /> {summary.removed} removed
        </span>
        <span className="summary-chip chip-added">
          <span className="chip-swatch" /> {summary.added} added
        </span>
        <span className="summary-total">{summary.total} total changes</span>
      </div>
      {categories.length ? (
        <div className="summary-categories">
          <span className="summary-categories-label">By type:</span>
          {categories.map(([category, count]) => (
            <span key={category} className={`category-badge category-${category}`}>
              {getChangeCategoryLabel(category)} · {count}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ChangeRow({ change, active, onSelect }: { change: DiffChange; active: boolean; onSelect: () => void }) {
  return (
    <li>
      <button type="button" className={`change-row change-row-${change.type}${active ? ' change-row-active' : ''}`} onClick={onSelect}>
        <span className="change-row-meta">
          <span className={`change-dot dot-${change.type}`} aria-hidden="true" />
          <span className="change-kind">{KIND_LABEL[change.type]}</span>
          <span className={`category-badge category-${change.category}`}>{getChangeCategoryLabel(change.category)}</span>
          <span className="change-page">Page {change.pageNumber}</span>
        </span>
        <span className="change-row-detail">
          {change.before ? <span className="change-before">{change.before}</span> : null}
          {change.before && change.after ? <span className="change-arrow" aria-hidden="true">→</span> : null}
          {change.after ? <span className="change-after">{change.after}</span> : null}
        </span>
      </button>
    </li>
  )
}

export default function DiffPage() {
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [newFile, setNewFile] = useState<File | null>(null)
  const [originalText, setOriginalText] = useState<ExtractedPdf | null>(null)
  const [newText, setNewText] = useState<ExtractedPdf | null>(null)
  const [originalClassification, setOriginalClassification] = useState<PdfClassificationResult | null>(null)
  const [newClassification, setNewClassification] = useState<PdfClassificationResult | null>(null)
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
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

    let originalExtraction: ExtractedPdf
    let newExtraction: ExtractedPdf

    try {
      const extractions = await Promise.all([extractPdfText(left), extractPdfText(right)])
      originalExtraction = extractions[0]
      newExtraction = extractions[1]
    } catch (extractionError) {
      const detail = extractionError instanceof Error ? ` (${extractionError.message})` : ''
      setError(`Unable to read one or both PDFs. Please try different files.${detail}`)
      setIsLoading(false)
      return
    }

    // Classification is supplementary metadata for badges/routing and must never
    // prevent the diff from being shown. Failures degrade to "no classification".
    const [originalClass, newClass] = await Promise.all([
      classifyPdf(left).catch(() => null),
      classifyPdf(right).catch(() => null),
    ])

    const diff = buildDiff(originalExtraction.pages, newExtraction.pages)
    setOriginalText(originalExtraction)
    setNewText(newExtraction)
    setOriginalClassification(originalClass)
    setNewClassification(newClass)
    setDiffResult(diff)
    setActiveChangeIndex(0)

    // Rendering is best-effort: a failure here (for example an unsupported
    // image codec on a scanned PDF) must not hide the computed differences.
    try {
      const [leftResult, rightResult] = await Promise.all([
        renderPdfWithHighlights({
          file: left,
          container: leftContainerRef.current,
          textPages: originalExtraction.pages,
          highlights: diff.leftHighlights,
          idPrefix: 'left',
          pageBadges: buildBadgeMap(originalClass),
        }),
        renderPdfWithHighlights({
          file: right,
          container: rightContainerRef.current,
          textPages: newExtraction.pages,
          highlights: diff.rightHighlights,
          idPrefix: 'right',
          pageBadges: buildBadgeMap(newClass),
        }),
      ])

      if (leftResult.failedPages > 0 || rightResult.failedPages > 0) {
        setRenderNotice('Some pages could not be displayed as images, but their detected differences are still shown.')
      }
    } catch {
      setRenderNotice('The PDF previews could not be displayed, but detected text differences are still shown.')
    } finally {
      setIsLoading(false)
    }
  }

  const changes = useMemo(() => diffResult?.changes ?? [], [diffResult])
  const activeChange = useMemo(() => changes[activeChangeIndex] ?? null, [activeChangeIndex, changes])

  const scrollToPage = (pageNumber: number) => {
    document.getElementById(`left-page-${pageNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    document.getElementById(`right-page-${pageNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const selectChange = (index: number) => {
    if (!changes.length) {
      return
    }
    // Wrap around both ends so Previous/Next cycle through the list; the
    // extra `+ changes.length` keeps the result non-negative for index -1.
    const clamped = (index + changes.length) % changes.length
    setActiveChangeIndex(clamped)
    scrollToPage(changes[clamped].pageNumber)
  }

  const handleFileSelected = (side: Side, file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Please select a valid PDF file.')
      return
    }

    const left = side === 'left' ? file : originalFile
    const right = side === 'right' ? file : newFile

    setError(null)
    setOriginalText(null)
    setNewText(null)
    setOriginalClassification(null)
    setNewClassification(null)
    setDiffResult(null)
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
          Compare two PDFs side by side. Everything is processed locally in your browser and never uploaded.
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
      {isLoading ? <p className="loading-note">Processing PDFs…</p> : null}

      {originalText && !originalText.hasSelectableText ? <p className="scan-warning">No selectable text found in the original PDF. It may be scanned.</p> : null}
      {newText && !newText.hasSelectableText ? <p className="scan-warning">No selectable text found in the new PDF. It may be scanned.</p> : null}

      {diffResult ? (
        <section className="results">
          <SummaryBar summary={diffResult.summary} />

          <div className="legend">
            <span className="legend-item">
              <span className="legend-swatch swatch-removed" /> Removed (original)
            </span>
            <span className="legend-item">
              <span className="legend-swatch swatch-modified" /> Modified (both)
            </span>
            <span className="legend-item">
              <span className="legend-swatch swatch-added" /> Added (new)
            </span>
          </div>

          {changes.length ? (
            <div className="navigator">
              <div className="navigator-controls">
                <button className="secondary-button" onClick={() => selectChange(activeChangeIndex - 1)}>
                  ← Previous
                </button>
                <span className="navigator-status">
                  Change {activeChangeIndex + 1} of {changes.length}
                </span>
                <button className="secondary-button" onClick={() => selectChange(activeChangeIndex + 1)}>
                  Next →
                </button>
              </div>
              <ol className="change-list">
                {changes.map((change, index) => (
                  <ChangeRow key={change.id} change={change} active={index === activeChangeIndex} onSelect={() => selectChange(index)} />
                ))}
              </ol>
            </div>
          ) : (
            <p className="no-changes">No differences detected between the two PDFs.</p>
          )}

          {activeChange ? (
            <p className="active-change-note">
              Showing page {activeChange.pageNumber}. {getChangeCategoryLabel(activeChange.category)} {KIND_LABEL[activeChange.type].toLowerCase()}.
            </p>
          ) : null}
        </section>
      ) : null}

      {originalClassification ? <ClassificationDebug title="Original PDF" classification={originalClassification} /> : null}
      {newClassification ? <ClassificationDebug title="New PDF" classification={newClassification} /> : null}

      <section className="viewer-grid">
        <article className="viewer-column">
          <h2 className="viewer-heading">
            <span className="viewer-dot dot-removed" aria-hidden="true" />
            Original PDF
            {originalClassification ? <ClassificationBadge label={getClassificationBadgeLabel(originalClassification.documentType)} /> : null}
          </h2>
          <div ref={leftContainerRef} className="pdf-container" />
        </article>
        <article className="viewer-column">
          <h2 className="viewer-heading">
            <span className="viewer-dot dot-added" aria-hidden="true" />
            New PDF
            {newClassification ? <ClassificationBadge label={getClassificationBadgeLabel(newClassification.documentType)} /> : null}
          </h2>
          <div ref={rightContainerRef} className="pdf-container" />
        </article>
      </section>
    </main>
  )
}

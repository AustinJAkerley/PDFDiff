import { useMemo, useRef, useState } from 'react'
import { buildDiff, type DiffResult } from '../lib/diffEngine'
import { extractPdfText, type ExtractedPdf } from '../lib/pdfExtract'
import { renderPdfWithHighlights } from '../lib/pdfRender'

type Side = 'left' | 'right'

function UploadZone({ label, onFileSelected }: { label: string; onFileSelected: (file: File) => void }) {
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
      className="upload-zone"
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

export default function DiffPage() {
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [newFile, setNewFile] = useState<File | null>(null)
  const [originalText, setOriginalText] = useState<ExtractedPdf | null>(null)
  const [newText, setNewText] = useState<ExtractedPdf | null>(null)
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
    } catch {
      setError('Unable to read one or both PDFs. Please try different files.')
      setIsLoading(false)
      return
    }

    const diff = buildDiff(originalExtraction.pages, newExtraction.pages)
    setOriginalText(originalExtraction)
    setNewText(newExtraction)
    setDiffResult(diff)

    // Rendering is best-effort: a failure here (for example an unsupported
    // image codec on a scanned PDF) must not hide the computed differences.
    try {
      const [leftResult, rightResult] = await Promise.all([
        renderPdfWithHighlights({
          file: left,
          container: leftContainerRef.current,
          textPages: originalExtraction.pages,
          highlightMap: diff.removedByPage,
          mode: 'removed',
        }),
        renderPdfWithHighlights({
          file: right,
          container: rightContainerRef.current,
          textPages: newExtraction.pages,
          highlightMap: diff.addedByPage,
          mode: 'added',
        }),
      ])

      if (leftResult.failedPages > 0 || rightResult.failedPages > 0) {
        setRenderNotice('Some pages could not be displayed, but detected text differences are still shown.')
      }
    } catch {
      setRenderNotice('The PDF previews could not be displayed, but detected text differences are still shown.')
    } finally {
      setIsLoading(false)
    }
  }

  const activeChange = useMemo(() => diffResult?.changes[activeChangeIndex] ?? null, [activeChangeIndex, diffResult])

  const navigate = (direction: 1 | -1) => {
    if (!diffResult || !diffResult.changes.length) {
      return
    }

    const nextIndex = (activeChangeIndex + direction + diffResult.changes.length) % diffResult.changes.length
    setActiveChangeIndex(nextIndex)

    const pageNumber = diffResult.changes[nextIndex].pageNumber
    document.getElementById(`removed-page-${pageNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    document.getElementById(`added-page-${pageNumber}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
        <p className="privacy-note">PDFs are processed locally in your browser and are never uploaded.</p>
      </header>

      <section className="upload-grid">
        <UploadZone label={originalFile ? `Original: ${originalFile.name}` : 'Original PDF'} onFileSelected={(file) => handleFileSelected('left', file)} />
        <UploadZone label={newFile ? `New: ${newFile.name}` : 'New PDF'} onFileSelected={(file) => handleFileSelected('right', file)} />
      </section>

      <section className="change-panel" aria-live="polite">
        <strong>Total changes: {diffResult?.changes.length ?? 0}</strong>
        <div className="change-actions">
          <button className="secondary-button" onClick={() => navigate(-1)} disabled={!diffResult?.changes.length}>
            Previous change
          </button>
          <button className="secondary-button" onClick={() => navigate(1)} disabled={!diffResult?.changes.length}>
            Next change
          </button>
        </div>
        {activeChange ? (
          <p>
            Change {activeChangeIndex + 1}/{diffResult?.changes.length} • Page {activeChange.pageNumber} • {activeChange.type} • "{activeChange.text}"
          </p>
        ) : (
          <p>No changes detected yet.</p>
        )}
      </section>

      {error ? <p className="error-message">{error}</p> : null}
      {renderNotice ? <p className="render-notice">{renderNotice}</p> : null}
      {isLoading ? <p>Processing PDFs...</p> : null}

      {originalText && !originalText.hasSelectableText ? <p className="scan-warning">No selectable text found in the original PDF. It may be scanned.</p> : null}
      {newText && !newText.hasSelectableText ? <p className="scan-warning">No selectable text found in the new PDF. It may be scanned.</p> : null}

      <section className="viewer-grid">
        <article>
          <h2>Original PDF</h2>
          <div ref={leftContainerRef} className="pdf-container" />
        </article>
        <article>
          <h2>New PDF</h2>
          <div ref={rightContainerRef} className="pdf-container" />
        </article>
      </section>
    </main>
  )
}

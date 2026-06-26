import { useEffect, useRef, useState } from 'react'
import PdfViewer, { type Highlight } from './PdfViewer'
import BrowserSupportWarning from '../components/BrowserSupportWarning'
import { computeDiffHighlights } from '../lib/pdfDiff'

type Side = 'left' | 'right'

function PdfPane({
  label,
  url,
  fileName,
  highlights,
  onFileSelected,
}: {
  label: string
  url: string | null
  fileName: string | null
  highlights?: Highlight[]
  onFileSelected: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file && file.type === 'application/pdf') {
      onFileSelected(file)
    }
  }

  return (
    <section className="pdf-pane">
      <div className="pdf-pane-toolbar">
        <span className="pdf-pane-label">{fileName ?? label}</span>
        <button type="button" className="choose-button" onClick={() => inputRef.current?.click()}>
          {fileName ? 'Change PDF' : 'Choose PDF'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>

      {url ? (
        <PdfViewer url={url} highlights={highlights} ariaLabel={fileName ?? label} />
      ) : (
        <div
          className="pdf-dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            handleFiles(event.dataTransfer.files)
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              inputRef.current?.click()
            }
          }}
        >
          <strong>{label}</strong>
          <p>Drag and drop a PDF here, or click to choose a file.</p>
        </div>
      )}
    </section>
  )
}

export default function DiffPage() {
  const [leftUrl, setLeftUrl] = useState<string | null>(null)
  const [rightUrl, setRightUrl] = useState<string | null>(null)
  const [leftName, setLeftName] = useState<string | null>(null)
  const [rightName, setRightName] = useState<string | null>(null)
  const [leftHighlights, setLeftHighlights] = useState<Highlight[]>([])
  const [rightHighlights, setRightHighlights] = useState<Highlight[]>([])
  const [diffStatus, setDiffStatus] = useState<'idle' | 'computing' | 'ready' | 'error'>('idle')

  // Recompute the diff whenever both PDFs are present (or one changes). The
  // effect guards against races by ignoring results from a superseded run.
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!leftUrl || !rightUrl) {
        if (cancelled) return
        setLeftHighlights([])
        setRightHighlights([])
        setDiffStatus('idle')
        return
      }

      setDiffStatus('computing')
      setLeftHighlights([])
      setRightHighlights([])

      try {
        const result = await computeDiffHighlights(leftUrl, rightUrl)
        if (cancelled) return
        setLeftHighlights(result.left)
        setRightHighlights(result.right)
        setDiffStatus('ready')
      } catch {
        if (cancelled) return
        setDiffStatus('error')
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [leftUrl, rightUrl])

  const sides: Record<
    Side,
    {
      setUrl: React.Dispatch<React.SetStateAction<string | null>>
      setName: React.Dispatch<React.SetStateAction<string | null>>
    }
  > = {
    left: { setUrl: setLeftUrl, setName: setLeftName },
    right: { setUrl: setRightUrl, setName: setRightName },
  }

  const handleFileSelected = (side: Side, file: File) => {
    const url = URL.createObjectURL(file)

    // URL.createObjectURL always returns a same-origin blob: URL, never a
    // script-executable scheme. Verify defensively before rendering it.
    if (!url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
      return
    }

    const { setUrl, setName } = sides[side]
    setUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return url
    })
    setName(file.name)
  }

  return (
    <main className="viewer-root">
      <header className="viewer-header">
        <h1>PDF Side by Side</h1>
        <p className="privacy-note">PDFs are opened locally in your browser and are never uploaded.</p>
        <DiffLegend status={diffStatus} />
      </header>

      <BrowserSupportWarning />

      <div className="viewer-grid">
        <PdfPane
          label="Left PDF"
          url={leftUrl}
          fileName={leftName}
          highlights={leftHighlights}
          onFileSelected={(file) => handleFileSelected('left', file)}
        />
        <PdfPane
          label="Right PDF"
          url={rightUrl}
          fileName={rightName}
          highlights={rightHighlights}
          onFileSelected={(file) => handleFileSelected('right', file)}
        />
      </div>
    </main>
  )
}

// Explains the diff colors and surfaces the current diff computation status.
function DiffLegend({ status }: { status: 'idle' | 'computing' | 'ready' | 'error' }) {
  const message =
    status === 'computing'
      ? 'Comparing PDFs…'
      : status === 'error'
        ? 'Could not compare these PDFs.'
        : status === 'idle'
          ? 'Load a PDF on each side to see the differences.'
          : null

  return (
    <div className="diff-legend" aria-live="polite">
      <span className="diff-legend-item">
        <span className="diff-swatch diff-swatch--added" /> Added
      </span>
      <span className="diff-legend-item">
        <span className="diff-swatch diff-swatch--removed" /> Removed
      </span>
      <span className="diff-legend-item">
        <span className="diff-swatch diff-swatch--modified" /> Modified
      </span>
      {message ? <span className="diff-legend-status">{message}</span> : null}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'

type Side = 'left' | 'right'

function PdfPane({
  label,
  url,
  fileName,
  onFileSelected,
}: {
  label: string
  url: string | null
  fileName: string | null
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
        <iframe className="pdf-frame" src={url} title={fileName ?? label} />
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

  useEffect(() => () => {
    if (leftUrl) URL.revokeObjectURL(leftUrl)
  }, [leftUrl])

  useEffect(() => () => {
    if (rightUrl) URL.revokeObjectURL(rightUrl)
  }, [rightUrl])

  const handleFileSelected = (side: Side, file: File) => {
    const url = URL.createObjectURL(file)
    if (side === 'left') {
      setLeftUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return url
      })
      setLeftName(file.name)
    } else {
      setRightUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return url
      })
      setRightName(file.name)
    }
  }

  return (
    <main className="viewer-root">
      <header className="viewer-header">
        <h1>PDF Side by Side</h1>
        <p className="privacy-note">PDFs are opened locally in your browser and are never uploaded.</p>
      </header>

      <div className="viewer-grid">
        <PdfPane
          label="Left PDF"
          url={leftUrl}
          fileName={leftName}
          onFileSelected={(file) => handleFileSelected('left', file)}
        />
        <PdfPane
          label="Right PDF"
          url={rightUrl}
          fileName={rightName}
          onFileSelected={(file) => handleFileSelected('right', file)}
        />
      </div>
    </main>
  )
}

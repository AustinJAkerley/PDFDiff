import { useRef, useState } from 'react'

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
        <object className="pdf-frame" data={url} type="application/pdf" aria-label={fileName ?? label}>
          <p className="pdf-fallback">This PDF could not be displayed inline.</p>
        </object>
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

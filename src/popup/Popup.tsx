export default function Popup({ onOpen }: { onOpen: () => void }) {
  return (
    <main className="popup-root">
      <h1>PDF Diff</h1>
      <button className="primary-button" onClick={onOpen}>
        Open PDF Diff
      </button>
      <p className="privacy-note">PDFs are processed locally in your browser and are never uploaded.</p>
    </main>
  )
}

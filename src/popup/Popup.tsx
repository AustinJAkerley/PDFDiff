import BrowserSupportWarning from '../components/BrowserSupportWarning'

export default function Popup({ onOpen }: { onOpen: () => void }) {
  return (
    <main className="popup-root">
      <h1>PDF Side by Side</h1>
      <BrowserSupportWarning />
      <button className="primary-button" onClick={onOpen}>
        Open viewer
      </button>
      <p className="privacy-note">PDFs are opened locally in your browser and are never uploaded.</p>
    </main>
  )
}

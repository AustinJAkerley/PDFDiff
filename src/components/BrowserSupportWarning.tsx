import { detectBrowserSupport, MIN_CHROME_MAJOR_VERSION } from '../lib/browserSupport'

/**
 * Shows a warning banner when the extension is running on a Chrome/Chromium
 * version that is too old to render PDFs correctly. Renders nothing on
 * supported browsers.
 */
export default function BrowserSupportWarning() {
  const { chromeVersion, isUnsupportedChrome } = detectBrowserSupport()

  if (!isUnsupportedChrome) return null

  return (
    <div className="browser-warning" role="alert">
      <strong>Your browser is too old.</strong>
      <p>
        This extension needs Chrome {MIN_CHROME_MAJOR_VERSION} or newer to display PDFs.
        {chromeVersion !== null ? ` You are on Chrome ${chromeVersion}.` : ''} Please update
        your browser if PDFs appear blank or fail to load.
      </p>
    </div>
  )
}

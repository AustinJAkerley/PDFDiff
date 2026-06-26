// The lowest Chrome/Chromium major version this extension is known to work on.
// pdf.js v6 and the rest of the modern toolchain rely on browser features that
// are missing or broken on older Chromium builds, so the viewer renders blank
// or fails outright there. This was reproduced on Chrome 112; bumping to a
// recent Chrome (143) fixed it. We warn below this threshold.
export const MIN_CHROME_MAJOR_VERSION = 120

export type BrowserSupport = {
  /** Detected Chrome/Chromium major version, or null if it could not be parsed. */
  chromeVersion: number | null
  /** True when running on a Chromium build older than the supported minimum. */
  isUnsupportedChrome: boolean
}

/**
 * Detect the Chrome/Chromium major version from a user-agent string. Returns
 * null for non-Chromium browsers (e.g. Firefox) or when the version cannot be
 * determined.
 */
export function getChromeMajorVersion(userAgent: string): number | null {
  // Edge ("Edg/"), Opera ("OPR/") and other Chromium browsers also expose a
  // "Chrome/<version>" token, so matching it covers the whole family.
  const match = /(?:Chrome|Chromium)\/(\d+)/.exec(userAgent)
  if (!match) return null

  const version = Number.parseInt(match[1], 10)
  return Number.isNaN(version) ? null : version
}

/**
 * Evaluate whether the current browser is a supported Chromium version. When
 * the version cannot be parsed we treat it as supported so we never block
 * non-Chromium browsers (e.g. Firefox) with a Chrome-specific warning.
 */
export function detectBrowserSupport(userAgent: string = navigator.userAgent): BrowserSupport {
  const chromeVersion = getChromeMajorVersion(userAgent)
  const isUnsupportedChrome = chromeVersion !== null && chromeVersion < MIN_CHROME_MAJOR_VERSION

  return { chromeVersion, isUnsupportedChrome }
}

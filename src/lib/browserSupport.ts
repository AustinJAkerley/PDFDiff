// PDF Diff renders each PDF page to a canvas and compares the two images with
// OpenCV.js, which is a WebAssembly build. In a Manifest V3 extension, running
// WebAssembly requires the `wasm-unsafe-eval` Content Security Policy keyword,
// which Chromium only honors from Chrome 103 onward. On older Chrome builds the
// OpenCV runtime is blocked and never initializes, so the page images are shown
// without any difference boxes. Detect that situation up front so we can tell
// the user to update their browser instead of silently reporting "no
// differences".
export const MIN_CHROME_VERSION = 103

export type BrowserSupport = {
  // Whether the browser is known to be able to run the image comparison engine.
  supported: boolean
  // Detected Chromium-family major version, or null when it can't be determined
  // (for example non-Chromium browsers or a spoofed user agent).
  chromeVersion: number | null
  // A human-readable explanation when `supported` is false, otherwise null.
  message: string | null
}

// Extract the Chromium major version from a user-agent string. Chrome, Chromium
// and Chromium-based Edge/Brave/Opera all report a `Chrome/<version>` (or
// `Chromium/<version>`) token, so this also covers those browsers.
export function detectChromeVersion(userAgent: string): number | null {
  const match = /(?:Chrome|Chromium)\/(\d+)/.exec(userAgent)
  if (!match) {
    return null
  }

  const version = Number.parseInt(match[1], 10)
  return Number.isFinite(version) ? version : null
}

// Determine whether the current browser can run the OpenCV-based image
// comparison. Only Chromium versions older than the minimum are flagged as
// unsupported; unknown (non-Chromium) browsers are left untouched so they can
// still attempt the comparison and surface their own errors if it fails.
export function checkBrowserSupport(
  userAgent: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): BrowserSupport {
  const chromeVersion = detectChromeVersion(userAgent)

  if (chromeVersion !== null && chromeVersion < MIN_CHROME_VERSION) {
    return {
      supported: false,
      chromeVersion,
      message:
        `This browser appears to be Chrome ${chromeVersion}, which is too old to run the image ` +
        `comparison engine. Please update to Chrome ${MIN_CHROME_VERSION} or newer to see difference boxes.`,
    }
  }

  return {
    supported: true,
    chromeVersion,
    message: null,
  }
}

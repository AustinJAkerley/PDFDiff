import type { CV } from '@techstark/opencv-js'

// OpenCV.js is an Emscripten build whose UMD `module.exports` is itself a
// Promise that resolves to the initialized OpenCV namespace. Bundling it through
// Vite's CJS interop turns that thenable module into a thenable ES namespace,
// which makes a dynamic `import()` of it reject with "Promise.prototype.then
// called on incompatible receiver". To avoid that — and to keep the ~13 MB
// payload out of the app bundle — OpenCV is shipped as a static asset
// (dist/opencv/opencv.js, copied in vite.config.ts) and loaded here as a classic
// script. The UMD wrapper then assigns the Promise to `globalThis.cv`, which we
// await to obtain the namespace exposing `Mat`, `imread`, etc.
type OpenCvModule = CV & {
  onRuntimeInitialized?: () => void
  Mat?: unknown
}

type ChromeRuntime = { runtime?: { getURL?: (path: string) => string } }

const OPENCV_PATH = 'opencv/opencv.js'

const resolveOpenCvUrl = (): string => {
  const runtime = (globalThis as unknown as { chrome?: ChromeRuntime }).chrome
  if (runtime?.runtime?.getURL) {
    return runtime.runtime.getURL(OPENCV_PATH)
  }

  // Fallback for non-extension contexts (for example `vite preview`).
  const base = typeof document !== 'undefined' ? document.baseURI : globalThis.location?.href
  return new URL(OPENCV_PATH, base ?? 'http://localhost/').href
}

const isThenable = (value: unknown): value is Promise<unknown> =>
  typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function'

const injectScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-opencv]')
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve()
      } else {
        existing.addEventListener('load', () => resolve())
        existing.addEventListener('error', () => reject(new Error('Failed to load OpenCV script')))
      }
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.opencv = 'true'
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      resolve()
    })
    script.addEventListener('error', () => reject(new Error('Failed to load OpenCV script')))
    document.head.append(script)
  })

let readyPromise: Promise<CV> | null = null

export function loadOpenCv(): Promise<CV> {
  if (!readyPromise) {
    readyPromise = (async () => {
      await injectScript(resolveOpenCvUrl())

      let candidate: unknown = (globalThis as unknown as { cv?: unknown }).cv

      // MODULARIZE builds expose a factory function and/or a promise for cv.
      if (typeof candidate === 'function') {
        candidate = (candidate as () => unknown)()
      }
      if (isThenable(candidate)) {
        candidate = await candidate
      }

      const cv = candidate as OpenCvModule | undefined
      if (cv?.Mat) {
        return cv as CV
      }

      // Classic build that initializes asynchronously after the script runs.
      return new Promise<CV>((resolve, reject) => {
        if (!cv) {
          reject(new Error('OpenCV runtime was not found after loading'))
          return
        }
        cv.onRuntimeInitialized = () => resolve(cv as CV)
      })
    })()
  }

  return readyPromise
}

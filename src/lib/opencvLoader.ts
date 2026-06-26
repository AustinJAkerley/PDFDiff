import type { CV } from '@techstark/opencv-js'

// The OpenCV WebAssembly build initializes asynchronously after the module is
// imported. `cv.Mat` only becomes available once the runtime is ready, so we
// either resolve immediately (already initialized) or wait for the
// `onRuntimeInitialized` hook. The module is imported dynamically so the ~13 MB
// OpenCV bundle is code-split into its own chunk and only downloaded the first
// time a diff is run.
type OpenCvModule = CV & {
  onRuntimeInitialized?: () => void
  Mat?: unknown
}

let readyPromise: Promise<CV> | null = null

export function loadOpenCv(): Promise<CV> {
  if (!readyPromise) {
    readyPromise = import('@techstark/opencv-js').then((imported) => {
      const mod = imported as unknown as { default?: OpenCvModule } & OpenCvModule
      const cv = (mod.default ?? mod) as OpenCvModule

      if (cv.Mat) {
        return cv as CV
      }

      return new Promise<CV>((resolve) => {
        cv.onRuntimeInitialized = () => resolve(cv as CV)
      })
    })
  }

  return readyPromise
}

// Pure-TypeScript pixel difference engine. This replaces the previous OpenCV.js
// dependency, which is an Emscripten/embind build that calls `new Function(...)`
// at startup and therefore can never initialize under a Manifest V3 extension's
// Content Security Policy (no `unsafe-eval`). The handful of operations we need —
// grayscale, resize-to-match, blur, absolute difference, threshold, dilate and
// connected-component bounding boxes — are all simple array math over the pixels
// returned by `canvas.getImageData()`, with no eval and no WebAssembly, so they
// work identically on every browser.

// A difference region expressed as fractions (0..1) of the page so the same box
// can be overlaid on a canvas displayed at a responsive `width: 100%`.
export type DiffBox = {
  left: number
  top: number
  width: number
  height: number
}

export type ImageDiffOptions = {
  // Per-pixel intensity change (0..255) that must be exceeded to count as a
  // difference. Small changes from anti-aliasing/subpixel font rendering are
  // smoothed away by the blur and ignored by this threshold.
  threshold: number
  // Side length (in pixels) of the box blur applied to both grayscale images
  // before differencing. Larger values ignore finer changes.
  blurKernel: number
  // Side length (in pixels) of the square dilation kernel used to merge nearby
  // changed pixels into one region.
  dilateKernel: number
  // How many times the dilation is applied.
  dilateIterations: number
  // Regions whose area (as a fraction of the page) is below this are dropped as
  // noise.
  minRegionAreaFraction: number
}

type GrayImage = {
  data: Uint8ClampedArray
  width: number
  height: number
}

// Convert canvas RGBA pixels to a single-channel grayscale image using the same
// ITU-R BT.601 luma weights (0.299R + 0.587G + 0.114B) that OpenCV's
// COLOR_RGBA2GRAY uses, so results match the previous OpenCV-based diff.
const toGrayscale = (image: ImageData): GrayImage => {
  const { data, width, height } = image
  const gray = new Uint8ClampedArray(width * height)
  for (let i = 0, p = 0; p < gray.length; i += 4, p += 1) {
    gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
  }
  return { data: gray, width, height }
}

// Resize a grayscale image to the target dimensions with bilinear interpolation
// so a pixel-wise comparison against another image of those dimensions is
// meaningful even when the two pages differ slightly in size.
const resizeGray = (image: GrayImage, targetWidth: number, targetHeight: number): GrayImage => {
  if (image.width === targetWidth && image.height === targetHeight) {
    return image
  }

  const { data, width, height } = image
  const out = new Uint8ClampedArray(targetWidth * targetHeight)
  const scaleX = width / targetWidth
  const scaleY = height / targetHeight

  for (let y = 0; y < targetHeight; y += 1) {
    const srcY = (y + 0.5) * scaleY - 0.5
    const y0 = Math.max(0, Math.floor(srcY))
    const y1 = Math.min(height - 1, y0 + 1)
    const wy = srcY - y0

    for (let x = 0; x < targetWidth; x += 1) {
      const srcX = (x + 0.5) * scaleX - 0.5
      const x0 = Math.max(0, Math.floor(srcX))
      const x1 = Math.min(width - 1, x0 + 1)
      const wx = srcX - x0

      const top = data[y0 * width + x0] * (1 - wx) + data[y0 * width + x1] * wx
      const bottom = data[y1 * width + x0] * (1 - wx) + data[y1 * width + x1] * wx
      out[y * targetWidth + x] = top * (1 - wy) + bottom * wy
    }
  }

  return { data: out, width: targetWidth, height: targetHeight }
}

// Separable box blur, applied horizontally then vertically. A box blur is a
// cheap approximation of the Gaussian blur OpenCV used; for the purpose of
// suppressing subpixel noise before thresholding the difference is immaterial.
const boxBlur = (image: GrayImage, kernel: number): GrayImage => {
  const radius = Math.floor(kernel / 2)
  if (radius < 1) {
    return image
  }

  const { width, height } = image
  const window = radius * 2 + 1

  const horizontal = new Uint8ClampedArray(width * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    let sum = 0
    // Prime the running sum for x = 0, clamping out-of-bounds reads to the edge.
    for (let k = -radius; k <= radius; k += 1) {
      const xx = Math.min(width - 1, Math.max(0, k))
      sum += image.data[row + xx]
    }
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum / window
      const outX = Math.max(0, x - radius)
      const inX = Math.min(width - 1, x + radius + 1)
      sum += image.data[row + inX] - image.data[row + outX]
    }
  }

  const out = new Uint8ClampedArray(width * height)
  for (let x = 0; x < width; x += 1) {
    let sum = 0
    for (let k = -radius; k <= radius; k += 1) {
      const yy = Math.min(height - 1, Math.max(0, k))
      sum += horizontal[yy * width + x]
    }
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = sum / window
      const outY = Math.max(0, y - radius)
      const inY = Math.min(height - 1, y + radius + 1)
      sum += horizontal[inY * width + x] - horizontal[outY * width + x]
    }
  }

  return { data: out, width, height }
}

// Per-pixel absolute difference followed by a binary threshold: pixels whose
// intensity changed by more than `threshold` become 1, everything else 0.
const thresholdedAbsDiff = (a: GrayImage, b: GrayImage, threshold: number): Uint8Array => {
  const mask = new Uint8Array(a.width * a.height)
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = Math.abs(a.data[i] - b.data[i]) > threshold ? 1 : 0
  }
  return mask
}

// Separable binary dilation with a square structuring element, equivalent to a
// max filter over a (kernel x kernel) window, applied `iterations` times. This
// grows the changed regions so a changed word or figure becomes one box instead
// of many disconnected speckles.
const dilate = (mask: Uint8Array, width: number, height: number, kernel: number, iterations: number): Uint8Array => {
  const radius = Math.floor(kernel / 2)
  if (radius < 1 || iterations < 1) {
    return mask
  }

  let current = mask
  for (let iter = 0; iter < iterations; iter += 1) {
    const horizontal = new Uint8Array(width * height)
    for (let y = 0; y < height; y += 1) {
      const row = y * width
      for (let x = 0; x < width; x += 1) {
        let on = 0
        const start = Math.max(0, x - radius)
        const end = Math.min(width - 1, x + radius)
        for (let xx = start; xx <= end; xx += 1) {
          if (current[row + xx]) {
            on = 1
            break
          }
        }
        horizontal[row + x] = on
      }
    }

    const out = new Uint8Array(width * height)
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        let on = 0
        const start = Math.max(0, y - radius)
        const end = Math.min(height - 1, y + radius)
        for (let yy = start; yy <= end; yy += 1) {
          if (horizontal[yy * width + x]) {
            on = 1
            break
          }
        }
        out[y * width + x] = on
      }
    }

    current = out
  }

  return current
}

// Label 8-connected regions of set pixels with an iterative flood fill and
// return the bounding box of each region. An explicit stack is used instead of
// recursion so a page-sized mask cannot overflow the call stack.
const connectedComponentBoxes = (
  mask: Uint8Array,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number }[] => {
  const visited = new Uint8Array(width * height)
  const stack: number[] = []
  const boxes: { x: number; y: number; width: number; height: number }[] = []

  for (let startY = 0; startY < height; startY += 1) {
    for (let startX = 0; startX < width; startX += 1) {
      const startIndex = startY * width + startX
      if (!mask[startIndex] || visited[startIndex]) {
        continue
      }

      let minX = startX
      let maxX = startX
      let minY = startY
      let maxY = startY

      visited[startIndex] = 1
      stack.push(startIndex)

      while (stack.length) {
        const index = stack.pop() as number
        const x = index % width
        const y = (index - x) / width

        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y

        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy
          if (ny < 0 || ny >= height) {
            continue
          }
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) {
              continue
            }
            const nx = x + dx
            if (nx < 0 || nx >= width) {
              continue
            }
            const neighbor = ny * width + nx
            if (mask[neighbor] && !visited[neighbor]) {
              visited[neighbor] = 1
              stack.push(neighbor)
            }
          }
        }
      }

      boxes.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    }
  }

  return boxes
}

// Read both canvases' pixels and return the bounding boxes of the regions that
// differ, expressed as fractions of the (left) page dimensions.
export const computeDiffBoxes = (
  left: HTMLCanvasElement,
  right: HTMLCanvasElement,
  options: ImageDiffOptions,
): DiffBox[] => {
  const leftCtx = left.getContext('2d', { willReadFrequently: true })
  const rightCtx = right.getContext('2d', { willReadFrequently: true })
  if (!leftCtx || !rightCtx) {
    throw new Error('Canvas 2D context is not available')
  }

  const leftImage = leftCtx.getImageData(0, 0, left.width, left.height)
  const rightImage = rightCtx.getImageData(0, 0, right.width, right.height)

  const gray1 = boxBlur(toGrayscale(leftImage), options.blurKernel)
  const gray2 = boxBlur(
    resizeGray(toGrayscale(rightImage), gray1.width, gray1.height),
    options.blurKernel,
  )

  const mask = thresholdedAbsDiff(gray1, gray2, options.threshold)
  const dilated = dilate(mask, gray1.width, gray1.height, options.dilateKernel, options.dilateIterations)

  const pageWidth = gray1.width
  const pageHeight = gray1.height
  const minArea = pageWidth * pageHeight * options.minRegionAreaFraction

  const boxes: DiffBox[] = []
  for (const rect of connectedComponentBoxes(dilated, pageWidth, pageHeight)) {
    if (rect.width * rect.height < minArea) {
      continue
    }
    boxes.push({
      left: rect.x / pageWidth,
      top: rect.y / pageHeight,
      width: rect.width / pageWidth,
      height: rect.height / pageHeight,
    })
  }

  return boxes
}

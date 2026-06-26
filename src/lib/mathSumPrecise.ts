// pdf.js v6 relies on the TC39 "Math.sumPrecise" proposal to total up numeric
// lists. It ships only in very recent JS engines (Chrome/Edge 137+, Firefox
// 140+, Safari 26+), so on slightly older but still common browsers pdf.js
// throws "Math.sumPrecise is not a function". One place this happens is
// WidgetAnnotation._getTextWidth, which sums glyph widths while regenerating the
// appearance for a form field that has no baked-in appearance stream (i.e. a
// document with /NeedAppearances set). When that throws, the field's value is
// silently dropped from the rendered page, so text inputs such as an SSN or the
// dollar-amount boxes on a tax form appear blank even though a regular PDF
// viewer shows them.
//
// Install a minimal, standards-compatible polyfill when the runtime is missing
// it. This module must be imported on both the main thread (see pdfLoader.ts)
// and inside the pdf.js worker (see pdfWorker.ts), because pdf.js calls
// Math.sumPrecise in both contexts.

type MathWithSumPrecise = Math & {
  sumPrecise?: (values: Iterable<number>) => number
}

export function installMathSumPrecisePolyfill(): void {
  const mathObject = Math as MathWithSumPrecise

  if (typeof mathObject.sumPrecise === 'function') {
    return
  }

  Object.defineProperty(mathObject, 'sumPrecise', {
    configurable: true,
    writable: true,
    value(values: Iterable<number>): number {
      if (values === null || values === undefined || typeof (values as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== 'function') {
        throw new TypeError('Math.sumPrecise requires an iterable argument')
      }

      // Use Neumaier's variant of Kahan compensated summation so that the result
      // stays close to the exact sum even for long lists with mixed magnitudes,
      // while also tracking the non-finite cases the way the spec requires.
      let sum = 0
      let compensation = 0
      let sawElement = false
      let positiveInfinity = false
      let negativeInfinity = false
      let isNaNResult = false

      for (const element of values) {
        if (typeof element !== 'number') {
          throw new TypeError('Math.sumPrecise requires every element to be a number')
        }

        sawElement = true

        if (Number.isNaN(element)) {
          isNaNResult = true
          continue
        }

        if (element === Infinity) {
          positiveInfinity = true
          continue
        }

        if (element === -Infinity) {
          negativeInfinity = true
          continue
        }

        const next = sum + element
        if (Math.abs(sum) >= Math.abs(element)) {
          compensation += sum - next + element
        } else {
          compensation += element - next + sum
        }
        sum = next
      }

      if (!sawElement) {
        // Per spec the sum of an empty iterable is -0.
        return -0
      }

      if (isNaNResult || (positiveInfinity && negativeInfinity)) {
        return NaN
      }

      if (positiveInfinity) {
        return Infinity
      }

      if (negativeInfinity) {
        return -Infinity
      }

      return sum + compensation
    },
  })
}

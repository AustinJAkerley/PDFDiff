// pdf.js v6 relies on the TC39 "Map.prototype.getOrInsert / getOrInsertComputed"
// proposal (also defined on WeakMap). These methods shipped only in very recent
// JS engines, so on slightly older Chrome/Edge/Firefox builds pdf.js throws
// "this.#...getOrInsertComputed is not a function" from
// `getOptionalContentConfig` while rendering a page. That render failure is why
// pages previously fell back to a plain text dump instead of showing the actual
// PDF image. Install minimal, standards-compatible polyfills when the runtime
// is missing them. This module must be imported on both the main thread (see
// pdfLoader.ts) and inside the pdf.js worker (see pdfWorker.ts), because pdf.js
// uses these methods in both contexts.

type GetOrInsertCapable<K, V> = {
  has(key: K): boolean
  get(key: K): V | undefined
  set(key: K, value: V): unknown
  getOrInsert?: (key: K, value: V) => V
  getOrInsertComputed?: (key: K, callbackFn: (key: K) => V) => V
}

function installOn<K, V>(proto: GetOrInsertCapable<K, V>): void {
  if (typeof proto.getOrInsert !== 'function') {
    Object.defineProperty(proto, 'getOrInsert', {
      configurable: true,
      writable: true,
      value(this: GetOrInsertCapable<K, V>, key: K, value: V): V {
        if (this.has(key)) {
          return this.get(key) as V
        }
        this.set(key, value)
        return value
      },
    })
  }

  if (typeof proto.getOrInsertComputed !== 'function') {
    Object.defineProperty(proto, 'getOrInsertComputed', {
      configurable: true,
      writable: true,
      value(this: GetOrInsertCapable<K, V>, key: K, callbackFn: (key: K) => V): V {
        if (this.has(key)) {
          return this.get(key) as V
        }
        const value = callbackFn(key)
        this.set(key, value)
        return value
      },
    })
  }
}

export function installMapGetOrInsertPolyfill(): void {
  installOn(Map.prototype as unknown as GetOrInsertCapable<unknown, unknown>)
  installOn(WeakMap.prototype as unknown as GetOrInsertCapable<object, unknown>)
}

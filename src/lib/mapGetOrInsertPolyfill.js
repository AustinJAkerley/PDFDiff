// Polyfill for the TC39 "Map.prototype.getOrInsert / getOrInsertComputed"
// proposal (also on WeakMap). pdf.js v6 calls these methods during page
// rendering, but they are not yet shipped in many browsers (e.g. Firefox 115,
// older Chrome, iOS Safari). Without them, page.render throws
// "getOrInsertComputed is not a function" and the page paints as a black box.
//
// This file is a side-effecting script with no imports/exports so it can be
// both imported on the main thread and prepended verbatim to the pdf.js worker
// bundle (see vite.config.ts). It is intentionally plain JavaScript.
;(function installMapGetOrInsertPolyfill() {
  function define(proto) {
    if (!proto) return
    if (typeof proto.getOrInsertComputed !== 'function') {
      Object.defineProperty(proto, 'getOrInsertComputed', {
        value: function getOrInsertComputed(key, callbackFunction) {
          if (this.has(key)) return this.get(key)
          const value = callbackFunction(key)
          this.set(key, value)
          return value
        },
        configurable: true,
        writable: true,
        enumerable: false,
      })
    }
    if (typeof proto.getOrInsert !== 'function') {
      Object.defineProperty(proto, 'getOrInsert', {
        value: function getOrInsert(key, defaultValue) {
          if (this.has(key)) return this.get(key)
          this.set(key, defaultValue)
          return defaultValue
        },
        configurable: true,
        writable: true,
        enumerable: false,
      })
    }
  }

  define(typeof Map !== 'undefined' && Map.prototype)
  define(typeof WeakMap !== 'undefined' && WeakMap.prototype)
})()

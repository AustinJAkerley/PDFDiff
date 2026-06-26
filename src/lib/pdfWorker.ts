// Custom pdf.js worker entry point. pdf.js v6 computes document fingerprints
// (and decodes some inline data) inside the worker using the TC39
// Uint8Array.prototype.toHex / Uint8Array.fromBase64 methods. On runtimes that
// do not yet implement those methods this throws "hashOriginal.toHex is not a
// function" and breaks PDF loading. Install the polyfill before loading the
// real worker so the methods exist by the time a document is parsed.
import { installUint8ArrayBase64HexPolyfill } from './uint8ArrayBase64Hex'
import { installMapGetOrInsertPolyfill } from './mapGetOrInsert'
import { installMathSumPrecisePolyfill } from './mathSumPrecise'

installUint8ArrayBase64HexPolyfill()
installMapGetOrInsertPolyfill()
installMathSumPrecisePolyfill()

import 'pdfjs-dist/build/pdf.worker.mjs'

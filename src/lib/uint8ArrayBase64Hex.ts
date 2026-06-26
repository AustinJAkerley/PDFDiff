// pdf.js v6 relies on the TC39 "Uint8Array to/from base64 and hex" methods
// (Uint8Array.prototype.toHex / toBase64 and Uint8Array.fromHex / fromBase64).
// These shipped only in very recent browser versions, so on slightly older
// Chrome/Safari builds pdf.js throws "hashOriginal.toHex is not a function"
// while computing a document fingerprint, which surfaces to the user as
// "Unable to read one or both PDFs." Install minimal, standards-compatible
// polyfills when the runtime is missing them. This module must be imported on
// both the main thread (see pdfLoader.ts) and inside the pdf.js worker (see
// pdfWorker.ts), because pdf.js uses these methods in both contexts.

const HEX_CHARS = '0123456789abcdef'

function bytesToHex(bytes: Uint8Array): string {
  let result = ''
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i]
    result += HEX_CHARS[byte >> 4] + HEX_CHARS[byte & 0x0f]
  }
  return result
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new SyntaxError('Hex string must have an even number of characters')
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = Number.parseInt(hex.substr(i * 2, 2), 16)
    if (Number.isNaN(byte)) {
      throw new SyntaxError('Hex string contains non-hexadecimal characters')
    }
    bytes[i] = byte
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

type Uint8ArrayWithProposalMethods = typeof Uint8Array & {
  fromHex?: (hex: string) => Uint8Array
  fromBase64?: (base64: string) => Uint8Array
}

type Uint8ArrayProtoWithProposalMethods = Uint8Array & {
  toHex?: () => string
  toBase64?: () => string
}

export function installUint8ArrayBase64HexPolyfill(): void {
  const proto = Uint8Array.prototype as Uint8ArrayProtoWithProposalMethods
  const ctor = Uint8Array as Uint8ArrayWithProposalMethods

  if (typeof proto.toHex !== 'function') {
    Object.defineProperty(proto, 'toHex', {
      configurable: true,
      writable: true,
      value(this: Uint8Array): string {
        return bytesToHex(this)
      },
    })
  }

  if (typeof proto.toBase64 !== 'function') {
    Object.defineProperty(proto, 'toBase64', {
      configurable: true,
      writable: true,
      value(this: Uint8Array): string {
        return bytesToBase64(this)
      },
    })
  }

  if (typeof ctor.fromHex !== 'function') {
    Object.defineProperty(ctor, 'fromHex', {
      configurable: true,
      writable: true,
      value(hex: string): Uint8Array {
        return hexToBytes(hex)
      },
    })
  }

  if (typeof ctor.fromBase64 !== 'function') {
    Object.defineProperty(ctor, 'fromBase64', {
      configurable: true,
      writable: true,
      value(base64: string): Uint8Array {
        return base64ToBytes(base64)
      },
    })
  }
}

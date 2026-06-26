// Shared word tokenizer used by both text extraction (pdfExtract.ts) and the
// rendered-page highlight overlay (pdfRender.ts). Keeping a single definition
// guarantees the words located on the page match the tokens the diff engine
// compared. The regex is stateful (global flag, `lastIndex`), so callers must
// create their own instance via `createTokenRegex()` rather than share one.
//
// Numeric runs are captured as single tokens so that values that matter for
// legal/tax review stay intact: currency amounts ($1,200.00), dates
// (12/31/2024), percentages (45%), and identifiers such as SSNs/EINs
// (123-45-6789). Keeping them whole both improves diff alignment and lets the
// change classifier recognise what kind of value changed.
const TOKEN_PATTERN = /\$?\d[\d.,:/-]*[\d%]|\$?\d%?|[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)?/gu

export function createTokenRegex(): RegExp {
  return new RegExp(TOKEN_PATTERN.source, TOKEN_PATTERN.flags)
}

export function tokenize(text: string): string[] {
  return (text.match(createTokenRegex()) ?? []).map((token) => token.toLowerCase())
}

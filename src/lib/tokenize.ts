// Shared word tokenizer used by both text extraction (pdfExtract.ts) and the
// rendered-page highlight overlay (pdfRender.ts). Keeping a single definition
// guarantees the words located on the page match the tokens the diff engine
// compared. The regex is stateful (global flag, `lastIndex`), so callers must
// create their own instance via `createTokenRegex()` rather than share one.
const TOKEN_PATTERN = /[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)?/gu

export function createTokenRegex(): RegExp {
  return new RegExp(TOKEN_PATTERN.source, TOKEN_PATTERN.flags)
}

export function tokenize(text: string): string[] {
  return (text.match(createTokenRegex()) ?? []).map((token) => token.toLowerCase())
}

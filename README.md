# PDF Diff

PDF Diff is a Chrome Manifest V3 extension that compares two local PDFs in-browser and highlights textual differences.

## Features

- Popup action with **Open PDF Diff** button
- Side-by-side PDF rendering for original and new documents
- Local text extraction via `pdf.js`
- Local text diffing via `diff` (jsdiff)
- Red highlights for removed text and green highlights for added text
- Change navigator with total count, page number, and next/previous controls
- Scanned/image-only fallback warning: **No selectable text found. This PDF may be scanned.**
- No backend and no PDF upload

## Privacy

PDFs are processed locally in your browser and are never uploaded.

See [PRIVACY.md](PRIVACY.md) for full details.

## Development

```bash
npm install
npm run build
```

The build output is written to `dist/` and can be loaded in Chrome as an unpacked extension.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `/home/runner/work/PDFDiff/PDFDiff/dist`

## Test with local PDFs

Use any two local PDF files from your machine.

Suggested quick checks:

1. Choose two text-based PDFs with minor wording differences
2. Verify removed words are highlighted in red on the left
3. Verify added words are highlighted in green on the right
4. Verify next/previous change buttons navigate across pages
5. Verify scanned/image-only PDFs show the scanned warning message

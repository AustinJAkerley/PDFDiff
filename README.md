# PDF Diff

PDF Diff is a Manifest V3 browser extension that compares two local PDFs in-browser and highlights textual differences. It runs in Chrome, Microsoft Edge, and Firefox.

## Features

- Popup action with **Open PDF Diff** button
- Side-by-side PDF rendering for original and new documents
- Local text extraction via `pdf.js`
- Local text diffing via `diff` (jsdiff)
- PDF classification layer that labels each document and page as **Text-based**, **Scanned**, **Image-heavy**, **Mixed**, or **Visual fallback** before diffing, and routes the diff accordingly (no OCR yet)
- Per-page debug panel showing the classification signals (text items, words, images, estimated image coverage, vector objects, confidence)
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

The build output is written to `dist/` and can be loaded as an unpacked extension in Chrome, Edge, or Firefox.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist` folder from your local project directory

## Load in Microsoft Edge

Edge is Chromium-based and loads the same `dist` build.

1. Open `edge://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist` folder from your local project directory

## Load in Firefox

Firefox loads the same `dist` build as a temporary add-on. The manifest
includes a `browser_specific_settings.gecko` entry so Firefox accepts it.

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` file inside the `dist` folder

Temporary add-ons are removed when Firefox restarts; reload it the same way
after restarting.

## Test with local PDFs

Use any two local PDF files from your machine.

Suggested quick checks:

1. Choose two text-based PDFs with minor wording differences
2. Verify removed words are highlighted in red on the left
3. Verify added words are highlighted in green on the right
4. Verify next/previous change buttons navigate across pages
5. Verify scanned/image-only PDFs show the scanned warning message

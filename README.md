# PDF Diff

PDF Diff is a Manifest V3 browser extension that compares two local PDFs in-browser, renders them side by side, and boxes the differences directly on the rendered pages. It runs in Chrome, Microsoft Edge, and Firefox.

## Features

- Popup action with **Open PDF Diff** button
- Side-by-side **rendered** PDF pages (via `pdf.js`) with differences boxed directly on the page image
- **Red** boxes for removed content on the original (left), **green** boxes for added content on the new PDF (right), and **orange** boxes on both sides for modified (edited) content
- **Change classifier** that labels every change as an **Amount**, **ID / Account**, **Percentage**, **Date**, **Number**, or **Text** change — designed so an accountant or paralegal can see at a glance what changed on a revised tax form or contract (for example a dollar amount, an SSN/EIN, or an effective date)
- Summary bar with modified/removed/added counts and a breakdown by change category
- Change navigator listing every change with its page, category, and a `before → after` preview; clicking a change scrolls both documents to that page
- Local text extraction via `pdf.js` and local diffing via `diff` (jsdiff); numeric values such as `$1,200.00`, `12/31/2024`, `45%`, and `123-45-6789` are kept as single tokens so amounts, dates, percentages, and identifiers diff and classify cleanly
- PDF page-type classification layer (collapsible debug panel) that labels each document and page as **Text-based**, **Scanned**, **Image-heavy**, **Mixed**, or **Visual fallback**
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

The build also copies pdf.js's external resource bundles (CMaps, the standard 14
fonts, and the WASM image decoders for scanned JBIG2/JPEG 2000 pages) into
`dist/pdfjs/`. These are required so that PDFs using non-embedded standard
fonts, CID/CJK fonts, or scanned images can be read and rendered. The extension
manifest allows `wasm-unsafe-eval` so the image decoders can run.

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

Sample PDFs are committed under [`samples/`](samples/) so you can verify the
extension without supplying your own files:

- `samples/text-original.pdf` and `samples/text-modified.pdf` — two text-based
  documents with several wording differences for the diff highlights and change
  navigator.
- `samples/scanned-no-text.pdf` — an image-only page that triggers the
  scanned-PDF warning.

See [`samples/README.md`](samples/README.md) for the expected result of each
check. You can also use any two local PDF files from your machine.

Suggested quick checks:

1. Choose two text-based PDFs with minor wording differences
2. Verify removed content is boxed in red on the left (original)
3. Verify added content is boxed in green on the right (new)
4. Verify edited content is boxed in orange on both sides (modified)
5. Verify each change in the navigator shows a category badge (Amount, Date, etc.) and a `before → after` preview
6. Verify next/previous change buttons navigate across pages
7. Verify scanned/image-only PDFs show the scanned warning message

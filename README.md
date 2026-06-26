# PDF Diff

PDF Diff is a Manifest V3 browser extension that compares two local PDFs in-browser, renders the whole pages side by side as images, and boxes the visual differences directly on the rendered pages using a built-in pixel-diff engine. It runs in Chrome, Microsoft Edge, and Firefox.

## Features

- Popup action with **Open PDF Diff** button
- Side-by-side **rendered** PDF pages (via `pdf.js`) showing the whole, unedited page image — not a text dump
- **Image-based visual diff** computed in plain TypeScript: each page pair is compared pixel-by-pixel and every region that changed is boxed on both the original (left) and the new PDF (right)
- Summary bar with the number of changed pages and difference regions
- Change navigator listing every changed page; clicking a page scrolls both documents to it
- Pages that exist in only one document are flagged as added/removed
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
fonts, CID/CJK fonts, or scanned images can be read and rendered. The visual
diff itself is implemented in plain TypeScript (`src/lib/imageDiff.ts`) and needs
no extra runtime. The extension manifest allows `wasm-unsafe-eval` so the pdf.js
image decoders can run.

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

- `samples/text-original.pdf` and `samples/text-modified.pdf` — two documents
  with several wording differences for the visual diff boxes and change
  navigator.
- `samples/scanned-no-text.pdf` — an image-only page that still renders and can
  be compared visually.

See [`samples/README.md`](samples/README.md) for the expected result of each
check. You can also use any two local PDF files from your machine.

For realistic, use-case-driven document pairs (résumé, W-2 tax form, real estate
purchase contract, invoice, lease agreement, and employment offer), see
[`examples/`](examples/). Each pair is named `<name>_old.pdf` / `<name>_new.pdf`
with a few meaningful edits; [`examples/README.md`](examples/README.md) lists
what changed in each pair.

Suggested quick checks:

1. Choose two PDFs with minor differences
2. Verify the whole pages render as images side by side
3. Verify the regions that changed are boxed on both the original (left) and the new PDF (right)
4. Verify the summary shows the number of changed pages and difference regions
5. Verify the change navigator lists each changed page and clicking it scrolls both documents
6. Verify next/previous buttons navigate across changed pages

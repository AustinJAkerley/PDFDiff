# PDF Side by Side

PDF Side by Side is a Manifest V3 browser extension that opens two local PDFs
next to each other in a single tab. Each PDF is shown exactly as if you opened
it in the browser, using the browser's built-in PDF viewer (toolbar, zoom,
page thumbnails, print, download). It runs in Chrome, Microsoft Edge, and
Firefox.

## Features

- Popup action with an **Open viewer** button
- Two side-by-side panes, each rendering a PDF with the native browser viewer
- Pick a file per pane via drag-and-drop or a file picker
- No diffing, no text extraction, no backend, and no PDF upload

## Privacy

PDFs are opened locally in your browser and are never uploaded.

See [PRIVACY.md](PRIVACY.md) for full details.

## Development

```bash
npm install
npm run build
```

The build output is written to `dist/` and can be loaded as an unpacked
extension in Chrome, Edge, or Firefox.

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

## Usage

1. Click the extension icon, then **Open viewer**
2. Choose a PDF for the left pane and a PDF for the right pane
3. Scroll, zoom, and navigate each PDF independently with the native viewer

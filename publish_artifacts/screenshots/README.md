# Screenshots

The Chrome Web Store requires **at least one** screenshot and allows up to 5.

## Required specs

| Property | Value |
| --- | --- |
| Dimensions | **1280 × 800** (preferred) or 640 × 400 |
| Format | PNG (24-bit, no alpha) or JPEG |
| Aspect ratio | Exactly 16:10 — do not pad or stretch |

## ⚠️ The files here are placeholders

`screenshot-1-side-by-side.png` and `screenshot-2-change-navigator.png` are
**generated mockups** (note the banner along the bottom). They are correctly
sized so you can see the layout, but you must **replace them with real captures
of the running extension** before publishing — the Web Store rejects obviously
fake screenshots.

## How to capture real screenshots

1. Build and load the extension:
   ```bash
   npm run build
   ```
   Then load the `dist/` folder via `chrome://extensions` → **Developer mode**
   → **Load unpacked** (see the repo `README.md`).
2. Open the diff page (toolbar button → **Open PDF Diff**) and load a document
   pair from `examples/` (e.g. the TREC contract `*_old.pdf` / `*_new.pdf`) so
   the page shows real, meaningful diff boxes.
3. Capture at exactly 1280 × 800. Easiest reliable method in Chrome DevTools:
   - Open DevTools (F12) → toggle the **device toolbar** (Ctrl/Cmd+Shift+M).
   - Set a custom device size of **1280 × 800**.
   - Use the device toolbar's **⋮ menu → Capture screenshot**.
4. Suggested shots:
   - **Side-by-side diff** — both documents with red/green change boxes visible.
   - **Change navigator** — the list of changed pages, with the summary bar.
   - (Optional) An **added/removed page** flagged, and the **popup** UI.
5. Save them over the placeholder filenames (or add `screenshot-3…`, etc.) and
   re-upload.

> Use only fictional/sample data in screenshots — never real personal,
> financial, or legal information.

## Regenerating the placeholders / promo art

All images in `publish_artifacts/` are produced by:

```bash
python3 publish_artifacts/scripts/generate_assets.py
```

(Pure Python standard library — no Pillow or other dependencies required.)

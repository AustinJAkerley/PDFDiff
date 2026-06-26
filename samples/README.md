# Sample test PDFs

These small PDFs let you exercise the PDF Diff extension without supplying your
own files. Load them with **Load unpacked** (`dist/`) and open the diff page,
then choose the files below.

| File | Purpose | Expected result |
| --- | --- | --- |
| `text-original.pdf` | Text-based "before" document. | Classified **Text-based**; renders side by side. |
| `text-modified.pdf` | Text-based "after" document with several wording changes. | Diff against `text-original.pdf` reports multiple changes; removed words highlighted red on the left, added words green on the right. |
| `scanned-no-text.pdf` | A full-page raster image with no selectable text (simulates a scan). | Classified **Scanned**; shows **"No selectable text found. This PDF may be scanned."** |

## Suggested checks

1. **Text diff** — choose `text-original.pdf` (Original) and `text-modified.pdf`
   (New). Confirm the change navigator reports a non-zero total, and that
   Next/Previous move between the highlighted changes.
2. **Scanned fallback** — choose `scanned-no-text.pdf` for either side and
   confirm the scanned-PDF warning appears while the page still renders.

The files are intentionally tiny and contain no embedded fonts beyond the
standard 14, so they also verify that pdf.js loads its external standard-font
and CMap resources from `dist/pdfjs/`.

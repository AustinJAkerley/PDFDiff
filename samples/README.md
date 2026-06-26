# Sample test PDFs

These small PDFs let you exercise the PDF Diff extension without supplying your
own files. Load them with **Load unpacked** (`dist/`) and open the diff page,
then choose the files below.

| File | Purpose | Expected result |
| --- | --- | --- |
| `text-original.pdf` | "Before" document. | Renders as a full page image side by side. |
| `text-modified.pdf` | "After" document with several wording changes. | Visual diff against `text-original.pdf` reports multiple changed regions; each changed region is boxed on both the original (left) and the new PDF (right). |
| `scanned-no-text.pdf` | A full-page raster image with no selectable text (simulates a scan). | Renders as a full page image and can be compared visually like any other page. |

## Suggested checks

1. **Visual diff** — choose `text-original.pdf` (Original) and `text-modified.pdf`
   (New). Confirm the whole pages render as images, that changed regions are
   boxed on both sides, and that Next/Previous move between the changed pages.
2. **Image-only page** — choose `scanned-no-text.pdf` for either side and
   confirm the page still renders as an image.

The files are intentionally tiny and contain no embedded fonts beyond the
standard 14, so they also verify that pdf.js loads its external standard-font
and CMap resources from `dist/pdfjs/`.

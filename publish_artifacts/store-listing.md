# Store Listing Copy — PDF Diff

Copy/paste these fields directly into the Chrome Web Store **Store listing** tab.
Character limits noted are the Chrome Web Store maximums (as of 2026).

---

## Product name

```
PDF Diff — Compare PDFs Side by Side
```

> The Web Store item name field allows up to 75 characters. If you prefer to
> match the extension manifest exactly, use just `PDF Diff`.

---

## Short description (max 132 characters)

```
Compare two local PDFs side by side and highlight every change. 100% in-browser — no uploads, no account, fully private.
```

(119 characters.)

---

## Category

```
Productivity
```

> Rationale: PDF Diff is a document/workflow tool. **Productivity** is the best
> fit in the Chrome Web Store category list. A reasonable alternative is
> **Developer Tools** if you market it primarily to engineers reviewing
> generated documents, but Productivity reaches the widest relevant audience.

---

## Language

```
English (United States)
```

---

## Long description (max 16,000 characters)

```
PDF Diff compares two PDF files right inside your browser and shows you exactly what changed — side by side, page by page.

Open two versions of any document and PDF Diff renders the full pages next to each other, then boxes every region that changed: removals are marked on the original (left) and additions on the new file (right). No more squinting between two tabs or printing copies to compare by hand.

WHY PDF DIFF

• 100% private — your PDFs are processed locally in your browser and are never uploaded to any server. There is no backend, no account, and no cloud sync.
• Whole-page visual comparison — pages are rendered as images (via pdf.js), so you see the real, unedited document, not a stripped-down text dump.
• Clear change highlights — changed regions are boxed on both documents so differences are obvious at a glance.
• Change navigator — jump straight to each changed page; clicking a page scrolls both documents in sync.
• Added / removed pages — pages that exist in only one file are clearly flagged.
• Works offline — once installed, it runs without an internet connection.

GREAT FOR

• Legal and real-estate contracts — spot edited clauses, amounts, dates, and signatures between revisions.
• Tax and financial forms — verify figures and identifiers across versions.
• Resumes, invoices, leases, and offer letters — confirm exactly what changed before you send.
• Engineers and writers — review generated or exported PDFs across builds.

HOW IT WORKS

1. Click the PDF Diff toolbar button and choose "Open PDF Diff".
2. Select the original and the new PDF from your computer.
3. Review the side-by-side pages with every change boxed, and use the change navigator to step through them.

PRIVACY

PDF Diff requires no host permissions, collects no data, and sends nothing off your device. When you close the page, the loaded PDF data is discarded from memory. See the privacy policy for full details.

Questions or feedback? Visit austinakerley.com or email austin.akerley+PDFDiff@outlook.com.
```

---

## Support / contact

| Field | Value |
| --- | --- |
| Support email | `austin.akerley+PDFDiff@outlook.com` |
| Support / website URL | `https://austinakerley.com` |
| Homepage URL | `https://austinakerley.com` |
| Privacy policy URL | Host `privacy-policy.md` (rendered) at a public URL, e.g. `https://austinakerley.com/pdfdiff/privacy` — see `privacy-policy.md` |

---

## Graphic assets checklist

| Asset | Required size | File |
| --- | --- | --- |
| Store icon | 128 × 128 PNG | `icons/icon-128.png` |
| Screenshot(s) | 1280 × 800 (or 640 × 400) PNG/JPEG | `screenshots/` — **replace placeholders with real captures** |
| Small promo tile (optional) | 440 × 280 PNG | `promo/promo-tile-440x280.png` |
| Marquee promo (optional) | 1400 × 560 PNG | `promo/marquee-1400x560.png` |

> At least **one** screenshot is required to publish. Up to 5 are allowed.
> The screenshots currently in this folder are generated placeholders — see
> `screenshots/README.md` for how to capture real ones.

---

## Distribution / privacy practices tab answers

When you fill out the **Privacy practices** tab, the following answers match how
PDF Diff actually behaves:

- **Single purpose**: "Compare two local PDF files and visually highlight the
  differences between them."
- **Permission justification**: The extension requests no host permissions and
  no sensitive permissions; all processing is local. (If the Web Store flags the
  `action`/popup, explain it is only used to open the comparison page.)
- **Remote code**: "No, I am not using remote code." (All scripts ship in the
  package; `wasm-unsafe-eval` is only used for the bundled pdf.js WASM image
  decoders, not remotely fetched code.)
- **Data usage**: Check **nothing** — the extension does not collect or transmit
  any user data. You must still certify the data-usage disclosures.

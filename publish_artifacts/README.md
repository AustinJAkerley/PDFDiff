# Publish Artifacts — PDF Diff

Everything needed to publish **PDF Diff** to the Chrome Web Store, prepared for
submission. Most copy is ready to paste; a few items (screenshots, hosted
privacy URL) need a final human step, which is called out below.

## Contents

| File / folder | What it is |
| --- | --- |
| [`store-listing.md`](store-listing.md) | Short description, long description, category, support email/site, and the Privacy-practices tab answers — ready to paste. |
| [`privacy-policy.md`](privacy-policy.md) | The privacy policy. Host it at a public URL and paste that URL into the listing. |
| [`developer-account-setup.md`](developer-account-setup.md) | Step-by-step Chrome Web Store developer account setup, including the one-time **$5** fee, plus a pre-submission checklist. |
| [`icons/icon-128.png`](icons/icon-128.png) | **128 × 128** store icon (required). |
| [`icons/`](icons/) | Also includes 16/32/48 PNGs and `icon.svg` source. |
| [`screenshots/`](screenshots/) | 1280 × 800 screenshots. **Currently placeholders — replace with real captures** (see the folder README). |
| [`promo/`](promo/) | Optional 440 × 280 small promo tile and 1400 × 560 marquee. |
| [`scripts/generate_assets.py`](scripts/generate_assets.py) | Regenerates all icons/promo/placeholder images (pure Python stdlib). |

## Support contact (used throughout)

- **Website:** https://austinakerley.com
- **Email:** austin.akerley+PDFDiff@outlook.com

## Quick start

1. Read [`developer-account-setup.md`](developer-account-setup.md) and create the
   account + pay the one-time fee.
2. Capture **real** screenshots — see [`screenshots/README.md`](screenshots/README.md).
3. Host [`privacy-policy.md`](privacy-policy.md) at a public URL.
4. `npm run build`, zip the `dist/` contents (manifest at the zip root).
5. Create the item, paste fields from [`store-listing.md`](store-listing.md),
   upload the icon/screenshots, and submit for review.

## Regenerate the images

```bash
python3 publish_artifacts/scripts/generate_assets.py
```

## Still requires a human step before publishing

- [ ] Replace the placeholder screenshots with real captures of the running extension.
- [ ] Host the privacy policy at a public URL and paste it into the listing.
- [ ] Create the Google developer account and pay the one-time $5 fee.

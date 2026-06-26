# Chrome Web Store — Developer Account Setup

Before you can publish **PDF Diff**, you need a Chrome Web Store developer
account and to pay the one-time registration fee. Follow these steps in order.

---

## 1. Use (or create) a Google account

Decide which Google account will **own** the extension. This matters because the
owning account controls the listing, updates, and payouts forever.

- For a product you want to keep separate from your personal Gmail, create a
  dedicated account (e.g. a `pdfdiff@` or project-specific address).
- You can later transfer ownership to a **Google group** or share access, so it
  is fine to start with a personal account.

---

## 2. Open the Developer Dashboard

1. Go to **https://chrome.google.com/webstore/devconsole/**.
2. Sign in with the Google account from step 1.
3. Accept the **Chrome Web Store Developer Agreement** and the developer terms
   when prompted.

---

## 3. Pay the one-time registration fee

- The fee is a **one-time US $5.00** payment (not recurring).
- It is charged through **Google Payments**; have a card ready.
- Paying once lets you publish up to **20 extensions** from that account.
- The fee is non-refundable and is separate from any optional paid-extension
  payouts.

> If the dashboard does not prompt for payment immediately, it will ask the
> first time you click **Add new item** / try to submit.

---

## 4. Verify your account (publisher details)

In the dashboard go to **Account** and complete:

- **Publisher display name** — what users see as the developer (e.g.
  `Austin Akerley`). This is public.
- **Contact email** — use `austin.akerley+PDFDiff@outlook.com`, then **verify**
  it via the confirmation email Google sends. Verification is required before
  you can publish.
- (Optional) Set up a **Google group** as a secondary owner so you don't lose
  access if the primary account is ever locked.

---

## 5. (Only if you ever charge money) Set up a merchant/payments account

PDF Diff is free, so **you can skip this**. It is only needed for paid
extensions or in-app purchases.

---

## 6. Create the item and upload the build

1. Build the extension: `npm run build` (output goes to `dist/`).
2. Zip the **contents** of `dist/` (the `manifest.json` must be at the root of
   the zip, not inside a subfolder).
3. In the dashboard click **Add new item** and upload the zip.
4. Fill in the **Store listing** tab using `../store-listing.md`.
5. Upload graphics: the 128×128 icon (`../icons/icon-128.png`), at least one
   1280×800 screenshot (`../screenshots/`), and optionally the promo tiles
   (`../promo/`).
6. Complete the **Privacy practices** tab (answers are pre-written in
   `../store-listing.md`) and paste your hosted **privacy policy URL**
   (see `../privacy-policy.md`).
7. Choose **visibility** (Public / Unlisted / Private) and **distribution**
   regions.

---

## 7. Submit for review

- Click **Submit for review**.
- First-time reviews commonly take a few business days (sometimes longer if the
  account is brand new). You'll get an email when it's approved or if changes
  are requested.
- Once approved, the listing goes live at its Web Store URL.

---

## Pre-submission checklist

- [ ] Google account chosen and signed in to the Developer Dashboard
- [ ] One-time **$5** registration fee paid
- [ ] Contact email `austin.akerley+PDFDiff@outlook.com` added **and verified**
- [ ] `dist/` built and zipped with `manifest.json` at the zip root
- [ ] 128×128 icon uploaded
- [ ] At least one **real** 1280×800 screenshot uploaded (replace placeholders)
- [ ] Short + long description, category (**Productivity**) filled in
- [ ] Privacy policy hosted at a public URL and pasted into the listing
- [ ] Privacy practices tab completed (no data collected)
- [ ] Submitted for review

---

### Notes specific to this extension

- The `manifest.json` currently sets `"version": "0.1.0"`. Each new upload must
  have a **higher** version number than the last published one.
- The manifest includes a `browser_specific_settings.gecko` block for Firefox.
  Chrome ignores it, so it does not block Web Store submission, but you can
  remove it from the Chrome build if you want a cleaner manifest.
- Chrome requires extension icons declared in the manifest for the best
  experience. Consider adding an `"icons"` block (16/32/48/128) pointing at the
  PNGs in `../icons/` to your build before publishing.

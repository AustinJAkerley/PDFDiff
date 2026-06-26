# Example PDF pairs

Realistic (but **entirely fictional**) before/after document pairs for testing
PDF Diff against common, real-world use cases. Every name, number, address, and
identifier here is made up — none of these are real documents, and the W-2 is a
simplified mock, not an actual IRS form.

Each pair follows the `<name>_old.pdf` / `<name>_new.pdf` naming convention.
Load the `_old` file as the **Original** and the `_new` file as the **New** PDF
on the diff page; the visual diff boxes every region that changed on both sides.

| Pair | Use case | What changed between old → new |
| --- | --- | --- |
| `resume_old.pdf` / `resume_new.pdf` | Job applicant updating a résumé | Title (Software Engineer → Senior), summary years (5 → 6), phone number, and an added skill (TypeScript, Kubernetes) |
| `w2_tax_form_old.pdf` / `w2_tax_form_new.pdf` | Reviewing a tax form year over year | Every wage/withholding amount increased (Boxes 1–6 and 16) |
| `real_estate_contract_old.pdf` / `real_estate_contract_new.pdf` | Negotiating a home purchase | Purchase price ($725,000 → $712,500), earnest money ($15,000 → $20,000), and closing date |
| `invoice_old.pdf` / `invoice_new.pdf` | Approving a revised vendor invoice | Development line item amount, an added "Accessibility audit" line, the recomputed total, and payment terms (Net 30 → Net 15) |
| `lease_agreement_old.pdf` / `lease_agreement_new.pdf` | Renewing a rental lease | Monthly rent and deposit ($2,350 → $2,475) and the pet clause |
| `employment_offer_old.pdf` / `employment_offer_new.pdf` | Comparing a revised job offer | Position, base salary, signing bonus, start date, and PTO |

## How to test

1. Build and load the extension (`npm run build`, then load `dist/` unpacked).
2. Open the PDF Diff page.
3. Pick a `_old.pdf` for **Original** and the matching `_new.pdf` for **New**.
4. Confirm the changed values are boxed on both the original (left) and new
   (right) pages, and that Next/Previous step through the changed pages.

> These are single-page documents with only standard fonts, so they also work
> as quick smoke tests for the renderer.

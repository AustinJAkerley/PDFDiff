# Example PDF pairs

Before/after document pairs for testing PDF Diff against common, real-world use
cases. Each pair is named `<name>_old.pdf` / `<name>_new.pdf`. Load the `_old`
file as the **Original** and the `_new` file as the **New** PDF on the diff
page; the diff boxes every region that changed on both sides.

Two of the pairs are **real, publicly available form templates** filled in with
**entirely fictional** data, and the rest are realistic mock documents. No real
person, property, account, or identifier appears in any of these files.

## Real-template pairs (real form, fake data)

| Pair | Template | What changed between old → new |
| --- | --- | --- |
| `texas_home_contract_old.pdf` / `texas_home_contract_new.pdf` | Texas Real Estate Commission (TREC) form **20-18**, *One to Four Family Residential Contract (Resale)* — a Texas home purchase agreement | Sales price (cash portion $109,000 → $106,000, financing $436,000 → $424,000, total $545,000 → $530,000), earnest money / option fee, and closing date (Sep 15 → Oct 6) |
| `self_employed_tax_old.pdf` / `self_employed_tax_new.pdf` | IRS **Schedule C (Form 1040)**, *Profit or Loss From Business (Sole Proprietorship)* — a self-employed tax form | Gross receipts ($128,400 → $142,750), several expense lines, and the recomputed total expenses, tentative profit, and net profit |

> The blank templates are the official, government/commission-promulgated forms
> (TREC 20-18 and IRS Schedule C). Only the field values are made up. A self-
> employed Schedule C is used rather than a W-2, because a W-2 is issued by an
> employer and is not something a filer edits year to year.

## Mock-document pairs (realistic, fictional)

| Pair | Use case | What changed between old → new |
| --- | --- | --- |
| `resume_old.pdf` / `resume_new.pdf` | Job applicant updating a résumé | Title (Software Engineer → Senior), summary years (5 → 6), phone number, and an added skill (TypeScript, Kubernetes) |
| `invoice_old.pdf` / `invoice_new.pdf` | Approving a revised vendor invoice | Development line item amount, an added "Accessibility audit" line, the recomputed total, and payment terms (Net 30 → Net 15) |
| `lease_agreement_old.pdf` / `lease_agreement_new.pdf` | Renewing a rental lease | Monthly rent and deposit ($2,350 → $2,475) and the pet clause |
| `employment_offer_old.pdf` / `employment_offer_new.pdf` | Comparing a revised job offer | Position, base salary, signing bonus, start date, and PTO |

## How to test

1. Build and load the extension (`npm run build`, then load `dist/` unpacked).
2. Open the PDF Diff page.
3. Pick a `_old.pdf` for **Original** and the matching `_new.pdf` for **New**.
4. Confirm the changed values are boxed on both the original (left) and new
   (right) pages, and that Next/Previous step through the changed pages.

> The mock documents are single-page; the two real-template pairs are multi-page
> forms (the TREC contract is 11 pages), so they also exercise multi-page
> navigation and the change navigator.

# Example PDFs for testing

This folder holds sample PDF pairs for exercising the side-by-side diff. Each
use case ships as two files:

- `<name>_old.pdf` - the original document
- `<name>_new.pdf` - a revised version with realistic edits

Load the `_old` file on the left pane and the `_new` file on the right pane to
see the changes highlighted:

- **Red** - removed from the original (left)
- **Green** - added in the revision (right)
- **Orange** - text changed in place (shown on both sides)

> All content is fictional sample data created for testing only.

## Use cases

| Pair | Scenario | What changes between old and new |
| --- | --- | --- |
| `resume` | Job applicant resume | Title/location, reworded bullet, updated metrics & GPA, an added role bullet, a removed legacy bullet, expanded skills list |
| `tax_return` | Form 1040 individual return | Tax year, filing status, a new dependent, multiple dollar amounts, and refund vs. amount owed |
| `real_estate_contract` | Residential purchase & sale agreement | Purchase price, earnest money, loan %, appraisal contingency, an added contingency, and the closing date |
| `lease_agreement` | Residential lease | Lease term, rent, late fee, deposit, pet policy, parking, and an added utilities clause |
| `invoice` | Services invoice | Invoice date, line-item quantities/amounts, an added line item, a removed line item, and recomputed totals |
| `nda` | Mutual non-disclosure agreement | Effective date, term length, governing law, and an added "Return of Materials" clause |

Each pair is intentionally designed to produce a mix of removed, added, and
in-place (modified) changes so every highlight color is represented.

## Regenerating

The PDFs are produced by a small, dependency-free Node script that writes the
PDF byte stream directly (only Node built-ins, no project dependencies):

```bash
node examples/generate.mjs
```

Edit the document builders in `generate.mjs` to add new scenarios or tweak the
edits, then re-run to overwrite the `.pdf` files.

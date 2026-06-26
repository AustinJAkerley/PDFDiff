// Dependency-free generator for the example PDF pairs in this folder.
//
// It builds small, multi-page text PDFs straight from the PDF object model
// using only Node built-ins (no pdfkit, no project dependencies). Run it with:
//
//     node examples/generate.mjs
//
// Each document is described as an array of "lines" (see the `doc` helpers
// below). Every example is emitted twice - <name>_old.pdf and <name>_new.pdf -
// with realistic edits between the two so the diff tool has removed (red),
// added (green) and in-place modified (orange) content to highlight.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT_DIR = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// PDF writer
// ---------------------------------------------------------------------------

// Page geometry (US Letter, 72 units per inch).
const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN_LEFT = 56
const MARGIN_TOP = 56
const BOTTOM_LIMIT = 56

// Standard 14 fonts need no embedding, so the PDFs stay tiny and portable.
const FONTS = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
}

// Escape a string for a PDF literal `(...)` string. Backslash and parentheses
// must be escaped; control characters are emitted as their PDF escape sequences
// so a stray newline/tab in future content can't corrupt the content stream.
function escapeText(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/[\b]/g, '\\b')
    .replace(/\f/g, '\\f')
}

// Turn a list of laid-out pages into a content stream + page objects and write
// the whole PDF file. `pages` is an array of arrays of placed glyphs:
//   { x, y, size, font: 'regular'|'bold'|'italic', text }
function buildPdf(pages) {
  const objects = []
  const alloc = () => objects.push(null) // returns 1-based object number

  const catalogNum = alloc()
  const pagesNum = alloc()
  const fontNums = {
    regular: alloc(),
    bold: alloc(),
    italic: alloc(),
  }

  const pageNums = []
  const contentNums = []
  for (let i = 0; i < pages.length; i += 1) {
    pageNums.push(alloc())
    contentNums.push(alloc())
  }

  objects[catalogNum - 1] = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`
  objects[pagesNum - 1] =
    `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNums.length} >>`

  for (const [key, num] of Object.entries(fontNums)) {
    objects[num - 1] = `<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[key]} >>`
  }

  const fontResources = Object.entries(fontNums)
    .map(([key, num]) => `/F_${key} ${num} 0 R`)
    .join(' ')

  pages.forEach((glyphs, i) => {
    const parts = ['BT']
    let currentFont = null
    let currentSize = null
    for (const g of glyphs) {
      if (g.font !== currentFont || g.size !== currentSize) {
        parts.push(`/F_${g.font} ${g.size} Tf`)
        currentFont = g.font
        currentSize = g.size
      }
      parts.push(`1 0 0 1 ${g.x.toFixed(2)} ${g.y.toFixed(2)} Tm`)
      parts.push(`(${escapeText(g.text)}) Tj`)
    }
    parts.push('ET')
    const stream = parts.join('\n')

    objects[pageNums[i] - 1] =
      `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << ${fontResources} >> >> /Contents ${contentNums[i]} 0 R >>`
    objects[contentNums[i] - 1] =
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
  })

  // Serialize with a cross-reference table.
  let body = '%PDF-1.4\n'
  const offsets = []
  for (let i = 0; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(body, 'latin1')
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefStart = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${objects.length + 1}\n`
  body += '0000000000 65535 f \n'
  for (const off of offsets) {
    body += `${String(off).padStart(10, '0')} 00000 n \n`
  }
  body +=
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`

  return Buffer.from(body, 'latin1')
}

// ---------------------------------------------------------------------------
// Layout: turn semantic lines into placed glyphs across one or more pages
// ---------------------------------------------------------------------------

// A document is an array of line descriptors:
//   { text, font, size, indent, gap }   - a run of text
//   { rule: true, gap }                  - a horizontal divider (drawn as dashes)
//   { spacer: n }                        - n points of vertical space
// `gap` is extra leading added below the line.
function layout(lines) {
  const pages = [[]]
  let y = PAGE_HEIGHT - MARGIN_TOP

  const newPage = () => {
    pages.push([])
    y = PAGE_HEIGHT - MARGIN_TOP
  }

  for (const line of lines) {
    if (line.spacer) {
      y -= line.spacer
      continue
    }

    const size = line.size ?? 11
    const lineHeight = size * 1.35
    const gap = line.gap ?? 0

    if (y - lineHeight < BOTTOM_LIMIT) newPage()

    if (line.rule) {
      // Draw a divider as a row of em-dashes; keeps us inside text-only PDFs.
      const dashes = '\u2014'.repeat(56)
      pages[pages.length - 1].push({
        x: MARGIN_LEFT,
        y: y - size,
        size,
        font: 'regular',
        text: dashes,
      })
      y -= lineHeight + gap
      continue
    }

    const indent = line.indent ?? 0
    pages[pages.length - 1].push({
      x: MARGIN_LEFT + indent,
      y: y - size,
      size,
      font: line.font ?? 'regular',
      text: line.text ?? '',
    })
    y -= lineHeight + gap
  }

  return pages
}

// Convenience line builders.
const title = (text) => ({ text, font: 'bold', size: 20, gap: 6 })
const heading = (text) => ({ text, font: 'bold', size: 14, gap: 3 })
const sub = (text) => ({ text, font: 'bold', size: 11, gap: 1 })
const body = (text, indent = 0) => ({ text, font: 'regular', size: 11, indent })
const italic = (text) => ({ text, font: 'italic', size: 10, gap: 2 })
const rule = () => ({ rule: true, gap: 4, size: 11 })
const space = (n = 8) => ({ spacer: n })

function emit(name, lines) {
  const pdf = buildPdf(layout(lines))
  const file = join(OUT_DIR, `${name}.pdf`)
  writeFileSync(file, pdf)
  console.log(`wrote ${name}.pdf (${pdf.length} bytes)`)
}

// ---------------------------------------------------------------------------
// Example documents
// ---------------------------------------------------------------------------

// 1) Resume - the canonical use case. Title change, reworded bullet (orange),
//    added skill (green), removed line (red), updated dates.
function resume(version) {
  const isNew = version === 'new'
  return [
    title('JORDAN A. RIVERA'),
    isNew
      ? sub('Staff Software Engineer  -  Seattle, WA')
      : sub('Senior Software Engineer  -  Bellevue, WA'),
    body('jordan.rivera@example.com   |   (206) 555-0142   |   linkedin.com/in/jrivera'),
    rule(),
    space(4),
    heading('EXPERIENCE'),
    sub(isNew ? 'Staff Engineer, Northwind Cloud  (2021 - Present)' : 'Senior Engineer, Northwind Cloud  (2021 - 2024)'),
    body('-  Lead design of the multi-region key management service used by 40+ teams.'),
    isNew
      ? body('-  Reduced p99 request latency by 38% by redesigning the cache layer.')
      : body('-  Reduced p99 request latency by 22% by tuning the cache layer.'),
    body('-  Mentored five engineers and ran the weekly architecture review.'),
    isNew ? body('-  Drove the migration of 120 services to the new platform.') : null,
    space(6),
    sub('Software Engineer, Cascade Analytics  (2018 - 2021)'),
    body('-  Built the ingestion pipeline processing 2B events per day.'),
    !isNew ? body('-  Maintained the legacy reporting dashboard in jQuery.') : null,
    body('-  Introduced automated load testing into the release pipeline.'),
    space(6),
    heading('EDUCATION'),
    sub('B.S. Computer Science, University of Washington'),
    body(isNew ? 'Graduated 2018  -  GPA 3.8' : 'Graduated 2018  -  GPA 3.7'),
    space(6),
    heading('SKILLS'),
    body(
      isNew
        ? 'Go, Rust, TypeScript, Kubernetes, Terraform, PostgreSQL, gRPC, Kafka'
        : 'Go, TypeScript, Kubernetes, Terraform, PostgreSQL, gRPC',
    ),
  ].filter(Boolean)
}

// 2) Tax return (1040-style) - numbers/amounts changing, a new dependent,
//    refund vs. amount owed.
function taxReturn(version) {
  const isNew = version === 'new'
  return [
    title('Form 1040  -  U.S. Individual Income Tax Return'),
    sub(isNew ? 'Tax Year 2024' : 'Tax Year 2023'),
    body('Name: Jordan A. Rivera        SSN: 123-45-6789'),
    body(isNew ? 'Filing Status: Married Filing Jointly' : 'Filing Status: Single'),
    body(isNew ? 'Dependents: 1 (Avery Rivera)' : 'Dependents: 0'),
    rule(),
    heading('Income'),
    body(isNew ? '1   Wages (W-2, box 1) ........................ $184,500' : '1   Wages (W-2, box 1) ........................ $162,000'),
    body('2   Taxable interest .......................... $1,240'),
    body(isNew ? '3   Qualified dividends ....................... $3,810' : '3   Qualified dividends ....................... $2,950'),
    body(isNew ? '4   Capital gains ............................. $6,500' : '4   Capital gains ............................. $0'),
    body(isNew ? '5   Total income ............................. $196,050' : '5   Total income ............................. $166,190'),
    space(6),
    heading('Deductions & Tax'),
    body(isNew ? '12  Standard deduction ....................... $29,200' : '12  Standard deduction ....................... $13,850'),
    body(isNew ? '15  Taxable income ........................... $166,850' : '15  Taxable income ........................... $152,340'),
    body(isNew ? '16  Tax ...................................... $30,420' : '16  Tax ...................................... $30,110'),
    body('19  Child tax credit ......................... ' + (isNew ? '$2,000' : '$0')),
    space(6),
    heading('Payments & Refund'),
    body(isNew ? '25  Federal tax withheld ..................... $34,800' : '25  Federal tax withheld ..................... $28,600'),
    isNew
      ? body('34  Overpayment - REFUND ..................... $6,380')
      : body('37  Amount you owe ........................... $1,510'),
    space(6),
    italic('This is fictional sample data for testing only - not a real tax return.'),
  ].filter(Boolean)
}

// 3) Real estate purchase contract - price, dates, contingencies change.
function realEstateContract(version) {
  const isNew = version === 'new'
  return [
    title('Residential Purchase & Sale Agreement'),
    body('This Agreement is made between the Buyer and Seller identified below.'),
    rule(),
    sub('1. Parties'),
    body('Seller: Pat Morgan        Buyer: Jordan A. Rivera'),
    sub('2. Property'),
    body('1742 Maple Court, Redmond, WA 98052 (the "Property").'),
    sub('3. Purchase Price'),
    isNew
      ? body('The total purchase price is $912,000, payable as set forth below.')
      : body('The total purchase price is $875,000, payable as set forth below.'),
    body(isNew ? 'Earnest money deposit: $27,000.' : 'Earnest money deposit: $20,000.'),
    sub('4. Financing'),
    body(
      isNew
        ? 'Buyer to obtain a conventional loan for 75% of the purchase price.'
        : 'Buyer to obtain a conventional loan for 80% of the purchase price.',
    ),
    sub('5. Contingencies'),
    body('-  Inspection contingency: 10 days from acceptance.'),
    isNew
      ? body('-  Appraisal contingency: waived by Buyer.')
      : body('-  Appraisal contingency: 21 days from acceptance.'),
    body('-  Title review contingency: 5 days from receipt of title report.'),
    isNew ? body('-  Sale-of-buyer-home contingency: none.') : null,
    sub('6. Closing'),
    body(isNew ? 'Closing date: on or before September 15, 2024.' : 'Closing date: on or before October 31, 2024.'),
    body('Possession delivered to Buyer at closing.'),
    space(6),
    italic('Sample contract for testing the PDF diff tool. Not legal advice.'),
  ].filter(Boolean)
}

// 4) Residential lease agreement - rent, term, pet policy changes.
function leaseAgreement(version) {
  const isNew = version === 'new'
  return [
    title('Residential Lease Agreement'),
    body('Landlord: Cascade Property Mgmt.   Tenant: Jordan A. Rivera'),
    body('Premises: 88 Birch Street, Apt 4B, Seattle, WA 98103'),
    rule(),
    sub('1. Term'),
    body(isNew ? 'Lease term: 24 months, beginning March 1, 2024.' : 'Lease term: 12 months, beginning March 1, 2024.'),
    sub('2. Rent'),
    body(isNew ? 'Monthly rent: $2,650, due on the 1st of each month.' : 'Monthly rent: $2,400, due on the 1st of each month.'),
    body(isNew ? 'Late fee: $75 after a 5-day grace period.' : 'Late fee: $50 after a 5-day grace period.'),
    sub('3. Security Deposit'),
    body(isNew ? 'Security deposit: $2,650.' : 'Security deposit: $2,400.'),
    sub('4. Utilities'),
    body('Tenant pays electricity and internet. Landlord pays water and trash.'),
    isNew ? body('Landlord also provides gas for the building heating system.') : null,
    sub('5. Pets'),
    isNew
      ? body('One cat permitted with a $300 refundable pet deposit.')
      : body('No pets are permitted on the premises.'),
    sub('6. Parking'),
    body(isNew ? 'One assigned parking space included (Space 12).' : 'Parking is not included with this unit.'),
    space(6),
    italic('Sample lease for testing the PDF diff tool. Not legal advice.'),
  ].filter(Boolean)
}

// 5) Invoice - line items, quantities, totals; one item added, one removed.
function invoice(version) {
  const isNew = version === 'new'
  return [
    title('INVOICE'),
    body(isNew ? 'Invoice #: INV-2041        Date: June 12, 2024' : 'Invoice #: INV-2041        Date: June 5, 2024'),
    body('Bill To: Northwind Cloud, Inc.        Terms: Net 30'),
    rule(),
    sub('Description                         Qty      Rate        Amount'),
    body('Platform engineering (hours)         40      $185      $7,400'),
    isNew
      ? body('Architecture review (hours)          12      $200      $2,400')
      : body('Architecture review (hours)          8       $200      $1,600'),
    body('On-call support (week)               2       $500      $1,000'),
    isNew ? body('Security audit (flat)                1       $3,500    $3,500') : null,
    !isNew ? body('Documentation (hours)                6       $120      $720') : null,
    rule(),
    body(isNew ? 'Subtotal ............................................ $14,300' : 'Subtotal ............................................ $10,720'),
    body(isNew ? 'Tax (10%) ........................................... $1,430' : 'Tax (10%) ........................................... $1,072'),
    sub(isNew ? 'Total Due ........................................... $15,730' : 'Total Due ........................................... $11,792'),
    space(6),
    italic('Sample invoice for testing the PDF diff tool.'),
  ].filter(Boolean)
}

// 6) NDA - term length, governing law, and a new clause.
function nda(version) {
  const isNew = version === 'new'
  return [
    title('Mutual Non-Disclosure Agreement'),
    body('Between Northwind Cloud, Inc. and Cascade Analytics, LLC.'),
    body(isNew ? 'Effective Date: April 1, 2024' : 'Effective Date: January 15, 2024'),
    rule(),
    sub('1. Confidential Information'),
    body('Each party may disclose confidential business and technical information.'),
    sub('2. Obligations'),
    body('The receiving party will use the information solely to evaluate a'),
    body('potential business relationship between the parties.'),
    sub('3. Term'),
    body(
      isNew
        ? 'This Agreement remains in effect for 3 years from the Effective Date.'
        : 'This Agreement remains in effect for 2 years from the Effective Date.',
    ),
    sub('4. Governing Law'),
    body(isNew ? 'This Agreement is governed by the laws of Delaware.' : 'This Agreement is governed by the laws of Washington.'),
    isNew ? sub('5. Return of Materials') : null,
    isNew ? body('Upon request, each party will return or destroy confidential materials.') : null,
    space(6),
    italic('Sample NDA for testing the PDF diff tool. Not legal advice.'),
  ].filter(Boolean)
}

// ---------------------------------------------------------------------------

const examples = {
  resume,
  tax_return: taxReturn,
  real_estate_contract: realEstateContract,
  lease_agreement: leaseAgreement,
  invoice,
  nda,
}

for (const [name, builder] of Object.entries(examples)) {
  emit(`${name}_old`, builder('old'))
  emit(`${name}_new`, builder('new'))
}

console.log('Done.')

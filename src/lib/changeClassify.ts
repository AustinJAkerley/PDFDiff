// Semantic classifier for an individual change. Where pdfClassify.ts answers
// "what kind of page is this?", this module answers "what kind of value
// changed?" — the question an accountant or paralegal actually asks when
// reviewing a revised tax form or contract. Recognising that a dollar amount,
// a percentage, an identifier (SSN/EIN/account number), or a date changed is
// far more actionable than a generic "text changed".

export type ChangeCategory = 'amount' | 'identifier' | 'percentage' | 'date' | 'number' | 'text'

const MONTH_NAMES = new Set([
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'jan',
  'feb',
  'mar',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
])

// Highest-signal categories win when a change touches several token types, so a
// changed line containing both a label and a dollar figure is reported as an
// amount change. Order matters: amounts and identifiers are the most
// consequential on financial/legal documents.
const CATEGORY_PRIORITY: ChangeCategory[] = ['amount', 'identifier', 'percentage', 'date', 'number', 'text']

// A currency amount: optional $, digits with thousands separators, and an
// explicit cents component (the cents distinguish money from a bare number).
const AMOUNT_REGEX = /^\$\d[\d,]*(?:\.\d+)?$|^\d[\d,]*\.\d{2}$/
// SSN (123-45-6789), EIN (12-3456789), or a longer hyphenated account number.
const IDENTIFIER_REGEX = /^\d{3}-\d{2}-\d{4}$|^\d{2}-\d{7}$|^\d[\d-]{5,}\d$/
const PERCENT_REGEX = /%$/
const DATE_NUMERIC_REGEX = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/
const YEAR_REGEX = /^(?:19|20)\d{2}$/
const NUMBER_REGEX = /^\d[\d,]*(?:\.\d+)?$/

const classifyToken = (token: string): ChangeCategory => {
  if (AMOUNT_REGEX.test(token)) {
    return 'amount'
  }
  if (IDENTIFIER_REGEX.test(token)) {
    return 'identifier'
  }
  if (PERCENT_REGEX.test(token)) {
    return 'percentage'
  }
  if (DATE_NUMERIC_REGEX.test(token) || YEAR_REGEX.test(token) || MONTH_NAMES.has(token)) {
    return 'date'
  }
  if (NUMBER_REGEX.test(token)) {
    return 'number'
  }
  return 'text'
}

/**
 * Classify a change from the tokens that were removed and/or added. The most
 * significant category present across both sides is returned.
 */
export function classifyChange(tokens: string[]): ChangeCategory {
  let best: ChangeCategory = 'text'
  let bestRank = CATEGORY_PRIORITY.length

  for (const token of tokens) {
    const category = classifyToken(token)
    const rank = CATEGORY_PRIORITY.indexOf(category)
    if (rank < bestRank) {
      best = category
      bestRank = rank
      if (rank === 0) {
        break
      }
    }
  }

  return best
}

/**
 * Short, user-facing label for a change category.
 */
export function getChangeCategoryLabel(category: ChangeCategory): string {
  switch (category) {
    case 'amount':
      return 'Amount'
    case 'identifier':
      return 'ID / Account'
    case 'percentage':
      return 'Percentage'
    case 'date':
      return 'Date'
    case 'number':
      return 'Number'
    case 'text':
    default:
      return 'Text'
  }
}

export const CHANGE_CATEGORIES: ChangeCategory[] = CATEGORY_PRIORITY

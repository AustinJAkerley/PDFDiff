import { diffArrays } from 'diff'
import { classifyChange, type ChangeCategory } from './changeClassify'

// A change is either purely added (present only in the new PDF), purely removed
// (present only in the original), or a modification (a removed run immediately
// replaced by an added run at the same position). Modifications are the most
// useful signal on a revised form: a value was edited rather than inserted or
// deleted outright.
export type ChangeKind = 'added' | 'removed' | 'modified'

// How a token should be boxed on a rendered page.
export type HighlightKind = ChangeKind

export type DiffChange = {
  id: number
  type: ChangeKind
  pageNumber: number
  category: ChangeCategory
  before: string
  after: string
}

export type DiffSummary = {
  total: number
  added: number
  removed: number
  modified: number
  byCategory: Record<ChangeCategory, number>
}

// Per page, the set of tokens to box and the kind of box to draw. The left
// (original) map carries removed + modified tokens; the right (new) map carries
// added + modified tokens.
export type HighlightMap = Map<number, Map<string, HighlightKind>>

export type DiffResult = {
  changes: DiffChange[]
  leftHighlights: HighlightMap
  rightHighlights: HighlightMap
  summary: DiffSummary
}

const toSnippet = (tokens: string[]) => tokens.slice(0, 14).join(' ')

// Record the box kind for each token on a page. A token already flagged as
// `modified` keeps that (orange) flag so an edit is never downgraded to a plain
// add/remove when the same word appears elsewhere on the page.
const setKinds = (map: HighlightMap, pageNumber: number, tokens: string[], kind: HighlightKind) => {
  let pageMap = map.get(pageNumber)
  if (!pageMap) {
    pageMap = new Map()
    map.set(pageNumber, pageMap)
  }

  for (const token of tokens) {
    if (pageMap.get(token) === 'modified') {
      continue
    }
    pageMap.set(token, kind)
  }
}

const emptyByCategory = (): Record<ChangeCategory, number> => ({
  amount: 0,
  identifier: 0,
  percentage: 0,
  date: 0,
  number: 0,
  text: 0,
})

export function buildDiff(
  originalPages: Array<{ pageNumber: number; tokens: string[] }>,
  newPages: Array<{ pageNumber: number; tokens: string[] }>,
): DiffResult {
  const maxPages = Math.max(originalPages.length, newPages.length)
  const changes: DiffChange[] = []
  const leftHighlights: HighlightMap = new Map()
  const rightHighlights: HighlightMap = new Map()
  const summary: DiffSummary = {
    total: 0,
    added: 0,
    removed: 0,
    modified: 0,
    byCategory: emptyByCategory(),
  }
  let id = 0

  const pushChange = (change: Omit<DiffChange, 'id'>) => {
    changes.push({ id, ...change })
    id += 1
    summary.total += 1
    summary[change.type] += 1
    summary.byCategory[change.category] += 1
  }

  for (let index = 0; index < maxPages; index += 1) {
    const pageNumber = index + 1
    const originalTokens = originalPages[index]?.tokens ?? []
    const newTokens = newPages[index]?.tokens ?? []
    const parts = diffArrays(originalTokens, newTokens)

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]
      if (!part.added && !part.removed) {
        continue
      }

      const next = parts[i + 1]

      // A removed run immediately followed by an added run is an in-place
      // modification (an edited value). Box both sides in orange.
      if (part.removed && next?.added) {
        const beforeTokens = part.value.filter(Boolean)
        const afterTokens = next.value.filter(Boolean)
        setKinds(leftHighlights, pageNumber, beforeTokens, 'modified')
        setKinds(rightHighlights, pageNumber, afterTokens, 'modified')
        pushChange({
          type: 'modified',
          pageNumber,
          category: classifyChange([...beforeTokens, ...afterTokens]),
          before: toSnippet(beforeTokens),
          after: toSnippet(afterTokens),
        })
        i += 1 // consume the paired added run
        continue
      }

      const tokens = part.value.filter(Boolean)
      if (!tokens.length) {
        continue
      }

      if (part.removed) {
        setKinds(leftHighlights, pageNumber, tokens, 'removed')
        pushChange({
          type: 'removed',
          pageNumber,
          category: classifyChange(tokens),
          before: toSnippet(tokens),
          after: '',
        })
      } else {
        setKinds(rightHighlights, pageNumber, tokens, 'added')
        pushChange({
          type: 'added',
          pageNumber,
          category: classifyChange(tokens),
          before: '',
          after: toSnippet(tokens),
        })
      }
    }
  }

  return { changes, leftHighlights, rightHighlights, summary }
}

import { diffArrays } from 'diff'

export type ChangeKind = 'added' | 'removed'

export type DiffChange = {
  id: number
  type: ChangeKind
  pageNumber: number
  text: string
}

export type DiffResult = {
  changes: DiffChange[]
  addedByPage: Map<number, Set<string>>
  removedByPage: Map<number, Set<string>>
}

const toSnippet = (tokens: string[]) => tokens.slice(0, 12).join(' ')

const upsertTokens = (store: Map<number, Set<string>>, pageNumber: number, tokens: string[]) => {
  if (!store.has(pageNumber)) {
    store.set(pageNumber, new Set())
  }

  const tokenSet = store.get(pageNumber)
  if (!tokenSet) {
    return
  }

  for (const token of tokens) {
    tokenSet.add(token)
  }
}

export function buildDiff(
  originalPages: Array<{ pageNumber: number; tokens: string[] }>,
  newPages: Array<{ pageNumber: number; tokens: string[] }>,
): DiffResult {
  const maxPages = Math.max(originalPages.length, newPages.length)
  const changes: DiffChange[] = []
  const addedByPage = new Map<number, Set<string>>()
  const removedByPage = new Map<number, Set<string>>()
  let id = 0

  for (let index = 0; index < maxPages; index += 1) {
    const pageNumber = index + 1
    const originalTokens = originalPages[index]?.tokens ?? []
    const newTokens = newPages[index]?.tokens ?? []
    const pageDiff = diffArrays(originalTokens, newTokens)

    for (const part of pageDiff) {
      if (!part.added && !part.removed) {
        continue
      }

      const tokens = part.value.filter(Boolean)
      if (!tokens.length) {
        continue
      }

      if (part.removed) {
        upsertTokens(removedByPage, pageNumber, tokens)
        changes.push({ id, type: 'removed', pageNumber, text: toSnippet(tokens) })
        id += 1
      }

      if (part.added) {
        upsertTokens(addedByPage, pageNumber, tokens)
        changes.push({ id, type: 'added', pageNumber, text: toSnippet(tokens) })
        id += 1
      }
    }
  }

  return { changes, addedByPage, removedByPage }
}

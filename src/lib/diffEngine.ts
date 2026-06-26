/**
 * Token-level diff used to find added, removed and modified words between two
 * PDFs. The engine is text-only: it works on arrays of word strings and reports
 * which indices in each side changed, leaving box/positioning to the caller.
 */

export type SegmentKind = 'equal' | 'added' | 'removed' | 'modified'

/**
 * A run of consecutive tokens with the same change kind.
 *
 * - `leftIndices` are indices into the left token array (present for
 *   equal/removed/modified).
 * - `rightIndices` are indices into the right token array (present for
 *   equal/added/modified).
 *
 * A `modified` segment carries both: a removed run immediately followed by an
 * added run is treated as an in-place edit.
 */
export type DiffSegment = {
  kind: SegmentKind
  leftIndices: number[]
  rightIndices: number[]
}

// Normalize a token for comparison. Differences in surrounding punctuation and
// case still count as changes, but this trims invisible whitespace noise.
function normalize(token: string): string {
  return token.normalize('NFC')
}

type Op = { type: 'equal' | 'removed' | 'added'; leftIndex: number; rightIndex: number }

/**
 * Compute a longest-common-subsequence alignment between two token arrays and
 * return the ordered list of equal/removed/added operations. Uses an O(n*m)
 * dynamic-programming table, which is bounded here because callers diff one
 * page at a time.
 */
function lcsOps(left: string[], right: string[]): Op[] {
  const n = left.length
  const m = right.length

  // dp[i][j] = LCS length of left[i:] and right[j:].
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    const rowi = dp[i]
    const rowi1 = dp[i + 1]
    for (let j = m - 1; j >= 0; j -= 1) {
      rowi[j] = left[i] === right[j] ? rowi1[j + 1] + 1 : Math.max(rowi1[j], rowi[j + 1])
    }
  }

  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      ops.push({ type: 'equal', leftIndex: i, rightIndex: j })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'removed', leftIndex: i, rightIndex: j })
      i += 1
    } else {
      ops.push({ type: 'added', leftIndex: i, rightIndex: j })
      j += 1
    }
  }
  while (i < n) {
    ops.push({ type: 'removed', leftIndex: i, rightIndex: j })
    i += 1
  }
  while (j < m) {
    ops.push({ type: 'added', leftIndex: i, rightIndex: j })
    j += 1
  }
  return ops
}

/**
 * Diff two token arrays into ordered segments. Consecutive operations of the
 * same type are grouped, and a removed run directly followed by an added run is
 * reclassified as a single `modified` edit on each side.
 */
export function diffTokens(left: string[], right: string[]): DiffSegment[] {
  const normLeft = left.map(normalize)
  const normRight = right.map(normalize)
  const ops = lcsOps(normLeft, normRight)

  // Group consecutive ops of the same type.
  type Group = { type: 'equal' | 'removed' | 'added'; left: number[]; right: number[] }
  const groups: Group[] = []
  for (const op of ops) {
    const last = groups[groups.length - 1]
    if (last && last.type === op.type) {
      if (op.type !== 'added') last.left.push(op.leftIndex)
      if (op.type !== 'removed') last.right.push(op.rightIndex)
    } else {
      groups.push({
        type: op.type,
        left: op.type !== 'added' ? [op.leftIndex] : [],
        right: op.type !== 'removed' ? [op.rightIndex] : [],
      })
    }
  }

  // Convert groups to segments, merging removed→added pairs into `modified`.
  const segments: DiffSegment[] = []
  for (let g = 0; g < groups.length; g += 1) {
    const group = groups[g]
    const next = groups[g + 1]
    if (group.type === 'removed' && next?.type === 'added') {
      segments.push({ kind: 'modified', leftIndices: group.left, rightIndices: next.right })
      g += 1 // consume the paired added group
      continue
    }
    segments.push({
      kind: group.type,
      leftIndices: group.type !== 'added' ? group.left : [],
      rightIndices: group.type !== 'removed' ? group.right : [],
    })
  }

  return segments
}

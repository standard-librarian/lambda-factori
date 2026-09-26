/**
 * Brute-force recipe search: enumerate every term over a basis in order of
 * size and return the smallest ones that satisfy a goal. Used by the level
 * editor ("is this level solvable, and how big is the answer?") and by
 * `scripts/search.ts` for level design.
 */
import { type Goal, satisfies } from "./Level.ts"
import { app, atom, show, type Term } from "./Term.ts"

export interface SearchResult {
  readonly found: ReadonlyArray<string>
  readonly searchedSize: number
  readonly exhausted: boolean
}

export const searchRecipes = (
  goal: Goal,
  basis: ReadonlyArray<string>,
  options: { readonly maxSize?: number; readonly limit?: number; readonly maxTerms?: number } = {}
): SearchResult => {
  const maxSize = options.maxSize ?? 7
  const limit = options.limit ?? 3
  const maxTerms = options.maxTerms ?? 400_000
  const bySize: Array<Array<Term>> = [[], basis.map(atom)]
  const found: Array<string> = []
  let checked = 0
  for (let n = 1; n <= maxSize; n++) {
    if (n > 1) {
      const level: Array<Term> = []
      for (let k = 1; k < n; k++) for (const f of bySize[k]!) for (const x of bySize[n - k]!) level.push(app(f, x))
      bySize[n] = level
    }
    for (const t of bySize[n]!) {
      if (++checked > maxTerms) return { found, searchedSize: n - 1, exhausted: false }
      if (satisfies(t, goal)) {
        found.push(show(t))
        if (found.length >= limit) return { found, searchedSize: n, exhausted: true }
      }
    }
    if (found.length > 0) return { found, searchedSize: n, exhausted: true }
  }
  return { found, searchedSize: maxSize, exhausted: true }
}

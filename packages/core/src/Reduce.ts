import { byName, catalogue, type Combinator } from "./Catalogue.ts"
import { app, apply, equals, parse, show, size, spine, variable, type Term } from "./Term.ts"

export interface Rule {
  readonly params: ReadonlyArray<string>
  readonly body: Term
}

export type Rules = ReadonlyMap<string, Rule>

export const defaultRules: Rules = byName

export interface Budget {
  readonly steps: number
  readonly maxSize: number
}

export const defaultBudget: Budget = { steps: 400, maxSize: 600 }

class OutOfFuel {
  readonly _tag = "OutOfFuel"
}

const substitute = (body: Term, env: ReadonlyMap<string, Term>): Term => {
  switch (body._tag) {
    case "Var":
      return env.get(body.name) ?? body
    case "Atom":
      return body
    case "App":
      return app(substitute(body.fn, env), substitute(body.arg, env))
  }
}

/** One contraction at the head of the spine, if the head combinator is saturated. */
export const contractHead = (t: Term, rules: Rules = defaultRules): Term | undefined => {
  const { head, args } = spine(t)
  if (head._tag !== "Atom") return undefined
  const rule = rules.get(head.name)
  if (rule === undefined || args.length < rule.params.length) return undefined
  const env = new Map(rule.params.map((p, i) => [p, args[i]!] as const))
  return apply(substitute(rule.body, env), args.slice(rule.params.length))
}

/** Normal-order (leftmost-outermost) normalisation with a step and size budget. */
export const normalize = (
  t: Term,
  rules: Rules = defaultRules,
  budget: Budget = defaultBudget
): { readonly term: Term; readonly steps: number } | undefined => {
  let steps = 0
  const go = (term: Term): Term => {
    let cur = term
    for (;;) {
      const next = contractHead(cur, rules)
      if (next === undefined) break
      if (++steps > budget.steps || size(next) > budget.maxSize) throw new OutOfFuel()
      cur = next
    }
    const { head, args } = spine(cur)
    return apply(head, args.map(go))
  }
  try {
    return { term: go(t), steps }
  } catch (e) {
    if (e instanceof OutOfFuel) return undefined
    throw e
  }
}

/** A target behaviour: `f params… ≡ body`, where body may mention opaque atoms. */
export interface Behaviour {
  readonly params: ReadonlyArray<string>
  readonly body: Term
}

export const behaviour = (params: ReadonlyArray<string> | string, body: string | Term): Behaviour => ({
  params: [...params],
  body: typeof body === "string" ? parse(body) : body
})

/**
 * Extensional check: apply the candidate to fresh variables and compare normal
 * forms. Player-built terms never contain variables, so the names cannot clash.
 */
export const behavesAs = (candidate: Term, target: Behaviour, rules: Rules = defaultRules): boolean => {
  const fresh = target.params.map(variable)
  const lhs = normalize(apply(candidate, fresh), rules)
  if (lhs === undefined) return false
  const rhs = normalize(target.body, rules)
  return rhs !== undefined && equals(lhs.term, rhs.term)
}

const recognitionCache = new Map<string, Combinator | null>()

/**
 * Which catalogue combinator (if any) does this term behave like? Atoms are
 * recognised as themselves; compound terms are tested extensionally.
 */
export const recognize = (t: Term): Combinator | undefined => {
  if (t._tag === "Atom") return byName.get(t.name)
  if (t._tag !== "App") return undefined
  const key = show(t)
  const cached = recognitionCache.get(key)
  if (cached !== undefined) return cached ?? undefined
  const found = catalogue.find((c) => behavesAs(t, c)) ?? null
  recognitionCache.set(key, found)
  return found ?? undefined
}

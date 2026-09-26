/**
 * Step-by-step normal-order reduction with stable node identities, so the
 * renderer can animate each rewrite: arguments keep their ids as they move,
 * duplicated arguments get primed ids (`n3′`), dropped ones disappear.
 */
import { defaultRules, type Rules } from "./Reduce.ts"
import { apply, show, type Term } from "./Term.ts"

export type LTerm =
  | { readonly _tag: "Atom"; readonly id: string; readonly name: string }
  | { readonly _tag: "Var"; readonly id: string; readonly name: string }
  | { readonly _tag: "App"; readonly id: string; readonly fn: LTerm; readonly arg: LTerm }

export interface Step {
  /** Name of the contracted combinator. */
  readonly rule: string
  readonly params: ReadonlyArray<string>
  /** Id of the head atom that fires. */
  readonly head: string
  /** Root ids of the arguments bound to each parameter, in order. */
  readonly args: ReadonlyArray<string>
  /** Shown text of each bound argument. */
  readonly argTexts: ReadonlyArray<string>
  readonly dropped: ReadonlyArray<string>
  readonly copied: ReadonlyArray<string>
  readonly reordered: boolean
  /** The redex and what it rewrote to, e.g. `KIx` ⟶ `I`. */
  readonly redex: string
  readonly result: string
}

export interface Trace {
  readonly terms: ReadonlyArray<LTerm>
  readonly steps: ReadonlyArray<Step>
  /** False if the step budget ran out before reaching normal form. */
  readonly normal: boolean
}

export const spineL = (t: LTerm): { head: LTerm; args: Array<LTerm> } => {
  const args: Array<LTerm> = []
  let cur = t
  while (cur._tag === "App") {
    args.push(cur.arg)
    cur = cur.fn
  }
  return { head: cur, args: args.reverse() }
}

export const unlabel = (t: LTerm): Term =>
  t._tag === "App"
    ? { _tag: "App", fn: unlabel(t.fn), arg: unlabel(t.arg) }
    : { _tag: t._tag, name: t.name } as Term

/** Base id of a copied node: `n3′′` → `n3`. */
export const baseId = (id: string) => id.replace(/′+$/u, "")

export const trace = (term: Term, rules: Rules = defaultRules, maxSteps = 40): Trace => {
  let counter = 0
  const fresh = () => `n${counter++}`

  const label = (t: Term): LTerm =>
    t._tag === "App" ? { _tag: "App", id: fresh(), fn: label(t.fn), arg: label(t.arg) } : { _tag: t._tag, id: fresh(), name: t.name }

  const prime = (t: LTerm, n: number): LTerm => {
    const id = t.id + "′".repeat(n)
    return t._tag === "App" ? { _tag: "App", id, fn: prime(t.fn, n), arg: prime(t.arg, n) } : { ...t, id }
  }

  const rebuild = (head: LTerm, args: ReadonlyArray<LTerm>): LTerm =>
    args.reduce<LTerm>((fn, arg) => ({ _tag: "App", id: fresh(), fn, arg }), head)

  const step = (t: LTerm): { term: LTerm; info: Step } | undefined => {
    const { head, args } = spineL(t)
    if (head._tag === "Atom") {
      const rule = rules.get(head.name)
      if (rule && args.length >= rule.params.length) {
        const n = rule.params.length
        const env = new Map(rule.params.map((p, i) => [p, args[i]!] as const))
        const uses = new Map<string, number>()
        const order: Array<string> = []
        const subst = (b: Term): LTerm => {
          if (b._tag === "Var" && env.has(b.name)) {
            const k = uses.get(b.name) ?? 0
            uses.set(b.name, k + 1)
            order.push(b.name)
            return k === 0 ? env.get(b.name)! : prime(env.get(b.name)!, k)
          }
          if (b._tag === "App") return { _tag: "App", id: fresh(), fn: subst(b.fn), arg: subst(b.arg) }
          return { _tag: b._tag, id: fresh(), name: b.name }
        }
        const body = subst(rule.body)
        const bound = args.slice(0, n)
        const firstUse = rule.params.filter((p) => uses.has(p))
        const seen = order.filter((p, i) => order.indexOf(p) === i)
        return {
          term: rebuild(body, args.slice(n)),
          info: {
            rule: head.name,
            params: rule.params,
            head: head.id,
            args: bound.map((a) => a.id),
            argTexts: bound.map((a) => show(unlabel(a))),
            redex: show(apply(unlabel(head), bound.map(unlabel))),
            result: show(unlabel(body)),
            dropped: rule.params.filter((p) => !uses.has(p)),
            copied: rule.params.filter((p) => (uses.get(p) ?? 0) > 1),
            reordered: seen.join() !== firstUse.join()
          }
        }
      }
    }
    // Head is stuck: reduce inside the arguments, leftmost first.
    for (let i = 0; i < args.length; i++) {
      const inner = step(args[i]!)
      if (inner) {
        const next = [...args]
        next[i] = inner.term
        return { term: rebuild(head, next), info: inner.info }
      }
    }
    return undefined
  }

  const terms: Array<LTerm> = [label(term)]
  const steps: Array<Step> = []
  for (let i = 0; i < maxSteps; i++) {
    const s = step(terms.at(-1)!)
    if (!s) return { terms, steps, normal: true }
    terms.push(s.term)
    steps.push(s.info)
  }
  return { terms, steps, normal: false }
}

/** Plain-language summary of what a rewrite did, e.g. "drops x", "copies z". */
export const describeStep = (s: Step): string => {
  const arg = (p: string) => s.argTexts[s.params.indexOf(p)] ?? p
  const parts: Array<string> = []
  if (s.dropped.length) parts.push(`drops ${s.dropped.map(arg).join(", ")}`)
  if (s.copied.length) parts.push(`copies ${s.copied.map(arg).join(", ")}`)
  if (s.reordered) parts.push("reorders its arguments")
  if (parts.length === 0) parts.push(s.params.length === 1 ? "hands back its argument" : "regroups its arguments")
  return `${s.rule} ${parts.join(" and ")}`
}

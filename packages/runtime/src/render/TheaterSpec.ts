/**
 * What the reduction theater shows, decided without any drawing: a term, the
 * rules to reduce it with, its definition line, an optional goal to check the
 * normal form against, and alternative inputs (e.g. truth-table rows). The
 * builders below explain a catalogue combinator, a level goal, or a player's term.
 */
import { byName } from "@lambda-factori/core/Catalogue.ts"
import { goalOf, rowTerm, type Target, truthRows, truthRule } from "@lambda-factori/core/Level.ts"
import { defaultRules, recognize, type Rules } from "@lambda-factori/core/Reduce.ts"
import { app, apply, atom, parse, show, type Term, variable } from "@lambda-factori/core/Term.ts"

export interface TheaterSpec {
  readonly title: string
  readonly subtitle?: string
  readonly term: Term
  readonly rules?: Rules
  /** Definition line shown at the top: lhs → rhs. */
  readonly definition?: { readonly lhs: Term; readonly rhs: Term }
  /**
   * Optional behaviour to check the normal form against. `term` must already be
   * applied to variables named like the goal's params.
   */
  readonly goal?: { readonly label: string; readonly params: ReadonlyArray<string>; readonly body: Term }
  /**
   * Alternative inputs to try (e.g. the rows of a truth table). Each variant
   * replaces `term` and may carry its own expected normal form.
   */
  readonly variants?: ReadonlyArray<{ readonly label: string; readonly term: Term; readonly expect?: Term }>
  readonly note?: string
}

/** Build the spec that explains a catalogue combinator by applying it to variables. */
export const combinatorSpec = (name: string): TheaterSpec | undefined => {
  const c = byName.get(name)
  if (!c) return undefined
  const lhs = apply(atom(c.name), c.params.map(variable))
  return {
    title: `${c.name} · the ${c.bird.toLowerCase()}`,
    subtitle: `${c.blurb}${c.apl ? `  APL: ${c.apl}` : ""}`,
    term: lhs,
    definition: { lhs, rhs: c.body }
  }
}

const atomsOf = (t: Term): Array<string> =>
  t._tag === "App" ? [...atomsOf(t.fn), ...atomsOf(t.arg)] : t._tag === "Atom" ? [t.name] : []

const rowLabel = (bits: ReadonlyArray<boolean>, out: string) =>
  `${bits.length ? bits.map((b) => (b ? "⊤" : "⊥")).join(" ") : "·"} → ${out}`

/**
 * Build the spec that explains a level goal. If the label is itself a term over
 * known combinators (`KI` is K applied to I), animate the real reduction.
 * Truth-table goals get one variant per row, run through a decision-tree rule.
 * Anything else is treated as a one-step rule.
 */
export const goalSpec = (t: Target, blurb: string): TheaterSpec => {
  const g = goalOf(t)
  if (g._tag === "Truth") {
    const { params, body } = truthRule(g)
    const rules: Rules = new Map([...defaultRules, [t.label, { params, body }]])
    const variants = truthRows(g).map((r) => ({
      label: rowLabel(r.bits, r.expected),
      term: rowTerm(atom(t.label), r.bits),
      expect: atom(r.expected)
    }))
    const lhs = apply(atom(t.label), params.map(variable))
    return {
      title: `goal · ${t.label}`,
      subtitle: `${blurb}  Inputs are Church booleans (⊤ picks the first option, ⊥ the second); the bin then asks for 1 or 0.`,
      term: variants[0]!.term,
      rules,
      definition: { lhs, rhs: body },
      variants,
      goal: { label: t.label, params, body }
    }
  }
  const { params, body } = g.behaviour
  const vars = params.map(variable)
  const parsed = (() => {
    try {
      const p = parse(t.label)
      return atomsOf(p).every((a) => byName.has(a)) ? p : undefined
    } catch {
      return undefined
    }
  })()
  if (parsed) {
    const lhs = apply(parsed, vars)
    return { title: `goal · ${t.label}`, subtitle: blurb, term: lhs, definition: { lhs, rhs: body }, goal: { label: t.label, params, body } }
  }
  const lhs = apply(atom(t.label), vars)
  const rules: Rules = new Map([...defaultRules, [t.label, { params, body }]])
  return { title: `goal · ${t.label}`, subtitle: blurb, term: lhs, rules, definition: { lhs, rhs: body } }
}

/** Explain a player-built term against a goal: fed variables, or every truth-table row. */
export const termSpec = (term: Term, target: Target | undefined): TheaterSpec => {
  const known = recognize(term)
  const title = known && term._tag === "App" ? `${show(term)}  =  ${known.name}` : show(term)
  const g = target ? goalOf(target) : undefined
  if (g?._tag === "Truth") {
    const variants = truthRows(g).map((r) => ({
      label: rowLabel(r.bits, r.expected),
      term: rowTerm(term, r.bits),
      expect: atom(r.expected)
    }))
    const rule = truthRule(g)
    return {
      title,
      subtitle: `Your token, run on every row of the ${g.label} truth table.`,
      term: variants[0]!.term,
      variants,
      goal: { label: g.label, params: rule.params, body: rule.body }
    }
  }
  const params = known ? [...known.params] : g ? [...g.behaviour.params] : ["x", "y", "z"]
  return {
    title,
    subtitle: `What this token does when you feed it ${params.join(", ")}.`,
    term: apply(term, params.map(variable)),
    ...(g ? { goal: { label: g.label, params: g.behaviour.params, body: g.behaviour.body } } : {})
  }
}

/** Explain a machine from the tray: the apply castle, a catalogue combinator, or an opaque APL primitive. */
export const machineSpec = (kind: "source" | "apply", name: string | undefined): TheaterSpec => {
  if (kind === "apply") {
    return {
      title: "apply · the red factory",
      subtitle: "Function in the left port (f), argument in the right port (x).",
      term: app(variable("f"), variable("x")),
      rules: new Map(),
      note: "apply just glues f to x. The rewriting happens when a combinator has all of its arguments."
    }
  }
  return (name ? combinatorSpec(name) : undefined) ?? {
    title: `${name} · APL primitive`,
    subtitle: "An opaque function from the APL world.",
    term: apply(atom(name ?? "?"), [variable("w")]),
    rules: new Map(),
    note: `${name} has no rule here, so it never rewrites. Combinators only move it around.`
  }
}

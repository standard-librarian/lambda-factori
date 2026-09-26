import { Schema } from "effect"
import { behavesAs, behaviour, type Behaviour, normalize } from "./Reduce.ts"
import { apply, atom, parse, type Term, variable } from "./Term.ts"

/**
 * A bin's goal: either an extensional behaviour (`params` → `body`), or a
 * truth table over Church booleans (`truth`, outputs in binary input order,
 * e.g. "0001" for and).
 */
export const Target = Schema.Struct({
  label: Schema.String,
  params: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  truth: Schema.optional(Schema.String),
  quota: Schema.optional(Schema.Int)
})
export type Target = typeof Target.Type

export class Level extends Schema.Class<Level>("lambda-factori/core/Level")({
  id: Schema.String,
  world: Schema.String,
  title: Schema.String,
  blurb: Schema.String,
  hint: Schema.optional(Schema.String),
  /** Atoms available as source buildings. */
  sources: Schema.Array(Schema.String),
  targets: Schema.NonEmptyArray(Target),
  /** Catalogue combinator whose sticker this level awards. */
  sticker: Schema.optional(Schema.String),
  /** Combinators whose real-world usage is shown after the level (defaults to the sticker). */
  features: Schema.optional(Schema.Array(Schema.String)),
  /** Id of the paper shown after the level, where these combinators were introduced. */
  paper: Schema.optional(Schema.String)
}) {}

export const Paper = Schema.Struct({
  id: Schema.String,
  authors: Schema.String,
  year: Schema.Int,
  title: Schema.String,
  venue: Schema.String,
  note: Schema.String
})
export type Paper = typeof Paper.Type

/** A real-world use of a combinator, shown after a level: "in the wild". */
export const Usage = Schema.Struct({
  lang: Schema.String,
  code: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
  note: Schema.String
})
export type Usage = typeof Usage.Type

export const LevelPack = Schema.Struct({
  worlds: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String, subtitle: Schema.String })),
  levels: Schema.Array(Level),
  papers: Schema.Array(Paper),
  usage: Schema.optional(Schema.Record(Schema.String, Schema.Array(Usage)))
})
export type LevelPack = typeof LevelPack.Type

export const DEFAULT_QUOTA = 3

export type Goal =
  | { readonly _tag: "Ext"; readonly label: string; readonly behaviour: Behaviour }
  | { readonly _tag: "Truth"; readonly label: string; readonly inputs: number; readonly table: string }

export const INPUT_NAMES = "abcde"

export const goalOf = (t: Target): Goal => {
  if (t.truth !== undefined) {
    return { _tag: "Truth", label: t.label, inputs: Math.round(Math.log2(t.truth.length)), table: t.truth }
  }
  return { _tag: "Ext", label: t.label, behaviour: behaviour(t.params ?? "", parse(t.body ?? t.label)) }
}

export interface TruthRow {
  readonly bits: ReadonlyArray<boolean>
  readonly expected: "0" | "1"
}

export const truthRows = (g: Goal & { _tag: "Truth" }): ReadonlyArray<TruthRow> =>
  Array.from({ length: 2 ** g.inputs }, (_, i) => ({
    bits: Array.from({ length: g.inputs }, (_, k) => ((i >> (g.inputs - 1 - k)) & 1) === 1),
    expected: g.table[i] === "1" ? "1" : "0"
  }))

/** `term ⊤ ⊥ … 1 0`: feed Church booleans, then two markers to see which one it picks. */
export const rowTerm = (term: Term, bits: ReadonlyArray<boolean>): Term =>
  apply(term, [...bits.map((b) => atom(b ? "⊤" : "⊥")), atom("1"), atom("0")])

export const satisfies = (term: Term, goal: Goal): boolean => {
  if (goal._tag === "Ext") return behavesAs(term, goal.behaviour)
  return truthRows(goal).every((row) => {
    const nf = normalize(rowTerm(term, row.bits))
    return nf !== undefined && nf.term._tag === "Atom" && nf.term.name === row.expected
  })
}

/**
 * A reference definition for a truth-table goal, as a decision tree over its
 * inputs, so the theater can animate it like any other rule.
 */
export const truthRule = (g: Goal & { _tag: "Truth" }): { params: Array<string>; body: Term } => {
  const params = [...INPUT_NAMES.slice(0, g.inputs)]
  const tree = (k: number, index: number): Term =>
    k === g.inputs
      ? atom(g.table[index] === "1" ? "⊤" : "⊥")
      : apply(variable(params[k]!), [tree(k + 1, index * 2 + 1), tree(k + 1, index * 2)])
  return { params, body: tree(0, 0) }
}

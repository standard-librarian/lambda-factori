import { parse, show, type Term } from "./Term.ts"

export type Family = "schonfinkel" | "curry" | "smullyan" | "apl" | "bqn" | "bool"

/**
 * A named combinator: `name params… → body`. Each one is a bird in Smullyan's
 * aviary and doubles as a sticker, a recipe-book page and (once derived) a
 * source building the player can place.
 */
export interface Combinator {
  readonly name: string
  readonly bird: string
  readonly params: ReadonlyArray<string>
  readonly body: Term
  readonly rule: string
  readonly family: Family
  /** Building / token colour, following Word Factori's colour-per-machine language. */
  readonly color: number
  readonly shade: number
  /** APL/BQN spelling of the same combinator, if any. */
  readonly apl?: string
  readonly blurb: string
}

const make = (
  name: string,
  bird: string,
  params: string,
  body: string,
  family: Family,
  color: readonly [number, number],
  blurb: string,
  apl?: string
): Combinator => ({
  name,
  bird,
  params: [...params],
  body: parse(body),
  rule: `${name}${params} = ${show(parse(body))}`,
  family,
  color: color[0],
  shade: color[1],
  blurb,
  ...(apl === undefined ? {} : { apl })
})

const INDIGO = [0x4f56b8, 0x3a3f8f] as const
const GREEN = [0x4cc887, 0x399871] as const
const BLUE = [0x306db5, 0x255590] as const
const ORANGE = [0xee8d56, 0xc96a38] as const
const YELLOW = [0xf7bd57, 0xd89a35] as const
const TEAL = [0x2fa7a0, 0x207a75] as const
const PLUM = [0x9b5fc0, 0x74418f] as const
const RED = [0xd9434f, 0xa3222e] as const

export const catalogue: ReadonlyArray<Combinator> = [
  make("S", "Starling", "xyz", "x z (y z)", "schonfinkel", INDIGO, "Schönfinkel's fusion: shares z with both x and y.", "hook · BQN ⟜"),
  make("K", "Kestrel", "xy", "x", "schonfinkel", ORANGE, "Schönfinkel's constancy: keeps x, forgets y.", "⊣"),
  make("KI", "Kite", "xy", "y", "smullyan", TEAL, "K applied to I: ignore the first argument, return the second.", "⊢ dyadic"),
  make("I", "Idiot", "x", "x", "schonfinkel", GREEN, "Identity. The first thing everyone builds: SKK.", "⊢"),
  make("B", "Bluebird", "xyz", "x (y z)", "curry", BLUE, "Composition — feed z through y, then x.", "∘ · 2-train"),
  make("C", "Cardinal", "xyz", "x z y", "curry", YELLOW, "Swap the last two arguments.", "⍨ dyadic · BQN ˜"),
  make("W", "Warbler", "xy", "x y y", "curry", PLUM, "Duplicate an argument.", "⍨ monadic · BQN ˜"),
  make("T", "Thrush", "xy", "y x", "smullyan", TEAL, "Reverse application: x, then apply y to it.", "&"),
  make("M", "Mockingbird", "x", "x x", "smullyan", PLUM, "Self application: x applied to itself."),
  make("V", "Vireo", "xyz", "z x y", "smullyan", TEAL, "Pairing: holds x and y until handed a selector z."),
  make("B₁", "Blackbird", "xyzw", "x (y z w)", "apl", BLUE, "Dyadic atop: combine two args with y, then x.", "⍤ (dyadic)"),
  make("Φ", "Phoenix", "xyzw", "x (y w) (z w)", "apl", TEAL, "The monadic fork (f g h): g (f w) (h w).", "(f g h)"),
  make("Ψ", "Psi", "xyzw", "x (y z) (y w)", "apl", ORANGE, "Over: pre-process both args with y.", "⍥ · BQN ○"),
  make("Φ₁", "Pheasant", "xyzvw", "x (y v w) (z v w)", "apl", GREEN, "The dyadic fork: a (f g h) b.", "a(f g h)b"),
  make("Σ", "Sigma", "xyz", "y (x z) z", "bqn", PLUM, "BQN's before, monadic: pre-process 𝕩 with 𝔽, then 𝔾 it against 𝕩.", "BQN ⊸"),
  make("D", "Dove", "xyzw", "x y (z w)", "bqn", GREEN, "Compose on the right argument only: 𝕨 𝔽⟜𝔾 𝕩.", "BQN ⟜ dyadic"),
  make("Δ", "Delta", "xyzw", "y (x z) w", "bqn", YELLOW, "Compose on the left argument only: 𝕨 𝔽⊸𝔾 𝕩.", "BQN ⊸ dyadic"),
  // Church booleans: a boolean *is* a choice between two things.
  make("⊤", "True", "xy", "x", "bool", GREEN, "Church's true picks the first of two options. It is K."),
  make("⊥", "False", "xy", "y", "bool", RED, "Church's false picks the second option. It is KI."),
  make("~", "Not", "p", "p ⊥ ⊤", "bool", ORANGE, "Not asks p to choose between false and true.", "~"),
  make("∧", "And", "pq", "p q ⊥", "bool", BLUE, "If p then q, else false.", "∧"),
  make("∨", "Or", "pq", "p ⊤ q", "bool", TEAL, "If p then true, else q.", "∨"),
  make("⊼", "Nand", "pq", "p (q ⊥ ⊤) ⊤", "bool", INDIGO, "Sheffer's stroke: not (p and q). Every gate can be built from it.", "⍲"),
  make("⊻", "Xor", "pq", "p (q ⊥ ⊤) q", "bool", PLUM, "Exactly one of p, q.", "≠ on booleans")
]

export const byName: ReadonlyMap<string, Combinator> = new Map(catalogue.map((c) => [c.name, c]))

export const colorOf = (name: string): { color: number; shade: number } => {
  const c = byName.get(name)
  return c ? { color: c.color, shade: c.shade } : { color: 0x7492cb, shade: 0x5872a8 }
}

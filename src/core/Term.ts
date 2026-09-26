/**
 * Combinatory-logic terms: atoms (named combinators or opaque primitives),
 * variables (used only for behavioural testing) and application.
 */
export type Term = Atom | Var | App

export interface Atom {
  readonly _tag: "Atom"
  readonly name: string
}

export interface Var {
  readonly _tag: "Var"
  readonly name: string
}

export interface App {
  readonly _tag: "App"
  readonly fn: Term
  readonly arg: Term
}

export const atom = (name: string): Atom => ({ _tag: "Atom", name })
export const variable = (name: string): Var => ({ _tag: "Var", name })
export const app = (fn: Term, arg: Term): App => ({ _tag: "App", fn, arg })

export const apply = (head: Term, args: ReadonlyArray<Term>): Term => args.reduce<Term>(app, head)

export const equals = (a: Term, b: Term): boolean => {
  if (a === b) return true
  if (a._tag !== b._tag) return false
  if (a._tag === "App") return equals(a.fn, (b as App).fn) && equals(a.arg, (b as App).arg)
  return a.name === (b as Atom | Var).name
}

export const size = (t: Term): number => (t._tag === "App" ? size(t.fn) + size(t.arg) : 1)

/** Splits `f a b c` into head `f` and args `[a, b, c]`. */
export const spine = (t: Term): { head: Atom | Var; args: Array<Term> } => {
  const args: Array<Term> = []
  let cur = t
  while (cur._tag === "App") {
    args.push(cur.arg)
    cur = cur.fn
  }
  return { head: cur, args: args.reverse() }
}

/** Letter atoms (`S`, `B₁`, `Φ`) can be juxtaposed; symbol atoms (`÷`, `+/`) need spaces. */
const isSimpleName = (name: string) => /^\p{L}[₀-₉]*$/u.test(name)

/** Left-associative rendering with minimal parentheses: `S(KS)K`. */
export const show = (t: Term): string => {
  if (t._tag !== "App") return t.name
  const { head, args } = spine(t)
  let out = head.name
  let prevWord = !isSimpleName(head.name)
  for (const a of args) {
    if (a._tag === "App") {
      out += `(${show(a)})`
      prevWord = false
    } else {
      // Multi-character atoms like `+/` need a space from their neighbours.
      const word = !isSimpleName(a.name)
      out += (prevWord || word) && !out.endsWith(")") ? ` ${a.name}` : a.name
      prevWord = word
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export class ParseError extends Error {
  readonly input: string
  constructor(input: string, message: string) {
    super(`${message} in "${input}"`)
    this.input = input
  }
}

/**
 * Tokenizer rules:
 * - `(` and `)` are brackets, whitespace separates.
 * - A lowercase ASCII letter is a variable.
 * - An uppercase or Greek letter, optionally followed by subscript digits, is one atom (`S`, `B₁`, `Φ`).
 * - Any other run of symbol characters is a single opaque atom (`+/`, `÷`, `≢`).
 */
const tokenize = (input: string): Array<string> => {
  const chars = [...input]
  const tokens: Array<string> = []
  let i = 0
  const isSub = (c: string | undefined) => c !== undefined && /[₀-₉]/u.test(c)
  const isLetter = (c: string) => /\p{L}/u.test(c)
  const isSymbol = (c: string | undefined) => c !== undefined && !/[\s()]/u.test(c) && !isLetter(c) && !isSub(c)
  while (i < chars.length) {
    const c = chars[i]!
    if (/\s/u.test(c)) {
      i++
    } else if (c === "(" || c === ")") {
      tokens.push(c)
      i++
    } else if (isLetter(c)) {
      let tok = c
      i++
      while (isSub(chars[i])) tok += chars[i++]
      tokens.push(tok)
    } else {
      let tok = ""
      while (isSymbol(chars[i])) tok += chars[i++]
      if (tok === "") throw new ParseError(input, `Unexpected character "${c}"`)
      tokens.push(tok)
    }
  }
  return tokens
}

const isVarToken = (tok: string) => /^[a-z]$/.test(tok)

export const parse = (input: string): Term => {
  const tokens = tokenize(input)
  let pos = 0
  const parseSeq = (): Term => {
    let acc: Term | undefined
    while (pos < tokens.length && tokens[pos] !== ")") {
      const next = parseOne()
      acc = acc === undefined ? next : app(acc, next)
    }
    if (acc === undefined) throw new ParseError(input, "Empty expression")
    return acc
  }
  const parseOne = (): Term => {
    const tok = tokens[pos++]!
    if (tok === "(") {
      const inner = parseSeq()
      if (tokens[pos++] !== ")") throw new ParseError(input, "Missing )")
      return inner
    }
    return isVarToken(tok) ? variable(tok) : atom(tok)
  }
  const result = parseSeq()
  if (pos !== tokens.length) throw new ParseError(input, "Unbalanced )")
  return result
}

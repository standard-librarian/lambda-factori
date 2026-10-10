/**
 * The envelope warm-up's arithmetic: a tiny expression format, parsed by hand (no `eval`, no
 * `Function`). Numbers take `k`, `M`, `B` suffixes (`86400`, `300M`, `1.5k`); names refer to
 * earlier estimates by id (lowercase letters and digits, no hyphen); `+ - * /`, unary minus and
 * parentheses. `evaluate` never throws: a bad expression, a division by zero or a result that isn't finite is a readable `error`.
 */

/** An estimate already worked out; later expressions may name it. */
export interface Known {
  readonly id: string
  readonly value: number
}

export type Evaluated = { readonly value: number } | { readonly error: string }

const suffix: Readonly<Record<string, number>> = { k: 1e3, M: 1e6, B: 1e9 }
const tokenPattern = /\s*(?:(\d+(?:\.\d+)?(?:e\d+)?[kMB]?)|([a-z][a-z0-9]*)|(.))/gy

type Token = { readonly kind: "num" | "name" | "op"; readonly text: string }

const tokenize = (expr: string): ReadonlyArray<Token> => {
  const out: Array<Token> = []
  tokenPattern.lastIndex = 0
  for (let m = tokenPattern.exec(expr); m !== null && m.index < expr.length; m = tokenPattern.exec(expr)) {
    if (m[1] !== undefined) out.push({ kind: "num", text: m[1] })
    else if (m[2] !== undefined) out.push({ kind: "name", text: m[2] })
    else if (m[3] !== undefined && m[3].trim() !== "") out.push({ kind: "op", text: m[3] })
  }
  return out
}

class ParseError extends Error {}

const numberValue = (text: string): number => {
  const unit = suffix[text.slice(-1)]
  return unit === undefined ? Number(text) : Number(text.slice(0, -1)) * unit
}

/** Evaluates `expr` with `known` in scope. */
export const evaluate = (expr: string, known: ReadonlyArray<Known>): Evaluated => {
  const tokens = tokenize(expr)
  let pos = 0
  const peek = (): Token | undefined => tokens[pos]
  const take = (): Token => {
    const t = tokens[pos++]
    if (t === undefined) throw new ParseError("the expression ends too early")
    return t
  }
  const factor = (): number => {
    const t = take()
    if (t.kind === "num") return numberValue(t.text)
    if (t.kind === "name") {
      const hit = known.find((k) => k.id === t.text)
      if (hit === undefined) throw new ParseError(`"${t.text}" is not an earlier estimate`)
      return hit.value
    }
    if (t.text === "-") return -factor()
    if (t.text === "(") {
      const inner = sum()
      if (take().text !== ")") throw new ParseError("missing )")
      return inner
    }
    throw new ParseError(`unexpected "${t.text}"`)
  }
  const product = (): number => {
    let acc = factor()
    for (let t = peek(); t?.text === "*" || t?.text === "/"; t = peek()) {
      take()
      const operand = factor()
      if (t.text === "/" && operand === 0) throw new ParseError("division by zero")
      acc = t.text === "*" ? acc * operand : acc / operand
    }
    return acc
  }
  const sum = (): number => {
    let acc = product()
    for (let t = peek(); t?.text === "+" || t?.text === "-"; t = peek()) {
      take()
      acc = t.text === "+" ? acc + product() : acc - product()
    }
    return acc
  }
  try {
    const value = sum()
    const rest = peek()
    if (rest !== undefined) throw new ParseError(`unexpected "${rest.text}"`)
    if (!Number.isFinite(value)) throw new ParseError("the result is not a finite number")
    return { value }
  } catch (e) {
    if (e instanceof ParseError) return { error: e.message }
    throw e
  }
}

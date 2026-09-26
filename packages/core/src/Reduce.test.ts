import { describe, expect, it } from "vitest"
import { byName } from "./Catalogue.ts"
import { behavesAs, behaviour, normalize, recognize } from "./Reduce.ts"
import { parse, show } from "./Term.ts"

const derivations: ReadonlyArray<readonly [string, string]> = [
  ["I", "SKK"],
  ["I", "SKS"],
  ["B", "S(KS)K"],
  ["C", "S(BBS)(KK)"],
  ["W", "SS(SK)"],
  ["T", "S(K(SI))K"],
  ["M", "SII"],
  ["V", "BCT"],
  ["B₁", "BBB"],
  ["Φ", "B(BS)B"]
]

describe("parse/show", () => {
  it("round-trips left-associative application", () => {
    for (const src of ["S(KS)K", "S(BBS)(KK)", "B₁Φ(KI)"]) expect(show(parse(src))).toBe(src)
  })
  it("keeps opaque multi-character atoms apart", () => {
    const t = parse("÷ (+/ x) (≢ x)")
    expect(show(t)).toBe("÷(+/ x)(≢ x)")
    expect(show(parse("Φ÷ ≢ +/"))).toBe("Φ ÷ ≢ +/")
    expect(show(parse(show(t)))).toBe(show(t))
  })
})

describe("reduction", () => {
  it("normalises S K K x to x", () => {
    expect(show(normalize(parse("SKKx"))!.term)).toBe("x")
  })
  it("gives up on non-terminating terms", () => {
    expect(normalize(parse("SII(SII)"))).toBeUndefined()
  })
  it.each(derivations)("%s = %s", (name, recipe) => {
    expect(behavesAs(parse(recipe), byName.get(name)!)).toBe(true)
    expect(recognize(parse(recipe))?.name).toBe(name)
  })
  it("rejects wrong recipes", () => {
    expect(behavesAs(parse("SK"), byName.get("I")!)).toBe(false)
    expect(recognize(parse("KK"))).toBeUndefined()
  })
  it("checks APL trains with opaque primitives", () => {
    const avg = behaviour("w", "÷ (+/ w) (≢ w)")
    expect(behavesAs(parse("Φ ÷ +/ ≢"), avg)).toBe(true)
    expect(behavesAs(parse("Φ ÷ ≢ +/"), avg)).toBe(false)
  })
})

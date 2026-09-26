import { describe, expect, it } from "vitest"
import { baseId, describeStep, trace, unlabel } from "./Trace.ts"
import { parse, show } from "./Term.ts"

const shows = (src: string) => trace(parse(src)).terms.map((t) => show(unlabel(t)))

describe("trace", () => {
  it("steps S K K x to x", () => {
    expect(shows("SKKx")).toEqual(["SKKx", "Kx(Kx)", "x"])
  })

  it("steps K I x y through I y", () => {
    expect(shows("KIxy")).toEqual(["KIxy", "Iy", "y"])
  })

  it("reduces inside arguments once the head is stuck", () => {
    expect(shows("x(Iy)")).toEqual(["x(Iy)", "xy"])
  })

  it("tracks identities: S copies z, K drops y", () => {
    const s = trace(parse("Sxyz"))
    const [before, after] = s.terms
    const z = (() => {
      let cur = before!
      if (cur._tag !== "App") throw new Error()
      return cur.arg.id
    })()
    const ids: Array<string> = []
    const walk = (t: typeof after) => {
      if (!t) return
      if (t._tag === "App") {
        walk(t.fn)
        walk(t.arg)
      } else ids.push(t.id)
    }
    walk(after)
    expect(ids.filter((id) => baseId(id) === z)).toHaveLength(2)
    expect(s.steps[0]).toMatchObject({ rule: "S", copied: ["z"], dropped: [] })
    expect(describeStep(s.steps[0]!)).toBe("S copies z and reorders its arguments")
    expect(s.steps[0]).toMatchObject({ redex: "Sxyz", result: "xz(yz)" })

    const k = trace(parse("Kxy")).steps[0]!
    expect(k.dropped).toEqual(["y"])
    expect(describeStep(k)).toBe("K drops y")
    const ki = trace(parse("KIxy")).steps[0]!
    expect(describeStep(ki)).toBe("K drops x")
    expect(ki).toMatchObject({ redex: "KIx", result: "I" })
  })

  it("stops on non-terminating terms", () => {
    expect(trace(parse("SII(SII)"), undefined, 10).normal).toBe(false)
  })
})

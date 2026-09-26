import { describe, expect, it } from "vitest"
import { blankLevel, parseTargets, showTargets, validateLevel, type LevelFields } from "./levelText.ts"

const fields = (over: Partial<LevelFields> = {}): LevelFields => ({
  id: "my-level", title: "t", blurb: "b", hint: "", sources: "S, K", targets: "KI | xy | y", sticker: "", paper: "", ...over
})

describe("level editor text", () => {
  it("round-trips the bins format", () => {
    const l = blankLevel()
    expect(parseTargets(showTargets(l))).toEqual(l.targets.map((t) => ({ label: t.label, params: t.params, body: t.body })))
    expect(parseTargets("and | truth 0001")).toEqual([{ label: "and", truth: "0001" }])
  })

  it("accepts a valid level and reports opaque atoms", () => {
    const v = validateLevel(fields({ sources: "S, K, ⍳" }))
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.opaque).toEqual(["⍳"])
  })

  it("rejects bad ids and truth tables that aren't a power of two", () => {
    const v = validateLevel(fields({ id: "my level", targets: "x | truth 011" }))
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.errors).toContain("id: letters, digits")
      expect(v.errors).toContain("power of two")
    }
  })
})

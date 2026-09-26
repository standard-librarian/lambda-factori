import { describe, expect, it } from "vitest"
import { check, parseProgram, run, type World } from "./vm.ts"

const world = (inbox: Array<number | string>, tiles: Record<string, number | string | undefined> = {}, desks: World["desks"] = new Map()): World => ({
  inbox,
  tiles: new Map(Object.entries(tiles)),
  desks
})

describe("office vm", () => {
  it("runs HRM's Mail Room (copy inbox to outbox)", () => {
    const p = parseProgram(["a:", "  INBOX", "  OUTBOX", "  JUMP a"])
    const t = run(p, world([3, 9, 4]))
    expect(t.halted).toBe("inbox-empty")
    expect(t.final.outbox).toEqual([3, 9, 4])
    expect(check(t, [3, 9, 4]).ok).toBe(true)
  })

  it("triples with copyto/add", () => {
    const p = parseProgram(["a:", "inbox", "copyto 0", "add 0", "add 0", "outbox", "jump a"])
    const t = run(p, world([2, -3], { "0": undefined }))
    expect(t.final.outbox).toEqual([6, -9])
    expect(p.filter((l) => l.number !== undefined)).toHaveLength(6)
  })

  it("reports HRM errors", () => {
    expect(run(parseProgram(["outbox"]), world([])).error).toMatch(/Empty hands/)
    expect(run(parseProgram(["copyfrom 3"]), world([], { "3": undefined })).error).toMatch(/empty/)
    const bad = run(parseProgram(["inbox", "outbox"]), world([5]))
    expect(check(bad, [6]).message).toMatch(/expected 6/)
  })

  it("supports jumps, bumps and indirect addressing", () => {
    const p = parseProgram(["copyfrom [p]", "outbox", "bump+ p", "copyfrom [p]", "outbox"])
    const t = run(p, world([], { p: 1, "1": "A", "2": "B" }))
    expect(t.final.outbox).toEqual(["A", "B"])
  })

  it("passes through desks and counts trips", () => {
    const desks = new Map([["usecase", { id: "usecase" }], ["service", { id: "service" }], ["repo", { id: "repo", work: "set:row" }]])
    const p = parseProgram(["inbox", "pass usecase", "pass service", "work repo", "pass service", "pass usecase", "outbox"])
    const t = run(p, world(["req"], {}, desks as never))
    expect(t.final.outbox).toEqual(["row"])
    expect(t.final.trips).toBe(7)
  })

  it("rejects unknown commands and labels", () => {
    expect(() => parseProgram(["frobnicate"])).toThrow(/unknown command/)
    expect(() => parseProgram(["jump nowhere"])).toThrow(/no label/)
  })
})

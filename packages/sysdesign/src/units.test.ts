import { describe, expect, it } from "vitest"
import { catalogue, layout, monthlyUsd } from "./Catalogue.ts"
import { configure, move, place, remove, unwire, wire } from "./Design.ts"
import { evaluate } from "./estimate.ts"
import type { Design, Placed } from "./Level.ts"
import { makeRng, nextFloat, zipfRank } from "./rng.ts"
import { trafficAt } from "./traffic.ts"

const at = { col: 0, row: 0 }
const svc = (id: string, locked?: boolean): Placed => ({ id, kind: "service", at, config: {}, ...(locked ? { locked } : {}) })
const empty: Design = { components: [], wires: [] }

describe("Design edits", () => {
  const base = place(place(place(empty, svc("a", true)), svc("b")), svc("c"))

  it("places, refuses duplicates, and never mutates", () => {
    expect(base.components.map((c) => c.id)).toEqual(["a", "b", "c"])
    expect(place(base, svc("b"))).toBe(base)
    expect(empty.components).toEqual([])
  })

  it("wires between existing components only, once", () => {
    const w = wire(base, { from: "a", to: "b" })
    expect(w.wires).toHaveLength(1)
    expect(wire(w, { from: "a", to: "b" })).toBe(w)
    expect(wire(w, { from: "a", to: "zzz" })).toBe(w)
    expect(wire(w, { from: "a", to: "a" })).toBe(w)
    expect(unwire(w, "a", "b").wires).toEqual([])
  })

  it("removing a component removes its wires", () => {
    const w = wire(wire(base, { from: "a", to: "b" }), { from: "b", to: "c" })
    expect(remove(w, "b").wires).toEqual([])
    expect(remove(w, "b").components.map((c) => c.id)).toEqual(["a", "c"])
  })

  it("locked components can't be moved, removed or configured", () => {
    expect(move(base, "a", { col: 3, row: 3 })).toBe(base)
    expect(remove(base, "a")).toBe(base)
    expect(configure(base, "a", { instances: 9 })).toBe(base)
    expect(move(base, "b", { col: 3, row: 3 }).components[1]!.at).toEqual({ col: 3, row: 3 })
    expect(configure(base, "b", { instances: 9 }).components[1]!.config).toEqual({ instances: 9 })
  })
})

describe("catalogue", () => {
  it("expands config into machines and a price", () => {
    expect(layout("sqlDb", { shards: 3, replicas: 1 })).toEqual({ shards: 3, perShard: 2 })
    expect(layout("service", { instances: 4 })).toEqual({ shards: 1, perShard: 4 })
    expect(layout("client", {})).toEqual({ shards: 0, perShard: 0 })
    expect(monthlyUsd("service", { instances: 4 })).toBe(4 * catalogue.service.usdPerMonth)
    expect(monthlyUsd("cache", { instances: 1, gb: 2 })).toBe(catalogue.cache.usdPerMonth + 2 * 15)
  })
})

describe("estimate", () => {
  it("does arithmetic with suffixes, names and precedence", () => {
    expect(evaluate("100M * 5 / 86400", [])).toEqual({ value: (100e6 * 5) / 86400 })
    expect(evaluate("2 + 3 * (4 - 1)", [])).toEqual({ value: 11 })
    expect(evaluate("-dau / 2k", [{ id: "dau", value: 4000 }])).toEqual({ value: -2 })
  })

  it("reports bad input instead of throwing or evaluating code", () => {
    for (const bad of ["2 +", "foo", "(1", "1 2", "process.exit()", "1 $ 2"]) {
      expect(evaluate(bad, [])).toHaveProperty("error")
    }
  })
})

describe("rng", () => {
  it("is reproducible and stays in [0, 1)", () => {
    const a = makeRng(5)
    const b = makeRng(5)
    for (let i = 0; i < 100; i++) {
      const x = nextFloat(a)
      expect(x).toBe(nextFloat(b))
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it("zipf ranks favour the head more when skew grows, and uniform is flat", () => {
    const head = (skew: number) => {
      const rng = makeRng(1)
      let hits = 0
      for (let i = 0; i < 4000; i++) if (zipfRank(rng, 1e6, skew) < 100) hits++
      return hits / 4000
    }
    expect(head(0)).toBeLessThan(0.01)
    expect(head(1)).toBeGreaterThan(0.3)
    expect(head(1.5)).toBeGreaterThan(head(1))
  })
})

describe("traffic", () => {
  it("follows each shape", () => {
    expect(trafficAt({ shape: "steady" }, 5, 10)).toBe(1)
    expect(trafficAt({ shape: "ramp", fromX: 0.2 }, 0, 10)).toBeCloseTo(0.2)
    expect(trafficAt({ shape: "ramp", fromX: 0.2 }, 10, 10)).toBe(1)
    expect(trafficAt({ shape: "spike", atMs: 2, x: 5, forMs: 3 }, 3, 10)).toBe(5)
    expect(trafficAt({ shape: "spike", atMs: 2, x: 5, forMs: 3 }, 6, 10)).toBe(1)
    expect(trafficAt({ shape: "diurnal", peakX: 3 }, 5, 10)).toBeCloseTo(3)
    expect(trafficAt({ shape: "diurnal", peakX: 3 }, 0, 10)).toBeCloseTo(1)
  })
})

import { describe, expect, it } from "vitest"
import { configure } from "./Design.ts"
import type { Design, Level } from "./Level.ts"
import { levels } from "./levels.ts"
import { createSim, runStage } from "./Sim.ts"

const bitly = levels.find((l) => l.id === "bitly")!
const withoutCache = bitly.naive![0]!.design

const stats = (level: Level, design: Design, stage: "build" | "scale" | "chaos" = "build") => runStage(level, design, stage)

describe("determinism", () => {
  it("same seed gives byte-identical stats, a different seed does not", () => {
    const a = JSON.stringify(stats(bitly, bitly.reference))
    expect(JSON.stringify(stats(bitly, bitly.reference))).toBe(a)
    expect(JSON.stringify(runStage(bitly, bitly.reference, "build", 99))).not.toBe(a)
  })

  it("seeking equals running from 0, forwards and back", () => {
    const run = (until: number) => {
      const sim = createSim(bitly, bitly.reference, "chaos")
      while (sim.now() < until) sim.step()
      return JSON.stringify(sim.stats())
    }
    const sim = createSim(bitly, bitly.reference, "chaos")
    sim.seek(12_340)
    expect(JSON.stringify(sim.stats())).toBe(run(12_340))
    sim.seek(3_450)
    expect(JSON.stringify(sim.stats())).toBe(run(3_450))
    sim.seek(9_000)
    expect(JSON.stringify(sim.stats())).toBe(run(9_000))
  })

  it("step() returns typed events the renderer can follow", () => {
    const sim = createSim(bitly, bitly.reference, "build")
    const seen = new Set<string>()
    while (sim.now() < 3_000) for (const e of sim.step()) seen.add(e.ev)
    for (const ev of ["emit", "move", "queue", "served", "done", "util", "cache"]) expect(seen).toContain(ev)
  })
})

describe("queueing", () => {
  it("a bounded queue at 2x load rejects instead of growing latency without bound", () => {
    const squeezed = configure(bitly.reference, "api", { instances: 1 })
    const s = stats(bitly, squeezed, "scale")
    const redirect = s.types.redirect!
    expect(redirect.rejected).toBeGreaterThan(redirect.emitted * 0.1)
    expect(Math.max(...redirect.latenciesMs)).toBeLessThan(1000)
    expect(s.util.api).toBeGreaterThan(1.8)
  })

  it("latency rises before errors do", () => {
    const light = stats(bitly, bitly.reference, "build").types.redirect!
    const busy = stats(bitly, configure(bitly.reference, "api", { instances: 2 }), "scale").types.redirect!
    expect(Math.max(...busy.latenciesMs)).toBeGreaterThan(Math.max(...light.latenciesMs))
  })
})

describe("data effects", () => {
  it("cache hit rate rises with cache size", () => {
    const rate = (gb: number) => stats(bitly, configure(bitly.reference, "cache", { gb })).cacheHitRate.cache!
    const [small, medium, large] = [rate(0.01), rate(0.1), rate(2)]
    expect(small).toBeLessThan(medium)
    expect(medium).toBeLessThan(large)
  })

  it("a skewed partition key makes one shard hotter than a uniform one", () => {
    const celebrities: Level = { ...bitly, datasets: bitly.datasets.map((d) => (d.id === "urls" ? { ...d, skew: 1.6 } : d)) }
    const sharded = (partitionKey: string) =>
      stats(celebrities, configure(withoutCache, "urls-db", { shards: 4, replicas: 0, partitionKey }), "scale").util["urls-db"]!
    expect(sharded("natural")).toBeGreaterThan(sharded("uniform") * 1.3)
  })

  it("strong reads on lagging replicas are stale unless reads stay on the primary", () => {
    const strong: Level = {
      ...bitly,
      requests: [
        { ...bitly.requests[0]!, ops: bitly.requests[0]!.ops.map((op) => (op.do === "read" ? { ...op, consistency: "strong" as const } : op)) as never },
        bitly.requests[1]!
      ]
    }
    const stale = (readFrom: string) => {
      const s = stats(strong, configure(withoutCache, "urls-db", { readFrom }), "scale")
      return s.staleReads / s.strongReads
    }
    expect(stale("any")).toBeGreaterThan(0.1)
    expect(stale("primary")).toBe(0)
  })
})

describe("chaos", () => {
  const killApi = (design: Design) => stats(bitly, design, "chaos").types.redirect!

  it("a load balancer reroutes around a dead machine after its health check", () => {
    expect(killApi(bitly.reference).rejected).toBeGreaterThan(0)
    expect(killApi(bitly.reference).rejected).toBeLessThan(killApi(bitly.naive![1]!.design).rejected)
  })

  it("partition takes down every odd-numbered machine", () => {
    const partitioned: Level = {
      ...bitly,
      stages: { ...bitly.stages, chaos: { ...bitly.stages.chaos, chaos: [{ atMs: 0, forMs: 30_000, target: "api", event: { type: "partition" } }] } }
    }
    const direct = bitly.naive![1]!.design
    const s = runStage(partitioned, direct, "chaos").types.redirect!
    expect(s.rejected / s.emitted).toBeGreaterThan(0.3)
  })

  it("a store fails over to a replica after failoverMs", () => {
    const feed = levels.find((l) => l.id === "news-feed")!
    const s = stats(feed, feed.reference, "chaos")
    expect(s.types.post!.rejected).toBeGreaterThan(0)
    expect(s.types.post!.rejected).toBeLessThan(s.types.post!.emitted * 0.05)
  })

  it("slow multiplies service time", () => {
    const slowed: Level = {
      ...bitly,
      stages: { ...bitly.stages, build: { ...bitly.stages.build, chaos: [{ atMs: 0, forMs: 20_000, target: "api", event: { type: "slow", x: 40 } }] } }
    }
    const normal = stats(bitly, bitly.reference, "build").util.api!
    expect(runStage(slowed, bitly.reference, "build").util.api!).toBeGreaterThan(normal * 10)
  })
})

describe("async work", () => {
  it("enqueue ends client latency before the background work finishes", () => {
    const s = stats(bitly, bitly.reference, "build")
    expect(s.types.redirect!.latenciesMs.length).toBeGreaterThan(0)
    expect(s.types.redirect!.ok).toBeLessThanOrEqual(s.types.redirect!.latenciesMs.length)
  })

  it("a request type nothing can serve is rejected, not lost", () => {
    const broken = { components: bitly.reference.components, wires: bitly.reference.wires.filter((w) => w.to !== "api") }
    const s = stats(bitly, broken).types.redirect!
    expect(s.ok).toBe(0)
    expect(s.rejected).toBe(s.emitted)
  })
})

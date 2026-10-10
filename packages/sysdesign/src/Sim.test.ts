/**
 * Pins the simulation's behaviour on the bitly level: determinism and seek, queueing, cache and
 * shard effects, replica staleness, chaos, async acknowledgement and robustness to bad designs.
 * Tests pin the lessons (what rises, what rejects), not exact digits.
 */
import { describe, expect, it } from "vitest"
import { configure } from "./Design.ts"
import type { Design, Level } from "./Level.ts"
import { buildRoutes } from "./routing.ts"
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
  it("enqueue ends client latency while the background work is still unfinished", () => {
    const stuckWorker: Level = {
      ...bitly,
      stages: {
        ...bitly.stages,
        build: { ...bitly.stages.build, chaos: [{ atMs: 0, forMs: 20_000, target: "click-worker", event: { type: "slow", x: 5000 } }] }
      }
    }
    const sim = createSim(stuckWorker, stuckWorker.reference, "build")
    let acked = false
    while (!acked && sim.now() < 2_000) acked = sim.step().some((e) => e.ev === "done")
    expect(acked).toBe(true)
    const redirect = sim.stats().types.redirect!
    expect(redirect.latenciesMs.length).toBeGreaterThan(0)
    expect(Math.max(...redirect.latenciesMs)).toBeLessThan(100)
    expect(redirect.ok).toBe(0)
  })

  it("a request type nothing can serve is rejected, not lost", () => {
    const broken = { components: bitly.reference.components, wires: bitly.reference.wires.filter((w) => w.to !== "api") }
    const s = stats(bitly, broken).types.redirect!
    expect(s.ok).toBe(0)
    expect(s.rejected).toBe(s.emitted)
  })
})

describe("recovery", () => {
  it("a machine that was slow accepts traffic again once the slowness ends", () => {
    const slowThenFine: Level = {
      ...bitly,
      stages: {
        ...bitly.stages,
        build: { ...bitly.stages.build, chaos: [{ atMs: 0, forMs: 3_000, target: "api", event: { type: "slow", x: 40 } }] }
      }
    }
    const sim = createSim(slowThenFine, slowThenFine.reference, "build")
    sim.seek(3_000)
    expect(sim.stats().types.redirect!.rejected).toBeGreaterThan(0)
    sim.seek(10_000)
    const before = sim.stats().types.redirect!
    sim.seek(20_000)
    const after = sim.stats().types.redirect!
    expect((after.ok - before.ok) / (after.emitted - before.emitted)).toBeGreaterThan(0.95)
    expect(after.rejected - before.rejected).toBeLessThan((after.emitted - before.emitted) * 0.05)
  })
})

describe("derived datasets", () => {
  const feed = levels.find((l) => l.id === "news-feed")!
  const withoutFanout = {
    components: feed.reference.components.filter((c) => c.id !== "fanout-queue" && c.id !== "fanout-worker"),
    wires: feed.reference.wires.filter((w) => !w.from.startsWith("fanout") && !w.to.startsWith("fanout"))
  }

  it("a feed nothing builds is empty: its reads find nothing, however good the store", () => {
    const empty = stats(feed, withoutFanout).types.feed!
    expect(empty.ok).toBe(0)
    expect(stats(feed, feed.reference).types.feed!.ok).toBeGreaterThan(stats(feed, feed.reference).types.feed!.emitted * 0.95)
  })
})

describe("replica lag", () => {
  it("comes from write load: a read-only store with a replica has no stale reads", () => {
    const readOnly: Level = {
      ...bitly,
      requests: [{
        ...bitly.requests[0]!,
        ops: [{ do: "read", dataset: "urls", consistency: "strong" }]
      }],
      stages: { ...bitly.stages, scale: { ...bitly.stages.scale, traffic: 12 } }
    }
    const design = configure(withoutCache, "urls-db", { shards: 1, replicas: 1 })
    const s = runStage(readOnly, design, "scale")
    expect(s.strongReads).toBeGreaterThan(0)
    expect(s.util["urls-db"]).toBeGreaterThan(0.5)
    expect(s.staleReads).toBe(0)
  })
})

describe("routing loops", () => {
  const ping: Level = {
    ...bitly,
    requests: [{ id: "ping", label: "ping", color: "#fff", rps: 200, traffic: { shape: "steady" }, ops: [{ do: "compute", ms: 1 }] }]
  }
  const at = { col: 0, row: 0 }
  const node = (id: string, kind: "lb" | "service" | "client"): Design["components"][number] => ({ id, kind, at, config: {} })
  // a and b point at each other, and the way out (c, then the service) hangs off a.
  const cyclic: Design = {
    components: [node("clients", "client"), node("b", "lb"), node("a", "lb"), node("c", "lb"), node("svc", "service")],
    wires: [
      { from: "clients", to: "b" },
      { from: "clients", to: "a" },
      { from: "b", to: "a" },
      { from: "a", to: "b" },
      { from: "a", to: "c" },
      { from: "c", to: "svc" }
    ]
  }

  it("every hop gets closer to a server, so wires in a cycle never hold a token", () => {
    const routes = buildRoutes(ping, cyclic)
    expect(routes.next(2, 0, 0)).toEqual([3])
    expect(routes.next(1, 0, 0)).toEqual([2])
  })

  it("so every request through such a design finishes", () => {
    const s = runStage(ping, cyclic, "build").types.ping!
    expect(s.ok).toBeGreaterThan(s.emitted * 0.95)
  })
})

describe("bad designs", () => {
  it("settings that give zero machines don't crash the sim", () => {
    for (const instances of [0, "many", Number.NaN]) {
      const s = runStage(bitly, configure(bitly.reference, "api", { instances }), "build").types.redirect!
      expect(s.ok + s.rejected).toBeGreaterThan(0)
    }
  })
})

describe("seek", () => {
  it("clamps to [0, durationMs] and ignores invalid input", () => {
    const sim = createSim(bitly, bitly.reference, "build")
    sim.seek(2_000)
    sim.seek(-500)
    expect(sim.now()).toBe(0)
    sim.seek(Number.NaN)
    expect(sim.now()).toBe(0)
    sim.seek(1_000)
    const run = createSim(bitly, bitly.reference, "build")
    while (run.now() < 1_000) run.step()
    expect(JSON.stringify(sim.stats())).toBe(JSON.stringify(run.stats()))
    sim.seek(Number.POSITIVE_INFINITY)
    expect(sim.now()).toBe(sim.durationMs)
    sim.seek(sim.durationMs + 50_000)
    expect(sim.now()).toBe(sim.durationMs)
  })
})

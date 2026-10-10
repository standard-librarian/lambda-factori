/**
 * The deterministic traffic simulation: a (level, design, stage, seed) -> state-at-time function
 * with 10 ms steps. Tokens are batches of `rpsPerToken` requests; each moves machine to machine
 * following its ops, waits in a bounded FIFO at each machine instance (so latency rises before
 * errors start), and ends in an exit (ok) or the reject bin. It hides: queue and service-time
 * arithmetic, Zipf cache hits, shard hot spots, replica lag, chaos with health-check reroute
 * and failover, and snapshots (every 1 s) so `seek` equals running from 0. The renderer gets
 * small typed `SimEvent`s from `step()`; scoring reads `stats()`.
 */
import { catalogue, configOf, layout, num, type CatalogueEntry, type Config } from "./Catalogue.ts"
import type { Design, Level, StageName } from "./Level.ts"
import { makeRng, nextFloat, zipfRank, type Rng } from "./rng.ts"
import { buildRoutes } from "./routing.ts"
import { trafficAt } from "./traffic.ts"

/** Simulated milliseconds per step. */
export const STEP_MS = 10
/**
 * How much work a machine's queue may hold, in milliseconds of its own capacity (a queue
 * component instead bounds its depth in requests). Bounding work, not tokens, keeps a token
 * that fans out to 100 writes from counting as one cheap slot.
 */
const QUEUE_MS = 500
/** Replica lag, ms, past which a strong read of a replica counts as stale. */
const STALE_LAG_MS = 50
/**
 * Longest stretch a machine charges for one token before the rest of its work goes to the back of
 * the queue as a ghost, ms. A fan-out push is one big token; sliced, it shares the machine with
 * small ones instead of blocking them.
 */
const SLICE_MS = 20
const STUCK = -2
const DONE = -1

export type RejectReason = "queueFull" | "dead" | "noRoute"

/** What the renderer animates; `token` is a stable id, `at`/`from`/`to` are component ids. */
export type SimEvent =
  | { readonly ev: "emit"; readonly token: number; readonly type: string; readonly at: string }
  | { readonly ev: "move"; readonly token: number; readonly from: string; readonly to: string }
  | { readonly ev: "queue"; readonly token: number; readonly at: string; readonly depth: number }
  | { readonly ev: "served"; readonly token: number; readonly at: string }
  | { readonly ev: "reject"; readonly token: number; readonly at: string; readonly why: RejectReason }
  | { readonly ev: "done"; readonly token: number; readonly type: string; readonly latencyMs: number }
  | { readonly ev: "util"; readonly at: string; readonly util: number }
  | { readonly ev: "cache"; readonly at: string; readonly hit: boolean }
  | { readonly ev: "lag"; readonly at: string; readonly lagMs: number }

export interface TypeStats {
  readonly emitted: number
  readonly ok: number
  readonly rejected: number
  /** Client latency of each finished (or acked) token, ms. */
  readonly latenciesMs: ReadonlyArray<number>
}

/** Everything scoring needs; plain JSON, so equal runs are byte-identical. */
export interface Stats {
  readonly tMs: number
  readonly types: Readonly<Record<string, TypeStats>>
  /** Per component: its busiest machine's offered work as a fraction of capacity (above 1 is overload). */
  readonly util: Readonly<Record<string, number>>
  readonly cacheHitRate: Readonly<Record<string, number>>
  /** Per store with replicas: the worst shard's replica lag, ms, right now. */
  readonly lagMs: Readonly<Record<string, number>>
  readonly strongReads: number
  readonly staleReads: number
}

export interface Sim {
  readonly durationMs: number
  now(): number
  /** Advances one step and returns what happened. */
  step(): ReadonlyArray<SimEvent>
  /** Jumps to `tMs` (rounded to a step); the result equals running from 0. */
  seek(tMs: number): void
  stats(): Stats
}

interface Token {
  id: number
  type: number
  op: number
  born: number
  key: number
  /** Client latency already recorded (at an enqueue ack), so the final exit adds none. */
  acked: boolean
  /** Above 0 only on a ghost: the capacity-ms of work a slice left behind. A ghost is never routed or counted. */
  rem: number
  /** Health-check window of the load balancer that just routed it, or -1 when routed directly. */
  lb: number
  at: number
}

interface Server {
  queue: Array<Token>
  /** Capacity-ms of work waiting in `queue`. */
  backlogMs: number
  credit: number
  workMs: number
  stepWork: number
  load: number
  alive: boolean
  deadSince: number
  slowX: number
}

interface CompState {
  servers: Array<Server>
  rr: number
  primary: Array<number>
  lag: Array<number>
  hits: number
  misses: number
}

interface Counts {
  emitted: number
  ok: number
  rejected: number
  latencies: Array<number>
}

/** The only mutable thing: plain data, so `structuredClone` is a snapshot. */
interface State {
  t: number
  nextId: number
  rng: Rng
  comps: Array<CompState>
  transit: Array<{ tk: Token; readyAt: number; to: number }>
  acc: Array<number>
  types: Array<Counts>
  strongReads: number
  staleReads: number
}

interface Static {
  readonly id: string
  readonly kind: string
  readonly entry: CatalogueEntry
  readonly cfg: Config
  readonly shards: number
  readonly perShard: number
  /** Token bound of a queue component; 0 for machines, which bound by work. */
  readonly maxQueue: number
}

export const createSim = (level: Level, design: Design, stageName: StageName, seed: number = level.seed): Sim => {
  const stage = level.stages[stageName]
  const routes = buildRoutes(level, design)
  const R = level.rpsPerToken
  const statics: ReadonlyArray<Static> = design.components.map((c) => {
    const entry = catalogue[c.kind]
    const cfg = configOf(c.kind, c.config)
    const { shards, perShard } = layout(c.kind, c.config)
    const maxQueue = c.kind === "queue" ? Math.max(2, Math.ceil(num(cfg, "depth") / R)) : 0
    return { id: c.id, kind: c.kind, entry, cfg, shards, perShard, maxQueue }
  })
  const client = statics.findIndex((c) => c.kind === "client")
  const chaos = stage.chaos.map((c) => ({
    ...c,
    targets: statics.flatMap((s, i) => (s.id === c.target || s.kind === c.target ? [i] : []))
  }))
  const datasetOf = new Map(level.datasets.map((d) => [d.id, d]))
  const keyDataset = level.requests.map((r) => {
    const op = r.ops.find((o) => "dataset" in o)
    return op !== undefined && "dataset" in op ? datasetOf.get(op.dataset) : undefined
  })

  const fresh = (): State => ({
    t: 0,
    nextId: 0,
    rng: makeRng(seed),
    comps: statics.map((s) => ({
      servers: Array.from({ length: s.shards * s.perShard }, () => ({
        queue: [], backlogMs: 0, credit: 0, workMs: 0, stepWork: 0, load: 0, alive: true, deadSince: -1, slowX: 1
      })),
      rr: 0,
      primary: Array.from({ length: s.shards }, () => 0),
      lag: Array.from({ length: s.shards }, () => 0),
      hits: 0,
      misses: 0
    })),
    transit: [],
    acc: level.requests.map(() => 0),
    types: level.requests.map(() => ({ emitted: 0, ok: 0, rejected: 0, latencies: [] })),
    strongReads: 0,
    staleReads: 0
  })

  let state = fresh()
  const snapshots = new Map<number, State>([[0, structuredClone(state)]])
  let events: Array<SimEvent> = []

  const opOf = (tk: Token) => level.requests[tk.type]!.ops[tk.op]!
  const typeId = (tk: Token) => level.requests[tk.type]!.id

  /** Capacity-milliseconds one token's current op costs the machine serving it. */
  const costMs = (ci: number, tk: Token): number => {
    const s = statics[ci]!
    const op = opOf(tk)
    const weight = s.entry.serves[op.do] ?? 1
    const ds = op.do === "read" ? datasetOf.get(op.dataset) : undefined
    const fanin = ds?.fanin !== undefined && !s.entry.materialised && op.do in s.entry.serves ? ds.fanin : 1
    return ((R * weight * (op.amp ?? 1) * fanin) / s.entry.capacityRps) * 1000
  }

  const reject = (tk: Token, ci: number, why: RejectReason) => {
    state.types[tk.type]!.rejected++
    events.push({ ev: "reject", token: tk.id, at: statics[ci]!.id, why })
  }

  /** The next component for `tk` (skipping optional ops nothing can serve), `DONE` or `STUCK`. */
  const route = (from: number, tk: Token): number => {
    const ops = level.requests[tk.type]!.ops
    while (tk.op < ops.length) {
      const options = routes.next(from, tk.type, tk.op)
      if (options.length > 0) return options[tk.id % options.length]!
      if (!ops[tk.op]!.optional) return STUCK
      tk.op++
    }
    return DONE
  }

  const full = (ci: number, m: Server): boolean =>
    statics[ci]!.kind === "queue" ? m.queue.length >= statics[ci]!.maxQueue : m.backlogMs >= QUEUE_MS

  const hasRoom = (ci: number): boolean => state.comps[ci]!.servers.some((m) => m.alive && !full(ci, m))

  /** Which machine of component `ci` takes `tk`, or -1 when none can be reached. */
  const pick = (ci: number, tk: Token): number => {
    const s = statics[ci]!
    const d = state.comps[ci]!
    if (s.entry.shape === "pool") {
      if (tk.lb < 0) return d.rr++ % s.perShard
      const seen = d.servers.flatMap((m, i) => (m.alive || state.t - m.deadSince < tk.lb ? [i] : []))
      return seen.length === 0 ? -1 : seen[d.rr++ % seen.length]!
    }
    const shard = s.cfg.partitionKey === "uniform" ? Math.floor(nextFloat(state.rng) * s.shards) : tk.key % s.shards
    const base = shard * s.perShard
    const op = opOf(tk).do
    if (op !== "read" || s.perShard === 1 || s.cfg.readFrom === "primary") return base + d.primary[shard]!
    const alive = Array.from({ length: s.perShard }, (_, i) => i).filter((i) => d.servers[base + i]!.alive)
    return alive.length === 0 ? -1 : base + alive[d.rr++ % alive.length]!
  }

  /** Ends the client's latency (once); the token may carry on as background work. */
  const ack = (tk: Token, at: number) => {
    if (tk.acked) return
    tk.acked = true
    const latencyMs = Math.round(at - tk.born)
    state.types[tk.type]!.latencies.push(latencyMs)
    events.push({ ev: "done", token: tk.id, type: typeId(tk), latencyMs })
  }

  const arrive = (tk: Token, ci: number) => {
    const s = statics[ci]!
    const si = pick(ci, tk)
    if (si < 0) return reject(tk, ci, "noRoute")
    const server = state.comps[ci]!.servers[si]!
    if (!server.alive) return reject(tk, ci, "dead")
    const work = costMs(ci, tk) * server.slowX
    server.workMs += work
    server.stepWork += work
    if (full(ci, server)) return reject(tk, ci, "queueFull")
    server.backlogMs += work
    tk.at = ci
    server.queue.push(tk)
    events.push({ ev: "queue", token: tk.id, at: s.id, depth: server.queue.length })
    if (opOf(tk).do === "enqueue" && "enqueue" in s.entry.serves) ack(tk, state.t + s.entry.latencyMs)
  }

  /**
   * A machine took `tk` off its queue: do the op, then send the token on. The token's own
   * service time is charged to the machine's capacity (so followers wait for it) but not added to
   * its own latency: a batch stands for many pipelined requests, and only waiting behind others
   * plus the machine's base latency is what each of them feels.
   */
  const complete = (ci: number, si: number, tk: Token) => {
    const s = statics[ci]!
    const op = opOf(tk)
    let handled = op.do in s.entry.serves
    if (handled && s.kind === "cache") {
      const ds = datasetOf.get((op as { dataset: string }).dataset)!
      const gb = num(s.cfg, "gb") * s.perShard
      const hit = tk.key < (gb * 1e6) / ds.objectKb
      state.comps[ci]!.hits += hit ? 1 : 0
      state.comps[ci]!.misses += hit ? 0 : 1
      events.push({ ev: "cache", at: s.id, hit })
      handled = hit
    }
    if (handled && s.entry.shape === "store" && op.do === "read" && op.consistency === "strong") {
      const shard = Math.floor(si / s.perShard)
      state.strongReads++
      if (si % s.perShard !== state.comps[ci]!.primary[shard] && state.comps[ci]!.lag[shard]! > STALE_LAG_MS) state.staleReads++
    }
    let extra = 0
    if (handled) {
      if (op.do === "compute") extra = op.ms
      tk.op++
    }
    events.push({ ev: "served", token: tk.id, at: s.id })
    tk.lb = s.kind === "lb" ? num(s.cfg, "healthCheckMs") : -1
    const to = route(ci, tk)
    if (to === STUCK) reject(tk, ci, "noRoute")
    else state.transit.push({ tk, readyAt: state.t + s.entry.latencyMs + extra, to })
  }

  const finish = (tk: Token, at: number) => {
    state.types[tk.type]!.ok++
    ack(tk, at)
  }

  const applyChaos = () => {
    const t = state.t
    statics.forEach((s, ci) => {
      const d = state.comps[ci]!
      d.servers.forEach((m, si) => {
        let dead = false
        let since = Infinity
        let slow = 1
        for (const c of chaos) {
          if (t < c.atMs || t >= c.atMs + c.forMs || !c.targets.includes(ci)) continue
          if (c.event.type === "slow") slow *= c.event.x
          if ((c.event.type === "kill" && si === 0) || (c.event.type === "partition" && si % 2 === 1)) {
            dead = true
            since = Math.min(since, c.atMs)
          }
        }
        m.slowX = slow
        if (m.alive && dead) {
          m.alive = false
          m.deadSince = since
          for (const tk of m.queue) if (tk.rem === 0) reject(tk, ci, "dead")
          m.queue = []
          m.backlogMs = 0
        } else if (!m.alive && !dead) m.alive = true
      })
      for (let shard = 0; shard < s.shards; shard++) {
        const base = shard * s.perShard
        const primary = d.servers[base + d.primary[shard]!]!
        if (s.entry.shape !== "store" || primary.alive || t - primary.deadSince < num(s.cfg, "failoverMs")) continue
        for (let r = 0; r < s.perShard; r++) {
          if (d.servers[base + r]!.alive) {
            d.primary[shard] = r
            break
          }
        }
      }
    })
  }

  const emitTraffic = () => {
    const t = state.t
    const spike = chaos.reduce((x, c) => (c.event.type === "spike" && t >= c.atMs && t < c.atMs + c.forMs ? x * c.event.x : x), 1)
    level.requests.forEach((r, type) => {
      const mul = trafficAt(r.traffic, t, stage.durationMs) * stage.traffic * spike
      state.acc[type]! += (r.rps * mul * STEP_MS) / 1000 / R
      while (state.acc[type]! >= 1) {
        state.acc[type]!--
        const ds = keyDataset[type]
        const tk: Token = {
          id: state.nextId++, type, op: 0, born: t, acked: false, rem: 0, lb: -1, at: client,
          key: ds === undefined ? 0 : zipfRank(state.rng, ds.keys, ds.skew)
        }
        state.types[type]!.emitted++
        events.push({ ev: "emit", token: tk.id, type: r.id, at: statics[client]!.id })
        const to = route(client, tk)
        if (to === STUCK) reject(tk, client, "noRoute")
        else state.transit.push({ tk, readyAt: t + statics[client]!.entry.latencyMs, to })
      }
    })
  }

  const deliver = () => {
    const ready = state.transit.filter((x) => x.readyAt <= state.t)
    state.transit = state.transit.filter((x) => x.readyAt > state.t)
    // Arrival order within a step is arbitrary; shuffle it so no request type always queues behind another.
    for (let i = ready.length - 1; i > 0; i--) {
      const j = Math.floor(nextFloat(state.rng) * (i + 1))
      ;[ready[i], ready[j]] = [ready[j]!, ready[i]!]
    }
    for (const x of ready) {
      if (x.to === DONE) finish(x.tk, x.readyAt)
      else {
        events.push({ ev: "move", token: x.tk.id, from: statics[x.tk.at]!.id, to: statics[x.to]!.id })
        arrive(x.tk, x.to)
      }
    }
  }

  const serve = () => {
    statics.forEach((s, ci) => {
      const hold = s.kind === "queue"
      state.comps[ci]!.servers.forEach((m, si) => {
        if (!m.alive) return
        m.credit += STEP_MS
        while (m.queue.length > 0 && m.credit > 0) {
          const tk = m.queue[0]!
          if (hold && tk.rem === 0) {
            const to = route(ci, { ...tk, op: tk.op + 1 })
            if (to >= 0 && !hasRoom(to)) break
          }
          m.queue.shift()
          const total = (tk.rem > 0 ? tk.rem : costMs(ci, tk)) * m.slowX
          const slice = Math.min(total, SLICE_MS)
          m.backlogMs = Math.max(0, m.backlogMs - slice)
          m.credit -= slice
          if (tk.rem === 0) complete(ci, si, tk)
          if (total > slice) m.queue.push({ ...tk, rem: (total - slice) / m.slowX })
        }
        if (m.credit > 0) m.credit = 0
      })
    })
  }

  const observe = () => {
    statics.forEach((s, ci) => {
      const d = state.comps[ci]!
      for (const m of d.servers) {
        m.load += (m.stepWork / STEP_MS - m.load) * 0.05
        m.stepWork = 0
      }
      if (s.perShard > 1 && s.entry.shape === "store") {
        for (let shard = 0; shard < s.shards; shard++) {
          const load = d.servers[shard * s.perShard + d.primary[shard]!]!.load
          d.lag[shard] = 20 + 2000 * Math.max(0, load - 0.5) ** 2
        }
      }
    })
    const t = state.t
    if (t % 100 === 0) {
      statics.forEach((s, ci) => {
        if (s.shards > 0) events.push({ ev: "util", at: s.id, util: Math.max(...state.comps[ci]!.servers.map((m) => m.load)) })
      })
    }
    if (t % 500 === 0) {
      statics.forEach((s, ci) => {
        if (s.perShard > 1 && s.entry.shape === "store") events.push({ ev: "lag", at: s.id, lagMs: Math.max(...state.comps[ci]!.lag) })
      })
    }
  }

  const step = (): ReadonlyArray<SimEvent> => {
    events = []
    applyChaos()
    emitTraffic()
    deliver()
    serve()
    state.t += STEP_MS
    observe()
    if (state.t % 1000 === 0 && !snapshots.has(state.t / 1000)) snapshots.set(state.t / 1000, structuredClone(state))
    return events
  }

  return {
    durationMs: stage.durationMs,
    now: () => state.t,
    step,
    seek: (tMs) => {
      const target = Math.round(tMs / STEP_MS) * STEP_MS
      if (target < state.t) {
        const sec = Math.min(Math.floor(target / 1000), Math.max(...snapshots.keys()))
        state = structuredClone(snapshots.get(sec)!)
      }
      while (state.t < target) step()
    },
    stats: () => ({
      tMs: state.t,
      types: Object.fromEntries(level.requests.map((r, i) => {
        const c = state.types[i]!
        return [r.id, { emitted: c.emitted, ok: c.ok, rejected: c.rejected, latenciesMs: [...c.latencies] }]
      })),
      util: Object.fromEntries(statics.flatMap((s, ci) => s.shards === 0 || state.t === 0
        ? []
        : [[s.id, Math.max(...state.comps[ci]!.servers.map((m) => m.workMs)) / state.t]])),
      cacheHitRate: Object.fromEntries(statics.flatMap((s, ci) => {
        const d = state.comps[ci]!
        return s.kind === "cache" && d.hits + d.misses > 0 ? [[s.id, d.hits / (d.hits + d.misses)]] : []
      })),
      lagMs: Object.fromEntries(statics.flatMap((s, ci) =>
        s.perShard > 1 && s.entry.shape === "store" ? [[s.id, Math.max(...state.comps[ci]!.lag)]] : [])),
      strongReads: state.strongReads,
      staleReads: state.staleReads
    })
  }
}

/** Runs a whole stage and returns its stats. */
export const runStage = (level: Level, design: Design, stage: StageName, seed?: number): Stats => {
  const sim = createSim(level, design, stage, seed)
  while (sim.now() < sim.durationMs) sim.step()
  return sim.stats()
}

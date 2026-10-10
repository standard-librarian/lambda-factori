/**
 * The component catalogue: every kind of machine a player can place, which ops it serves, how
 * fast, how much it costs, and what its config looks like. It is a mapped type over
 * `ComponentKind`, so adding a kind fails to compile until it has an entry. Numbers are game
 * numbers: round, plausible, and tuned so trade-offs show; tests pin the lessons, not the digits.
 */
import { Schema } from "effect"
import { NonNegative, Positive, PositiveInt, type OpName } from "./Op.ts"

export const ComponentKind = Schema.Literals([
  "client",
  "exit",
  "lb",
  "service",
  "cache",
  "sqlDb",
  "kvStore",
  "queue",
  "worker",
  "geoIndex",
  "lock"
])
export type ComponentKind = typeof ComponentKind.Type

/** A placed component's settings, keyed by field name. Each kind's Schema says which keys exist. */
export type Config = Readonly<Record<string, number | string>>

/**
 * How a kind turns config into machines.
 * - `source` / `sink`: the client press and the exit bins; no machines.
 * - `pool`: `instances` identical machines.
 * - `store`: `shards` partitions of one primary plus `replicas` copies each.
 */
export type Shape = "source" | "sink" | "pool" | "store"

export interface CatalogueEntry {
  readonly label: string
  readonly shape: Shape
  /** Op name -> how many units of capacity one request of that op costs (a DB write is dearer than a read). */
  readonly serves: Readonly<Partial<Record<OpName, number>>>
  /** Requests per second one machine handles at cost 1. */
  readonly capacityRps: number
  /** Time a batch spends in the machine on top of queueing, ms. */
  readonly latencyMs: number
  /** Per machine, per month. */
  readonly usdPerMonth: number
  /** Extra per GB of cache, per machine, per month. */
  readonly usdPerGb?: number
  /**
   * Holds precomputed views, so a read of a derived dataset (one with `fanin`) costs one lookup
   * here instead of `fanin` of them.
   */
  readonly materialised: boolean
  readonly defaults: Config
  /** Validates the keys a level may set; everything is optional and falls back to `defaults`. */
  readonly config: Schema.Top
}

const count = Schema.optional(PositiveInt)
const partitionKey = Schema.optional(Schema.Literals(["natural", "uniform"]))

const poolConfig = Schema.Struct({ instances: count })
const storeConfig = Schema.Struct({
  shards: count,
  replicas: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  /** "natural" partitions by the (skewed) entity key, so one shard runs hot; "uniform" spreads evenly. */
  partitionKey,
  /** "any" spreads reads over replicas too (cheap, may be stale); "primary" never reads a replica. */
  readFrom: Schema.optional(Schema.Literals(["any", "primary"])),
  failoverMs: Schema.optional(NonNegative)
})
const storeDefaults: Config = { shards: 1, replicas: 0, partitionKey: "natural", readFrom: "any", failoverMs: 3000 }

export const catalogue: { readonly [K in ComponentKind]: CatalogueEntry } = {
  client: {
    label: "Clients",
    shape: "source",
    serves: {},
    capacityRps: Infinity,
    latencyMs: 10,
    usdPerMonth: 0,
    materialised: false,
    defaults: {},
    config: Schema.Struct({})
  },
  exit: {
    label: "Exit bin",
    shape: "sink",
    serves: {},
    capacityRps: Infinity,
    latencyMs: 0,
    usdPerMonth: 0,
    materialised: false,
    /** `type` is the request type whose finished requests this bin counts. */
    defaults: { type: "" },
    config: Schema.Struct({ type: Schema.String })
  },
  lb: {
    label: "Load balancer",
    shape: "pool",
    serves: {},
    capacityRps: 100_000,
    latencyMs: 1,
    usdPerMonth: 60,
    materialised: false,
    defaults: { instances: 1, healthCheckMs: 1000 },
    /** `healthCheckMs`: how long a dead machine behind this balancer keeps receiving traffic. */
    config: Schema.Struct({ instances: count, healthCheckMs: Schema.optional(NonNegative) })
  },
  service: {
    label: "Service",
    shape: "pool",
    serves: { compute: 1 },
    capacityRps: 5_000,
    latencyMs: 4,
    usdPerMonth: 80,
    materialised: false,
    defaults: { instances: 1 },
    config: poolConfig
  },
  cache: {
    label: "Cache",
    shape: "pool",
    serves: { read: 1 },
    capacityRps: 80_000,
    latencyMs: 1,
    usdPerMonth: 120,
    usdPerGb: 15,
    materialised: false,
    defaults: { instances: 1, gb: 1 },
    config: Schema.Struct({ instances: count, gb: Schema.optional(Positive) })
  },
  sqlDb: {
    label: "SQL database",
    shape: "store",
    serves: { read: 1, write: 5 },
    capacityRps: 3_000,
    latencyMs: 8,
    usdPerMonth: 250,
    materialised: false,
    defaults: storeDefaults,
    config: storeConfig
  },
  kvStore: {
    label: "Key-value store",
    shape: "store",
    serves: { read: 1, write: 1, push: 1 },
    capacityRps: 20_000,
    latencyMs: 2,
    usdPerMonth: 150,
    materialised: true,
    defaults: storeDefaults,
    config: storeConfig
  },
  queue: {
    label: "Queue",
    shape: "pool",
    serves: { enqueue: 1 },
    capacityRps: 50_000,
    latencyMs: 2,
    usdPerMonth: 70,
    materialised: false,
    /** `depth`: how many requests it buffers before it starts rejecting. */
    defaults: { instances: 1, depth: 20_000 },
    config: Schema.Struct({ instances: count, depth: Schema.optional(Positive) })
  },
  worker: {
    label: "Worker",
    shape: "pool",
    serves: { compute: 1 },
    capacityRps: 2_000,
    latencyMs: 5,
    usdPerMonth: 60,
    materialised: false,
    defaults: { instances: 1 },
    config: poolConfig
  },
  geoIndex: {
    label: "Geo index",
    shape: "store",
    serves: { geo: 1 },
    capacityRps: 10_000,
    latencyMs: 3,
    usdPerMonth: 180,
    materialised: false,
    defaults: storeDefaults,
    config: storeConfig
  },
  lock: {
    label: "Lock service",
    shape: "pool",
    serves: { lock: 1 },
    capacityRps: 4_000,
    latencyMs: 4,
    usdPerMonth: 90,
    materialised: false,
    defaults: { instances: 1 },
    config: poolConfig
  }
}

/** A placed component's config with the catalogue's defaults filled in. */
export const configOf = (kind: ComponentKind, config: Config): Config => ({ ...catalogue[kind].defaults, ...config })

/** Reads a numeric setting; callers only ask for keys the kind's defaults define. */
export const num = (config: Config, key: string): number => Number(config[key])

/** A machine count: whole and at least `min`; a setting that isn't a number (a hand-edited design) counts as `min`. */
const wholeCount = (config: Config, key: string, min: number): number => {
  const n = Math.floor(num(config, key))
  return Number.isFinite(n) ? Math.max(min, n) : min
}

/** How many machines a placed component expands to: `shards` groups of `perShard` machines each. */
export const layout = (kind: ComponentKind, config: Config): { shards: number; perShard: number } => {
  const entry = catalogue[kind]
  const full = configOf(kind, config)
  switch (entry.shape) {
    case "source":
    case "sink":
      return { shards: 0, perShard: 0 }
    case "pool":
      return { shards: 1, perShard: wholeCount(full, "instances", 1) }
    case "store":
      return { shards: wholeCount(full, "shards", 1), perShard: 1 + wholeCount(full, "replicas", 0) }
  }
}

/** $ per month for one placed component. */
export const monthlyUsd = (kind: ComponentKind, config: Config): number => {
  const { shards, perShard } = layout(kind, config)
  const entry = catalogue[kind]
  const gb = kind === "cache" ? num(configOf(kind, config), "gb") : 0
  return shards * perShard * (entry.usdPerMonth + (entry.usdPerGb ?? 0) * gb)
}

/**
 * The level schema (an interview question as data) and `check`, the validity rules Schema can't
 * express: ids resolve, the palette covers the reference, `fixed` is part of it, wires join
 * existing components, config keys belong to their kind. Everything a level says about itself is
 * here; running it is `Sim.ts`, judging it is `score.ts`.
 */
import { Schema } from "effect"
import { catalogue, ComponentKind } from "./Catalogue.ts"
import { evaluate } from "./estimate.ts"
import { Id, NonNegative, Op, Positive, PositiveInt } from "./Op.ts"

export const Dataset = Schema.Struct({
  id: Id,
  label: Schema.String,
  /** Average size of one object, KB: sets how many fit in a cache. */
  objectKb: Positive,
  /** Distinct keys. */
  keys: PositiveInt,
  /** Zipf exponent of key popularity; 0 is uniform, above 1 is "a few celebrities". */
  skew: NonNegative,
  /** Rows a read of this derived dataset must gather when nothing precomputed it (a feed's followees). */
  fanin: Schema.optional(Positive)
})
export type Dataset = typeof Dataset.Type

export const Traffic = Schema.Union([
  Schema.Struct({ shape: Schema.Literal("steady") }),
  /** Linear from `fromX` times the stage's rate up to 1× at the end. */
  Schema.Struct({ shape: Schema.Literal("ramp"), fromX: NonNegative }),
  Schema.Struct({ shape: Schema.Literal("spike"), atMs: NonNegative, x: NonNegative, forMs: Positive }),
  /** One slow day: 1× at the ends, `peakX` in the middle. */
  Schema.Struct({ shape: Schema.Literal("diurnal"), peakX: NonNegative })
])
export type Traffic = typeof Traffic.Type

export const RequestType = Schema.Struct({
  id: Id,
  /** Shown on the belt, e.g. "GET /:code". */
  label: Schema.String,
  color: Schema.String,
  ops: Schema.NonEmptyArray(Op),
  /** Requests per second at stage traffic 1. */
  rps: NonNegative,
  traffic: Traffic
})
export type RequestType = typeof RequestType.Type

export const Placed = Schema.Struct({
  id: Id,
  kind: ComponentKind,
  at: Schema.Struct({ col: Schema.Int, row: Schema.Int }),
  config: Schema.Record(Schema.String, Schema.Union([Schema.Number, Schema.String])),
  /** Part of the question, not the player's to move or delete. */
  locked: Schema.optional(Schema.Boolean)
})
export type Placed = typeof Placed.Type

export const Wire = Schema.Struct({
  from: Id,
  to: Id,
  /** Only these request types may ride this wire. */
  only: Schema.optional(Schema.Array(Id))
})
export type Wire = typeof Wire.Type

export const Design = Schema.Struct({ components: Schema.Array(Placed), wires: Schema.Array(Wire) })
export type Design = typeof Design.Type

/**
 * A scripted failure. `target` is a component id or a kind; `kill` takes down machine 0 (a
 * store's original primary), `partition` every odd-numbered machine, `slow` divides capacity by
 * `x`, `spike` multiplies all traffic by `x`.
 */
export const Chaos = Schema.Struct({
  atMs: NonNegative,
  forMs: Positive,
  target: Schema.String,
  event: Schema.Union([
    Schema.Struct({ type: Schema.Literal("kill") }),
    Schema.Struct({ type: Schema.Literal("partition") }),
    Schema.Struct({ type: Schema.Literal("slow"), x: Positive }),
    Schema.Struct({ type: Schema.Literal("spike"), x: NonNegative })
  ])
})
export type Chaos = typeof Chaos.Type

/**
 * What a stage must achieve.
 * - `serve`: these request types must reach an exit;
 * - `p99Ms`: per request type, the 99th-percentile client latency;
 * - `minServed`: fraction of all requests that finish;
 * - `availability`: the worst request type's finished / (finished + rejected);
 * - `maxStale`: fraction of strong reads answered by a lagging replica;
 * - `budget`: $ per month.
 */
export const Goals = Schema.Struct({
  serve: Schema.NonEmptyArray(Id),
  p99Ms: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
  minServed: Schema.optional(Schema.Number),
  availability: Schema.optional(Schema.Number),
  maxStale: Schema.optional(Schema.Number),
  budget: Schema.optional(Schema.Number)
})
export type Goals = typeof Goals.Type

export const Stage = Schema.Struct({
  /** Multiplies every request type's `rps`. */
  traffic: NonNegative,
  durationMs: Positive,
  chaos: Schema.Array(Chaos),
  goals: Goals
})
export type Stage = typeof Stage.Type

export const StageName = Schema.Literals(["build", "scale", "chaos"])
export type StageName = typeof StageName.Type

/** The order a level is played in. */
export const stageNames: ReadonlyArray<StageName> = ["build", "scale", "chaos"]

/** A back-of-envelope step: `expr` (see `estimate.ts`) may name earlier steps by `id`. */
export const Estimate = Schema.Struct({
  id: Id,
  label: Schema.String,
  expr: Schema.String,
  /** What the expression should come to; `check` verifies it. */
  value: Schema.Number,
  unit: Schema.String
})
export type Estimate = typeof Estimate.Type

/** A plausible wrong answer, pinned by tests to fail one named goal. */
export const Naive = Schema.Struct({
  design: Design,
  /** The stage it is run in, and the goal id (see `goalIds`) it must fail. */
  stage: StageName,
  fails: Schema.String,
  /** Other goals it fails as a direct consequence (an empty feed also misses its latency and served goals). */
  alsoFails: Schema.optional(Schema.Array(Schema.String)),
  /** One line on why a real design makes this mistake. */
  why: Schema.String
})
export type Naive = typeof Naive.Type

export const Level = Schema.Struct({
  id: Id,
  title: Schema.String,
  difficulty: Schema.Literals(["easy", "medium", "hard"]),
  /** Where to practise the question for real: its name and page only, no copied text. */
  practice: Schema.Struct({ name: Schema.String, url: Schema.String }),
  brief: Schema.String,
  estimates: Schema.Array(Estimate),
  /** Requests one token stands for. */
  rpsPerToken: Positive,
  seed: Schema.Int,
  datasets: Schema.Array(Dataset),
  requests: Schema.NonEmptyArray(RequestType),
  palette: Schema.Array(ComponentKind),
  fixed: Design,
  stages: Schema.Struct({ build: Stage, scale: Stage, chaos: Stage }),
  reference: Design,
  naive: Schema.optional(Schema.Array(Naive)),
  /** Deep-dive deck id: `apps/web/public/decks/<deck>.json`. */
  deck: Id
})
export type Level = typeof Level.Type

export const LevelPack = Schema.Struct({ version: Schema.Literal(1), levels: Schema.NonEmptyArray(Level) })
export type LevelPack = typeof LevelPack.Type

/** The ids of every goal a stage checks, in the order `score` reports them. */
export const goalIds = (goals: Goals): ReadonlyArray<string> => [
  ...goals.serve.map((type) => `serve:${type}`),
  ...Object.keys(goals.p99Ms ?? {}).map((type) => `p99:${type}`),
  ...(goals.minServed === undefined ? [] : ["served"]),
  ...(goals.availability === undefined ? [] : ["availability"]),
  ...(goals.maxStale === undefined ? [] : ["stale"]),
  ...(goals.budget === undefined ? [] : ["budget"])
]

const checkDesign = (level: Level, name: string, design: Design, problems: Array<string>): void => {
  const ids = new Set<string>()
  for (const c of design.components) {
    if (ids.has(c.id)) problems.push(`${name}: duplicate component id "${c.id}"`)
    ids.add(c.id)
    const keys = Object.keys(catalogue[c.kind].defaults)
    try {
      Schema.decodeUnknownSync(catalogue[c.kind].config as Schema.Decoder<unknown>)(c.config)
    } catch (e) {
      problems.push(`${name}: ${c.id} (${c.kind}) has a bad setting: ${(e as Error).message.split("\n").join(" ")}`)
    }
    for (const key of Object.keys(c.config)) {
      if (!keys.includes(key)) {
        problems.push(`${name}: ${c.id} (${c.kind}) has no setting "${key}"`)
      }
    }
    if (c.kind === "exit" && !level.requests.some((r) => r.id === c.config.type)) {
      problems.push(`${name}: exit ${c.id} counts unknown request type "${c.config.type}"`)
    }
  }
  const types = new Set(level.requests.map((r) => r.id))
  for (const w of design.wires) {
    for (const end of [w.from, w.to]) if (!ids.has(end)) problems.push(`${name}: wire ${w.from} -> ${w.to} joins unknown "${end}"`)
    for (const t of w.only ?? []) if (!types.has(t)) problems.push(`${name}: wire ${w.from} -> ${w.to} limited to unknown type "${t}"`)
  }
}

/**
 * Problems Schema can't express, as readable sentences; empty means the level is sound. Run on
 * every level by the tests, and by the editor (later) before it lets a level be saved.
 */
export const check = (level: Level): ReadonlyArray<string> => {
  const problems: Array<string> = []
  const types = new Set(level.requests.map((r) => r.id))
  const datasets = new Set(level.datasets.map((d) => d.id))
  if (types.size !== level.requests.length) problems.push("request type ids are not unique")
  if (datasets.size !== level.datasets.length) problems.push("dataset ids are not unique")
  for (const r of level.requests) {
    for (const op of r.ops) {
      if ("dataset" in op && !datasets.has(op.dataset)) problems.push(`${r.id}: op ${op.do} reads unknown dataset "${op.dataset}"`)
    }
  }
  for (const e of level.estimates) {
    const got = evaluate(e.expr, level.estimates.slice(0, level.estimates.indexOf(e)))
    if ("error" in got) problems.push(`estimate ${e.id}: ${got.error}`)
    else if (Math.abs(got.value - e.value) > Math.abs(e.value) * 0.01) problems.push(`estimate ${e.id}: ${e.expr} = ${got.value}, not ${e.value}`)
  }

  checkDesign(level, "fixed", level.fixed, problems)
  checkDesign(level, "reference", level.reference, problems)
  const referenceIds = new Map(level.reference.components.map((c) => [c.id, c]))
  for (const f of level.fixed.components) {
    const same = referenceIds.get(f.id)
    if (same?.kind !== f.kind) problems.push(`fixed ${f.id} is missing from the reference design`)
  }
  for (const r of level.requests) {
    if (!level.fixed.components.some((c) => c.kind === "exit" && c.config.type === r.id)) problems.push(`no fixed exit bin for ${r.id}`)
  }
  if (level.fixed.components.filter((c) => c.kind === "client").length !== 1) problems.push("fixed needs exactly one client")
  const fixedIds = new Set(level.fixed.components.map((c) => c.id))
  const palette = new Set<ComponentKind>(level.palette)
  const outsidePalette = (design: Design, name: string) => {
    for (const c of design.components) {
      if (!fixedIds.has(c.id) && !palette.has(c.kind)) problems.push(`${name}: ${c.id} is a ${c.kind}, which the palette doesn't offer`)
    }
  }
  outsidePalette(level.reference, "reference")

  for (const n of level.naive ?? []) {
    checkDesign(level, `naive(${n.fails})`, n.design, problems)
    outsidePalette(n.design, `naive(${n.fails})`)
    for (const id of [n.fails, ...(n.alsoFails ?? [])]) {
      if (!goalIds(level.stages[n.stage].goals).includes(id)) problems.push(`naive fails "${id}", which ${n.stage} doesn't check`)
    }
  }

  const targets = new Set<string>([...referenceIds.keys(), ...level.reference.components.map((c) => c.kind)])
  for (const [stage, s] of Object.entries(level.stages)) {
    for (const c of s.chaos) if (!targets.has(c.target)) problems.push(`${stage}: chaos targets unknown "${c.target}"`)
    for (const t of [...s.goals.serve, ...Object.keys(s.goals.p99Ms ?? {})]) {
      if (!types.has(t)) problems.push(`${stage}: goal names unknown request type "${t}"`)
    }
  }
  return problems
}

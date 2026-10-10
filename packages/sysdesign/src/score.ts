/**
 * Goals -> measured values, pass/fail and a one-line human reason ("redirect p99 = 140 ms > 50 ms
 * (urls-db at 180%)"). Pure: it reads a design and the `Stats` of a run, so the same function
 * explains a failure in the game, in tests and in a deck.
 */
import { monthlyUsd } from "./Catalogue.ts"
import type { Design, Level, StageName } from "./Level.ts"
import type { Stats } from "./Sim.ts"

/** A request type counts as served when at least this fraction of its requests finish. */
const SERVE_MIN = 0.2

export interface GoalResult {
  /** `serve:<type>`, `p99:<type>`, `served`, `availability`, `stale` or `budget` (see `goalIds`). */
  readonly id: string
  readonly pass: boolean
  readonly measured: number
  readonly limit: number
  readonly reason: string
}

export interface Score {
  readonly pass: boolean
  readonly goals: ReadonlyArray<GoalResult>
}

export const designCostUsd = (design: Design): number =>
  design.components.reduce((sum, c) => sum + monthlyUsd(c.kind, c.config), 0)

const p99 = (latencies: ReadonlyArray<number>): number => {
  if (latencies.length === 0) return Infinity
  const sorted = [...latencies].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1)]!
}

const pct = (x: number): string => `${Math.round(x * 1000) / 10}%`

/** " (urls-db at 180%)" for the most overloaded component, or "" when none is over capacity. */
const hottest = (stats: Stats): string => {
  const [id, util] = Object.entries(stats.util).reduce((a, b) => (b[1] > a[1] ? b : a), ["", 0])
  return util > 1 ? ` (${id} at ${Math.round(util * 100)}%)` : ""
}

export const score = (level: Level, stage: StageName, design: Design, stats: Stats): Score => {
  const goals = level.stages[stage].goals
  const results: Array<GoalResult> = []
  const add = (id: string, measured: number, limit: number, pass: boolean, reason: string) =>
    results.push({ id, pass, measured, limit, reason })
  const type = (id: string) => stats.types[id]!
  const served = (id: string) => type(id).ok / Math.max(1, type(id).emitted)

  for (const id of goals.serve) {
    const f = served(id)
    add(`serve:${id}`, f, SERVE_MIN, f >= SERVE_MIN, f >= SERVE_MIN
      ? `${id} reaches an exit (${pct(f)} served)`
      : `${id} only reaches an exit for ${pct(f)} of requests`)
  }
  for (const [id, limit] of Object.entries(goals.p99Ms ?? {})) {
    const got = p99(type(id).latenciesMs)
    const ok = got <= limit
    add(`p99:${id}`, got, limit, ok, ok
      ? `${id} p99 = ${got} ms, within ${limit} ms`
      : `${id} p99 = ${got} ms > ${limit} ms${hottest(stats)}`)
  }
  if (goals.minServed !== undefined) {
    const all = Object.values(stats.types)
    const f = all.reduce((s, t) => s + t.ok, 0) / Math.max(1, all.reduce((s, t) => s + t.emitted, 0))
    const ok = f >= goals.minServed
    add("served", f, goals.minServed, ok, `${pct(f)} of requests finished${ok ? "" : `, need ${pct(goals.minServed)}`}${ok ? "" : hottest(stats)}`)
  }
  if (goals.availability !== undefined) {
    const worst = Object.entries(stats.types).reduce(
      (a, [id, t]) => {
        const f = t.ok + t.rejected === 0 ? 1 : t.ok / (t.ok + t.rejected)
        return f < a.f ? { id, f } : a
      },
      { id: "", f: 1 }
    )
    const ok = worst.f >= goals.availability
    add("availability", worst.f, goals.availability, ok, ok
      ? `availability ${pct(worst.f)}`
      : `${worst.id} availability = ${pct(worst.f)} < ${pct(goals.availability)}`)
  }
  if (goals.maxStale !== undefined) {
    const f = stats.staleReads / Math.max(1, stats.strongReads)
    const ok = f <= goals.maxStale
    add("stale", f, goals.maxStale, ok, `${pct(f)} of strong reads were stale${ok ? "" : `, limit ${pct(goals.maxStale)}`}`)
  }
  if (goals.budget !== undefined) {
    const usd = designCostUsd(design)
    const ok = usd <= goals.budget
    add("budget", usd, goals.budget, ok, `$${usd}/month${ok ? "" : ` > $${goals.budget}`}`)
  }
  return { pass: results.every((r) => r.pass), goals: results }
}

/**
 * The level editor's model, without any DOM: the one-bin-per-line text format
 * for goals (`label | params | body` or `label | truth 0110`), validating a
 * level typed into the form, and the "find smallest recipe" report.
 */
import { Exit, Schema } from "effect"
import { byName } from "@lambda-factori/core/Catalogue.ts"
import { goalOf, Level, satisfies } from "@lambda-factori/core/Level.ts"
import { searchRecipes } from "@lambda-factori/core/Search.ts"
import { parse } from "@lambda-factori/core/Term.ts"

const decodeLevel = Schema.decodeUnknownExit(Level)

export const parseTargets = (text: string) =>
  text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [label = "", a = "", b] = line.split("|").map((p) => p.trim())
    const truth = /^truth\s+([01]+)$/.exec(a)
    if (truth) return { label, truth: truth[1]! }
    return { label, params: a, body: b ?? "" }
  })

export const showTargets = (level: Level) =>
  level.targets.map((t) => (t.truth ? `${t.label} | truth ${t.truth}` : `${t.label} | ${t.params ?? ""} | ${t.body ?? ""}`)).join("\n")

export const blankLevel = (): Level =>
  new Level({
    id: `my-level-${Math.random().toString(36).slice(2, 6)}`,
    world: "custom",
    title: "my level",
    blurb: "Build something that returns its second argument.",
    sources: ["S", "K"],
    targets: [{ label: "KI", params: "xy", body: "y" }]
  })

/** What the form holds, as plain strings. */
export interface LevelFields {
  readonly id: string
  readonly title: string
  readonly blurb: string
  readonly hint: string
  readonly sources: string
  readonly targets: string
  readonly sticker: string
  readonly paper: string
}

export type Validated =
  | { readonly ok: true; readonly level: Level; readonly opaque: ReadonlyArray<string> }
  | { readonly ok: false; readonly errors: string }

/** Turn the form into a Level, reporting every problem found. `opaque` lists atoms with no rewrite rule. */
export const validateLevel = (f: LevelFields): Validated => {
  const raw = {
    id: f.id.trim(),
    world: "custom",
    title: f.title.trim(),
    blurb: f.blurb.trim(),
    ...(f.hint.trim() ? { hint: f.hint.trim() } : {}),
    sources: f.sources.split(",").map((s) => s.trim()).filter(Boolean),
    targets: parseTargets(f.targets),
    ...(f.sticker ? { sticker: f.sticker } : {}),
    ...(f.paper ? { paper: f.paper } : {})
  }
  const exit = decodeLevel(raw)
  if (Exit.isFailure(exit)) return { ok: false, errors: String(exit.cause).slice(0, 600) }
  const problems: Array<string> = []
  if (!/^[\w-]+$/.test(raw.id)) problems.push("id: letters, digits, - and _ only")
  for (const t of raw.targets) {
    try {
      goalOf(t)
      if ("truth" in t && t.truth && (t.truth.length & (t.truth.length - 1)) !== 0) problems.push(`${t.label}: truth table length must be a power of two`)
    } catch (e) {
      problems.push(`${t.label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (problems.length) return { ok: false, errors: problems.join("\n") }
  return { ok: true, level: exit.value, opaque: raw.sources.filter((s) => !byName.has(s)) }
}

/** The smallest recipes for each bin (bounded search), and whether the hint term solves it. */
export const recipeReport = (level: Level): string =>
  level.targets.map((t) => {
    const goal = goalOf(t)
    let hintOk = ""
    try {
      if (level.hint && satisfies(parse(level.hint), goal)) hintOk = " · hint ✓"
    } catch {
      // A hint in words is fine.
    }
    const r = searchRecipes(goal, level.sources, { maxSize: 7, limit: 2, maxTerms: 250_000 })
    return r.found.length
      ? `${t.label}: ${r.found.join("  or  ")} (size ${r.searchedSize})${hintOk}`
      : `${t.label}: nothing up to size ${r.searchedSize}${r.exhausted ? "" : " (search budget hit)"}${hintOk}`
  }).join("\n")

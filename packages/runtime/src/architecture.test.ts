/**
 * The fitness function for the dependency rule (`docs/plans/dependency-rule.md`,
 * §2): source-code imports must cross the "red line" only from details toward
 * policy, never the other way. This is the only place the layer→layer rule
 * table lives; nothing else in the repo encodes it.
 *
 * The check is plain fs + regex over every `.ts` file under each package's
 * and each app's `src` directory: it classifies each file into a layer from its path,
 * extracts the (static and dynamic) import specifiers, resolves each to a
 * layer, and asks the rule table whether that edge is allowed. Anything the
 * table forbids must appear in `KNOWN_VIOLATIONS`, an exact (file, import)
 * allowlist of what's left from before the rule existed. The list can only
 * shrink: the test also fails if an allowlisted pair no longer occurs, so a
 * fixed violation must be deleted from the list in the same change (a
 * ratchet). Later phases of the plan rename `engine/` to `host/` and
 * `render/` to `ui/`; until then, this file maps the old names to the new
 * layers so the rest of the codebase (and this test) can talk about the
 * target shape early. A separate check requires `layerOf` to classify every
 * file under `packages/runtime/src` (this file excepted): a new top-level
 * folder must be added to the rule table, not silently exempted from it.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..")

/** Every layer the rule table knows about. Plugins and apps are one layer per id/name. */
type Layer = "kernel" | "platform" | "ui" | "host" | "game" | "core" | "contracts" | `plugin:${string}` | `app:${string}`

const walk = (dir: string, out: Array<string> = []): Array<string> => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith(".ts")) out.push(full)
  }
  return out
}

/** Every source file the rule applies to, as a path relative to the repo root (forward slashes). */
const sourceFiles = (): Array<string> => {
  const roots = [
    ...fs.readdirSync(path.join(REPO_ROOT, "packages")).map((p) => `packages/${p}/src`),
    ...fs.readdirSync(path.join(REPO_ROOT, "apps")).map((p) => `apps/${p}/src`)
  ].filter((rel) => fs.existsSync(path.join(REPO_ROOT, rel)))
  return roots.flatMap((rel) => walk(path.join(REPO_ROOT, rel)).map((f) => path.relative(REPO_ROOT, f).split(path.sep).join("/")))
}

/**
 * Classify a repo-relative path into a layer, or `undefined` if it's outside
 * the packages/apps this rule covers (an npm package, a node builtin, or a
 * package with no layer rules of its own — those imports are always allowed).
 *
 * `platform/` is real already (`devHooks.ts`); `game/Storage.ts` and
 * `game/Preload.ts` also count as `platform` (the plan's transitional
 * mapping, ahead of the phase-4 rename that moves them there too) — every
 * other `game/` file is the combinator game's own services. `engine/` counts
 * as `host`, `render/` as `ui`, until phase 4 renames those two folders.
 */
const layerOf = (relPath: string): Layer | undefined => {
  const parts = relPath.split("/")
  if (parts[0] === "apps") return `app:${parts[1]}`
  if (parts[0] !== "packages") return undefined
  const pkg = parts[1]
  if (pkg === "core") return "core"
  if (pkg === "contracts") return "contracts"
  if (pkg !== "runtime") return undefined
  const rest = parts.slice(3) // packages/runtime/src/<rest>
  const top = rest[0]
  if (top === "kernel") return "kernel"
  if (top === "platform") return "platform"
  if (top === "render") return "ui"
  if (top === "engine") return "host"
  if (top === "game") return rest[1] === "Storage.ts" || rest[1] === "Preload.ts" ? "platform" : "game"
  if (top === "plugins" && rest[1]) return `plugin:${rest[1]}`
  return undefined
}

/** Resolve an import specifier written in `fromFile` to a repo-relative path, or `undefined` if it's external. */
const resolveSpecifier = (fromFile: string, specifier: string): string | undefined => {
  if (specifier.startsWith(".")) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier))
  }
  const workspace = /^@lambda-factori\/(core|contracts|runtime)\/(.+)$/.exec(specifier)
  if (workspace) return `packages/${workspace[1]}/src/${workspace[2]}`
  return undefined // an npm package, or a node builtin: not one of our layers
}

const IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']|\bimport\s[^;]*?\bfrom\s+["']([^"']+)["']|\bimport\s+["']([^"']+)["']|\bexport\s[^;]*?\bfrom\s+["']([^"']+)["']/g

/** Every import specifier written in a file, in source order (may repeat). */
const importsOf = (absPath: string): Array<string> => {
  const text = fs.readFileSync(absPath, "utf8")
  const out: Array<string> = []
  for (const m of text.matchAll(IMPORT_RE)) out.push(m[1] ?? m[2] ?? m[3] ?? m[4]!)
  return out
}

/** Whether `source` is allowed to import from `target` (rules 1–9 of §2; same layer is always fine). */
const allowed = (source: Layer, target: Layer, sourceFile: string): boolean => {
  if (source === target) return true
  // Rule 7: a plugin's manifest is loaded eagerly, before its chunk — kernel only, not even its own plugin.
  if (source.startsWith("plugin:") && path.posix.basename(sourceFile) === "manifest.ts") return target === "kernel"
  switch (source) {
    case "kernel": return false // rule 1: nothing from the rest of runtime, nothing from core/contracts
    case "platform": return false // rule 2: nothing from the rest of runtime
    case "ui": return target === "kernel" // rule 3: no core, no contracts — the kit is domain-free
    case "host": return target === "kernel" || target === "ui" || target === "platform" // rule 4: never names a plugin
    case "game": return target === "platform" || target === "core" || target === "contracts" // rule 5: no Pixi
    case "core": return false // rule 9: only effect and itself
    case "contracts": return false // rule 9: only effect and itself
    default:
      if (source.startsWith("plugin:")) return target !== "host" && !(typeof target === "string" && target.startsWith("plugin:")) // rule 6
      return true // rule 8: apps/*/src is the composition root, free to import anything
  }
}

interface Violation {
  readonly file: string
  readonly import: string
}

/**
 * Exact (file, import specifier) pairs the dependency rule forbids today,
 * left over from before this test existed. Shrinks every phase as the plan
 * fixes them; the test fails on both a new violation and a stale entry here,
 * so this list can never silently grow or go stale.
 */
const KNOWN_VIOLATIONS: ReadonlyArray<Violation> = [
  // ui/ still holds the combinator game's own scenes (phase 4 moves them into plugins/combinators/).
  { file: "packages/runtime/src/render/LevelScene.ts", import: "@lambda-factori/core/Board.ts" },
  { file: "packages/runtime/src/render/LevelScene.ts", import: "@lambda-factori/core/Catalogue.ts" },
  { file: "packages/runtime/src/render/LevelScene.ts", import: "@lambda-factori/core/Level.ts" },
  { file: "packages/runtime/src/render/LevelScene.ts", import: "@lambda-factori/core/Sim.ts" },
  { file: "packages/runtime/src/render/LevelScene.ts", import: "@lambda-factori/core/Term.ts" },
  { file: "packages/runtime/src/render/LevelScene.ts", import: "../game/Events.ts" },
  { file: "packages/runtime/src/render/LevelScene.ts", import: "../plugins/combinators/GameContext.ts" },
  { file: "packages/runtime/src/render/BookScene.ts", import: "@lambda-factori/core/Catalogue.ts" },
  { file: "packages/runtime/src/render/BookScene.ts", import: "@lambda-factori/core/Term.ts" },
  { file: "packages/runtime/src/render/BookScene.ts", import: "../plugins/combinators/GameContext.ts" },
  { file: "packages/runtime/src/render/MenuScene.ts", import: "@lambda-factori/core/Catalogue.ts" },
  { file: "packages/runtime/src/render/MenuScene.ts", import: "../plugins/combinators/GameContext.ts" },
  { file: "packages/runtime/src/render/factoryArt.ts", import: "@lambda-factori/core/Catalogue.ts" },
  { file: "packages/runtime/src/render/BoardEditor.ts", import: "@lambda-factori/core/Board.ts" },
  { file: "packages/runtime/src/render/BoardView.ts", import: "@lambda-factori/core/Board.ts" },
  { file: "packages/runtime/src/render/BoardView.ts", import: "@lambda-factori/core/Level.ts" },
  { file: "packages/runtime/src/render/LevelComplete.ts", import: "@lambda-factori/core/Catalogue.ts" },
  { file: "packages/runtime/src/render/LevelComplete.ts", import: "@lambda-factori/core/Level.ts" },
  { file: "packages/runtime/src/render/LevelComplete.ts", import: "@lambda-factori/core/Sim.ts" },
  { file: "packages/runtime/src/render/LevelTray.ts", import: "@lambda-factori/core/Catalogue.ts" },
  { file: "packages/runtime/src/render/LevelTray.ts", import: "@lambda-factori/core/Level.ts" },
  { file: "packages/runtime/src/render/SimAnimator.ts", import: "@lambda-factori/core/Board.ts" },
  { file: "packages/runtime/src/render/SimAnimator.ts", import: "@lambda-factori/core/Catalogue.ts" },
  { file: "packages/runtime/src/render/SimAnimator.ts", import: "@lambda-factori/core/Sim.ts" },
  { file: "packages/runtime/src/render/SimAnimator.ts", import: "@lambda-factori/core/Term.ts" },
  { file: "packages/runtime/src/render/TermRow.ts", import: "@lambda-factori/core/Catalogue.ts" },
  { file: "packages/runtime/src/render/TermRow.ts", import: "@lambda-factori/core/Trace.ts" },
  { file: "packages/runtime/src/render/Theater.ts", import: "@lambda-factori/core/Reduce.ts" },
  { file: "packages/runtime/src/render/Theater.ts", import: "@lambda-factori/core/Term.ts" },
  { file: "packages/runtime/src/render/Theater.ts", import: "@lambda-factori/core/Trace.ts" },
  { file: "packages/runtime/src/render/TheaterSpec.ts", import: "@lambda-factori/core/Catalogue.ts" },
  { file: "packages/runtime/src/render/TheaterSpec.ts", import: "@lambda-factori/core/Level.ts" },
  { file: "packages/runtime/src/render/TheaterSpec.ts", import: "@lambda-factori/core/Reduce.ts" },
  { file: "packages/runtime/src/render/TheaterSpec.ts", import: "@lambda-factori/core/Term.ts" },
  { file: "packages/runtime/src/render/floorGeometry.ts", import: "@lambda-factori/core/Board.ts" },
  // A deck test reaches into the office plugin's pure VM directly, ahead of any pack sharing.
  { file: "packages/runtime/src/plugins/deck/Deck.test.ts", import: "../office/program.ts" },
  { file: "packages/runtime/src/plugins/deck/Deck.test.ts", import: "../office/vm.ts" }
]

describe("the dependency rule (docs/plans/dependency-rule.md)", () => {
  const files = sourceFiles()
  const found: Array<Violation> = []

  for (const file of files) {
    const source = layerOf(file)
    if (!source) continue
    for (const spec of importsOf(path.join(REPO_ROOT, file))) {
      const resolved = resolveSpecifier(file, spec)
      if (!resolved) continue // external package or node builtin: always allowed
      const target = layerOf(resolved)
      if (!target) continue // resolves outside a layer this rule covers
      if (!allowed(source, target, file)) found.push({ file, import: spec })
    }
  }

  it("has no import the layer rules forbid, beyond KNOWN_VIOLATIONS", () => {
    const allowlisted = new Set(KNOWN_VIOLATIONS.map((v) => `${v.file} → ${v.import}`))
    const unexpected = found.filter((v) => !allowlisted.has(`${v.file} → ${v.import}`))
    expect(unexpected).toEqual([])
  })

  it("has no stale KNOWN_VIOLATIONS entry (the allowlist only shrinks)", () => {
    const actual = new Set(found.map((v) => `${v.file} → ${v.import}`))
    const stale = KNOWN_VIOLATIONS.filter((v) => !actual.has(`${v.file} → ${v.import}`))
    expect(stale).toEqual([])
  })

  it("classifies every runtime file into a layer (a new top-level folder needs a rule, not a silent escape)", () => {
    // architecture.test.ts itself sits at the root of packages/runtime/src, outside every
    // layer folder, and is the one file this rule doesn't apply to.
    const runtimeFiles = files.filter((f) => f.startsWith("packages/runtime/src/") && f !== "packages/runtime/src/architecture.test.ts")
    const unclassified = runtimeFiles.filter((f) => layerOf(f) === undefined)
    expect(unclassified).toEqual([])
  })
})

/**
 * The fitness function for the dependency rule (`docs/plans/dependency-rule.md`,
 * §2): source-code imports must cross the "red line" only from details toward
 * policy, never the other way. This is the only place the layer→layer rule
 * table lives; nothing else in the repo encodes it.
 *
 * The check is plain fs + regex over every `.ts` file under each package's
 * and each app's `src` directory: it classifies each file into a layer from its path,
 * extracts the (static and dynamic) import specifiers, resolves each to a
 * layer, and asks the rule table whether that edge is allowed. There is no
 * allowlist: every phase of the plan is done, so any violation is new and
 * fails the build. A separate check requires `layerOf` to classify every file
 * under `packages/runtime/src` (this file excepted): a new top-level folder
 * must be added to the rule table, not silently exempted from it.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..")

/** Every layer the rule table knows about. Pure packages, plugins, examples and apps are one layer per name. */
type Layer =
  | "kernel"
  | "platform"
  | "ui"
  | "host"
  | "game"
  | `pure:${string}`
  | `plugin:${string}`
  | `app:${string}`
  | `example:${string}`

/** Every package under `packages/` except `runtime` and `kernel` is pure domain logic (rule 9):
 *  `core`, `contracts`, `office`, and any future one, without editing this file to name it.
 *  `runtime` is the impure host; `kernel` is its own layer (mapped explicitly below) because,
 *  unlike a pure package, it may reach `pixi.js` — for types only. */
const PURE_PACKAGES = fs
  .readdirSync(path.join(REPO_ROOT, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "runtime" && entry.name !== "kernel")
  .map((entry) => entry.name)

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
    ...fs.readdirSync(path.join(REPO_ROOT, "apps")).map((p) => `apps/${p}/src`),
    ...(fs.existsSync(path.join(REPO_ROOT, "examples"))
      ? fs.readdirSync(path.join(REPO_ROOT, "examples")).map((p) => `examples/${p}/src`)
      : [])
  ].filter((rel) => fs.existsSync(path.join(REPO_ROOT, rel)))
  return roots.flatMap((rel) => walk(path.join(REPO_ROOT, rel)).map((f) => path.relative(REPO_ROOT, f).split(path.sep).join("/")))
}

/**
 * Classify a repo-relative path into a layer, or `undefined` if it's outside
 * the packages/apps/examples this rule covers (an npm package, a node builtin, or a
 * package with no layer rules of its own — those imports are always allowed).
 */
const layerOf = (relPath: string): Layer | undefined => {
  const parts = relPath.split("/")
  if (parts[0] === "apps") return `app:${parts[1]}`
  if (parts[0] === "examples") return `example:${parts[1]}`
  if (parts[0] !== "packages") return undefined
  const pkg = parts[1]
  if (pkg === undefined) return undefined
  if (pkg === "kernel") return "kernel"
  if (pkg !== "runtime") return PURE_PACKAGES.includes(pkg) ? `pure:${pkg}` : undefined
  const rest = parts.slice(3) // packages/runtime/src/<rest>
  const top = rest[0]
  if (top === "platform") return "platform"
  if (top === "ui") return "ui"
  if (top === "host") return "host"
  if (top === "game") return "game"
  if (top === "plugins" && rest[1]) return `plugin:${rest[1]}`
  return undefined
}

/** Resolve an import specifier written in `fromFile` to a repo-relative path, or `undefined` if it's external. */
const resolveSpecifier = (fromFile: string, specifier: string): string | undefined => {
  if (specifier.startsWith(".")) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier))
  }
  const workspace = /^@lambda-factori\/([^/]+)\/(.+)$/.exec(specifier)
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
    case "game": return target === "platform" || target === "pure:core" || target === "pure:contracts" // rule 5: no Pixi
    default:
      if (source.startsWith("plugin:")) return target !== "host" && !(typeof target === "string" && target.startsWith("plugin:")) // rule 6
      if (source.startsWith("pure:")) return target === "pure:contracts" // rule 9: only effect, itself and contracts
      if (source.startsWith("example:")) return target === "kernel" // a third-party plugin example: only the SDK
      return true // rule 8: apps/*/src is the composition root, free to import anything
  }
}

/** Whether every mention of "pixi.js" in `text` is type-only: `import type`/`export type … from`,
 * or a named import whose every specifier is written `type X`. Anything else — a default or
 * namespace import, a side-effect `import "pixi.js"`, a value re-export, a dynamic `import()` —
 * would load a real Pixi, which a plugin loaded from a URL can't share with the host's copy. */
const pixiImportIsTypeOnly = (text: string): boolean => {
  const statements = /\b(?:import|export)\b[^;"'`]*?["']pixi\.js["']|\bimport\s*\(\s*["']pixi\.js["']/g
  for (const [statement] of text.matchAll(statements)) {
    if (/^(?:import|export)\s+type\b/.test(statement)) continue
    const named = /^import\s*\{([^}]*)\}\s*from/.exec(statement)
    if (named && named[1]!.split(",").map((n) => n.trim()).filter(Boolean).every((n) => n.startsWith("type "))) continue
    return false
  }
  return true
}

/** Which npm packages a layer may import, or `undefined` if it's unrestricted. `vitest` and `node:`
 * builtins are always allowed (tests). Pure packages (rule 9) get only `effect`; the SDK and its
 * worked examples also get `pixi.js`, for types only (`pixiImportIsTypeOnly`). */
const externalAllowed = (source: Layer): ((spec: string) => boolean) | undefined => {
  const effect = (spec: string) => spec === "effect" || spec.startsWith("effect/")
  if (source.startsWith("pure:")) return effect
  if (source === "kernel" || source.startsWith("example:")) return (spec) => effect(spec) || spec === "pixi.js"
  return undefined
}

interface Violation {
  readonly file: string
  readonly import: string
}

describe("the dependency rule (docs/plans/dependency-rule.md)", () => {
  const files = sourceFiles()
  const found: Array<Violation> = []

  for (const file of files) {
    const source = layerOf(file)
    if (!source) continue
    for (const spec of importsOf(path.join(REPO_ROOT, file))) {
      const resolved = resolveSpecifier(file, spec)
      if (!resolved) {
        const allowedExternal = externalAllowed(source)
        if (!allowedExternal || spec === "vitest" || spec.startsWith("node:")) continue
        if (!allowedExternal(spec)) found.push({ file, import: spec })
        else if (spec === "pixi.js" && !found.some((v) => v.file === file) && !pixiImportIsTypeOnly(fs.readFileSync(path.join(REPO_ROOT, file), "utf8"))) {
          found.push({ file, import: `${spec} (value import)` })
        }
        continue
      }
      const target = layerOf(resolved)
      if (!target) continue // resolves outside a layer this rule covers
      if (!allowed(source, target, file)) found.push({ file, import: spec })
    }
  }

  it("has no import the layer rules forbid", () => {
    expect(found).toEqual([])
  })

  it("classifies every runtime file into a layer (a new top-level folder needs a rule, not a silent escape)", () => {
    // architecture.test.ts itself sits at the root of packages/runtime/src, outside every
    // layer folder, and is the one file this rule doesn't apply to.
    const runtimeFiles = files.filter((f) => f.startsWith("packages/runtime/src/") && f !== "packages/runtime/src/architecture.test.ts")
    const unclassified = runtimeFiles.filter((f) => layerOf(f) === undefined)
    expect(unclassified).toEqual([])
  })
})

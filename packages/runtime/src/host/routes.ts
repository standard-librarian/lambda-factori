/**
 * The pure decisions behind `Host`'s router: how a hash becomes a route
 * shape, how a deck slide kind ("<plugin id>/<mechanic name>") splits into
 * its parts, how a shared-pack type resolves to the plugin that owns it, and
 * whether loading a third-party plugin would shadow a built-in one. None of
 * this needs Pixi or a running app, so it's tested as a table, not through
 * screenshots.
 */
import type { PluginEntry } from "../kernel/Plugin.ts"

/** The segments of a hash route, decoded and with empty segments dropped
 * (`#/deck/x/1` → `["deck","x","1"]`, `#/` and `#` → `[]`). */
export const segments = (hash: string): ReadonlyArray<string> =>
  hash.replace(/^#\/?/, "").split("/").filter((s) => s.length > 0).map(decodeURIComponent)

export type Route =
  | { readonly _tag: "Home" }
  | { readonly _tag: "Open"; readonly payload: string }
  | { readonly _tag: "Import"; readonly url: string }
  | { readonly _tag: "ThirdParty"; readonly url: string; readonly path: ReadonlyArray<string> }
  | { readonly _tag: "Plugin"; readonly id: string; readonly path: ReadonlyArray<string> }

/** Classify a hash into the shape `Host.route()` switches on. `open`/`import`/`plugin` are
 * reserved first segments; anything else is a plugin id followed by its own path. */
export const parseRoute = (hash: string): Route => {
  const [id, ...rest] = segments(hash)
  if (id === undefined) return { _tag: "Home" }
  if (id === "import" && rest[0]) return { _tag: "Import", url: rest.join("/") }
  if (id === "open" && rest[0]) return { _tag: "Open", payload: rest[0] }
  if (id === "plugin" && rest[0]) return { _tag: "ThirdParty", url: rest[0], path: rest.slice(1) }
  return { _tag: "Plugin", id, path: rest }
}

/** Split a deck slide kind into the plugin id and mechanic name, or `undefined` for a core kind
 * (no slash) that the deck resolves from its own registry, never asking the host. */
export const parseMechanicKind = (kind: string): { readonly id: string; readonly name: string } | undefined => {
  const i = kind.indexOf("/")
  return i < 0 ? undefined : { id: kind.slice(0, i), name: kind.slice(i + 1) }
}

/** Find the plugin entry that declares `type` among its `packTypes` (a shared `#/open`/
 * `#/import` pack), or `undefined` if none does. */
export const resolveOwner = (entries: ReadonlyArray<PluginEntry>, type: string): PluginEntry | undefined =>
  entries.find((e) => e.packTypes?.includes(type))

/** Whether a third-party plugin loaded by `#/plugin/<url>` would silently replace a built-in
 * one: both live in the same id-keyed table, so a URL must never claim a built-in's id. */
export const shadowsBuiltin = (entries: ReadonlyArray<PluginEntry>, id: string): boolean =>
  entries.some((e) => e.id === id)

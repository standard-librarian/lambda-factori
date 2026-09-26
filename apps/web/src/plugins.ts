/**
 * The one list of built-in plugins — the composition root the dependency
 * rule requires (`docs/plans/dependency-rule.md` §2, rule 8): this is the
 * only file that names concrete plugins and wires their ports. `main.ts`
 * calls `builtinPlugins` once, with a promise for the ports (constructed
 * once the Effect services are up), and passes the resulting entries to
 * `Host`. Each entry's `load` is memoized so the early route prefetch in
 * `main.ts` and the `Host`'s own load share one in-flight import and one
 * plugin instance.
 */
import type { PluginEntry } from "@lambda-factori/runtime/kernel/Plugin.ts"
import { manifest as combinatorsManifest } from "@lambda-factori/runtime/plugins/combinators/manifest.ts"
import type { CombinatorsPort } from "@lambda-factori/runtime/plugins/combinators/plugin.ts"
import { manifest as deckManifest } from "@lambda-factori/runtime/plugins/deck/manifest.ts"
import type { DeckLibrary } from "@lambda-factori/runtime/plugins/deck/plugin.ts"
import { deckShelf } from "@lambda-factori/runtime/plugins/deck/shelf.ts"
import { manifest as editorManifest } from "@lambda-factori/runtime/plugins/editor/manifest.ts"
import type { LevelLibrary } from "@lambda-factori/runtime/plugins/editor/plugin.ts"
import { manifest as officeManifest } from "@lambda-factori/runtime/plugins/office/manifest.ts"

export interface Ports {
  readonly combinators: CombinatorsPort
  readonly editor: LevelLibrary
  readonly deck: DeckLibrary
}

/** Cache a load's promise, so calling it again (from the prefetch, or from `Host`) reuses it. */
const memoize = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  let cached: Promise<T> | undefined
  return () => (cached ??= load())
}

/**
 * `ports` is a promise because the prefetch (see `main.ts`) must call `load`
 * before the Effect services that back the ports exist — it only needs the
 * plugin's chunk to start downloading, not a fully constructed plugin. Each
 * `load` awaits the chunk and the ports independently, so the import starts
 * immediately either way.
 */
export const builtinPlugins = (ports: Promise<Ports>): ReadonlyArray<PluginEntry> => [
  {
    ...combinatorsManifest,
    load: memoize(async () => {
      const m = await import("@lambda-factori/runtime/plugins/combinators/plugin.ts")
      return m.plugin((await ports).combinators)
    })
  },
  {
    ...editorManifest,
    load: memoize(async () => {
      const m = await import("@lambda-factori/runtime/plugins/editor/plugin.ts")
      return m.plugin((await ports).editor)
    })
  },
  {
    ...deckManifest,
    // The shelf needs only the deck list, so it's wired here without the plugin's own chunk.
    shelf: deckShelf(() => ports.then((p) => p.deck.list())),
    load: memoize(async () => {
      const m = await import("@lambda-factori/runtime/plugins/deck/plugin.ts")
      return m.plugin((await ports).deck)
    })
  },
  {
    // A library plugin: no port, it only lends the deck a mechanic.
    ...officeManifest,
    load: memoize(async () => (await import("@lambda-factori/runtime/plugins/office/plugin.ts")).plugin)
  }
]

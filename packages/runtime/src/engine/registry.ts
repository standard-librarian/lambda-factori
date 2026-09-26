import type { PluginEntry } from "../kernel/Plugin.ts"

/**
 * Built-in plugins. Each `load` is a dynamic import, so every plugin is its
 * own chunk and nothing is loaded until it is opened. Third-party plugins can
 * be added at runtime with `#/plugin/<url-encoded module url>`; the module's
 * default export must be a `Plugin`.
 */
export const builtins: ReadonlyArray<PluginEntry> = [
  {
    id: "combinators",
    title: "combinator factory",
    subtitle: "the λ factori game: S and K to APL",
    kind: "game",
    color: 0xac1b2b,
    shade: 0x73000b,
    load: () => import("../plugins/combinators/plugin.ts").then((m) => m.plugin)
  },
  {
    id: "editor",
    title: "level editor",
    subtitle: "make and playtest your own levels",
    kind: "tool",
    color: 0x306db5,
    shade: 0x1f4c85,
    load: () => import("../plugins/editor/plugin.ts").then((m) => m.plugin)
  },
  {
    id: "deck",
    title: "slide decks",
    subtitle: "explain ideas with moving parts",
    kind: "deck",
    color: 0x4cc887,
    shade: 0x399871,
    load: () => import("../plugins/deck/plugin.ts").then((m) => m.plugin)
  }
]

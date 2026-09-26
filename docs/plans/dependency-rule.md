# Plan: the dependency rule (invert the host ↔ plugin arrows)

**Status: phases 1–5 done.**

Goal: make λ factori cheaper to change, more modular and more general, following *A Philosophy
of Software Design* (deep modules, information hiding, no change amplification, no unknown
unknowns) and Clean Architecture's **dependency rule**: source-code dependencies cross the
"red line" only in one direction, from details (below) toward policy (above), the opposite of
how control flows at runtime.

## 1. What is wrong today

Control flows `main → Host → registry → plugin → scenes → Pixi`, and **source dependencies
point the same way**, so the "generic" host is coupled to every plugin and to the combinator
game in particular:

| Violation | Where | Why it hurts |
|---|---|---|
| Host names concrete plugins | `engine/Host.ts`, `engine/HomeScene.ts` → `engine/registry.ts` → `plugins/*` | Adding a plugin edits the host. Third-party plugins are second-class. |
| Plugin manifest written twice | `engine/registry.ts` and each `plugins/*/plugin.ts` both hold id/title/colour | A hand-written list that must match another list (CLAUDE.md rule 2). |
| The plugin contract knows combinators | `engine/Plugin.ts` imports `Board`, `Level`, `LevelPack`, `GameEvent`, `SaveData`, `Deck`; `Services` is one fat interface for every plugin | Every plugin depends on every other plugin's data. Nothing reusable for another app. |
| The scene contract knows combinators | `render/Scene.ts` holds `GameContext` and `onEvent(GameEvent)` | Kernel → game dependency; `Host.onEvent` forwards game events. |
| Host decodes plugin data | `engine/OpenScene.ts` decodes `Deck` and `Level`, and hardcodes routes `combinators/level/…`, `editor/…` | Share links can't carry a new pack type without editing the host. |
| Host imports a plugin's helpers | `engine/OpenScene.ts` → `plugins/deck/slides/common.ts` (`para`) | Engine → plugin. |
| Mechanics registry hardcodes office, global mutable state | `engine/mechanics.ts` (`loaders = { office }`, module-level `loaded` map, `registerMechanics`) → `plugins/deck`, `plugins/office` | Engine → plugins, and hidden mutable state. |
| Plugin → plugin | `plugins/office/OfficeSlide.ts` → `plugins/deck/slides/common.ts` (`SlideView`, `SlideContext`); `plugins/deck/slides/theater.ts` → `render/TermRow.ts`, `core/Term`, `core/Trace` | The office can't exist without the deck's internals; the deck can't exist without the combinator game. |
| Plugins import host internals | `plugins/*` → `engine/share.ts`, `engine/devHooks.ts` | Details reach sideways into the host. |
| `render/` is two things | Generic kit (theme, label, Button, tween, …) mixed with the combinator game's scenes (LevelScene, BoardView, BookScene, Theater, …); `factoryArt.ts` imports `core/Catalogue` | "Shared UI" depends on one plugin's domain. |
| `game/` is two things | Generic platform (`Storage`, `Preload`) mixed with combinator services and the deck service | Same. |

## 2. Target: layers and the red line

```
            ┌───────────────────────────────────────────────────────────┐
  POLICY    │ packages/core, packages/contracts   pure domain + schemas  │  depend on: effect
  (stable)  │ runtime/kernel/   the ports: Plugin, HostApi, Scene,       │  depend on: nothing in runtime
            │                   Slide (SlideView, SlideContext, Mechanic),│  (pixi *types* ok)
            │                   tween                                     │
 ═══════════╪════════════════════ red line ═════════════════════════════╪══════════
  DETAILS   │ runtime/platform/ Storage, Preload, devHooks (browser)     │  → nothing in runtime
 (volatile) │ runtime/ui/       domain-free Pixi kit                     │  → kernel
            │ runtime/host/     Host, router, HomeScene, OpenScene,      │  → kernel, ui, platform
            │                   share codec, community registry, perf    │
            │ runtime/game/     the combinator game's Effect services    │  → platform, core, contracts
            │ runtime/plugins/<id>/  one plugin each                     │  → kernel, ui, platform, game,
            │                                                            │    core, contracts, itself
            │ apps/web/src/     composition root ("Main")                │  → anything
            └───────────────────────────────────────────────────────────┘
```

Rules (enforced by `packages/runtime/src/architecture.test.ts`, part of `pnpm check`):

1. `kernel/` imports nothing from the rest of `runtime/`, and nothing from `core`/`contracts`.
2. `platform/` imports nothing from the rest of `runtime/`.
3. `ui/` imports only `kernel/` (no `core`, no `contracts`: the kit is domain-free).
4. `host/` imports only `kernel/`, `ui/`, `platform/`. **The host never names a plugin.**
5. `game/` imports only `platform/`, `core`, `contracts` (no Pixi).
6. `plugins/<a>/` never imports `plugins/<b>/` or `host/`. Plugins talk to each other only
   through routes (strings) and kernel ports.
7. `plugins/<a>/manifest.ts` imports only `kernel/` (it is loaded eagerly, before the chunk).
8. Only `apps/*/src` names concrete plugins and wires services (the composition root).
9. `packages/core` and `packages/contracts` import only `effect` and themselves.

Runtime flow after the change is unchanged (`main → Host → plugin → Pixi`); only the source
arrows flip: plugins and the host both point **up** at `kernel/`, and `main` points at all.

## 3. The kernel ports (the new interfaces)

Keep them small and deep: each hides a decision the others must not know.

```ts
// kernel/Plugin.ts
interface PluginManifest {
  id; title; subtitle; kind: "game" | "tool" | "deck" | "library"; color; shade
  /** SharedPack types this plugin can preview and import (e.g. deck → ["deck"], combinators → ["levels"]). */
  packTypes?: ReadonlyArray<string>
}
interface PluginEntry extends PluginManifest {
  load(): Promise<Plugin>                                  // lazy chunk
  /** Cards for the home screen, without loading the chunk (e.g. the deck list). */
  shelf?(): Promise<ReadonlyArray<ShelfCard>>
}
interface Plugin extends PluginManifest {
  open?(host: HostApi, path: ReadonlyArray<string>): void | Promise<void>   // optional: library plugins have no routes
  mechanics?: Readonly<Record<string, Mechanic>>          // slide kinds "<id>/<name>"
  previewPack?(type: string, data: unknown, host: HostApi): PackPreview      // throws on bad data
}
interface HostApi {
  app; tweens
  show(make); navigate(route); replaceRoute(route); home(); toast(text)
  /** Copy a `#/open/…` share link for a pack. */
  share(pack: SharedPack): Promise<string>
  /** Resolve plugin slide kinds, loading their plugins. Throws a readable error for unknown kinds. */
  mechanics(kinds: ReadonlyArray<string>): Promise<ReadonlyMap<string, Mechanic>>
}
// No `services` on HostApi: each plugin receives its own ports from the composition root.

// kernel/Scene.ts  — Scene { view; tick?; animating?; onKey?; destroy } (no onEvent, no GameContext)
// kernel/Slide.ts  — SlideContext, SlideView, Mechanic (moved from deck/slides/common + engine/mechanics)
// kernel/tween.ts  — moved from render/tween.ts (already dependency-free)
```

Services are **ports owned by the client** (Dependency Inversion + Interface Segregation):
`plugins/combinators` declares the interface it needs (pack, progress, saveBoard, publish,
subscribe to game events, custom levels); `plugins/editor` declares its own `LevelLibrary`;
`plugins/deck` declares its `DeckLibrary`. `apps/web/src` adapts the Effect services to them.
Game events stop flowing through the host: the combinators plugin subscribes and forwards to
its own scenes.

## 4. Phases

Each phase ends with `pnpm check` exiting 0 and one commit. Behaviour is preserved throughout
(except the one data migration in phase 4, which is backward compatible).

### Phase 1: fitness function, kernel, and the office ↔ deck cut
- Add `packages/runtime/src/architecture.test.ts`: read every `.ts` under `packages/*/src` and
  `apps/*/src`, extract import specifiers (static and dynamic), resolve them to a layer, and
  check rules 1–9. The rule table lives only in this file. It has a `KNOWN_VIOLATIONS`
  allowlist of exact `file → import` pairs present today; the test fails on any new violation
  **and** on any allowlisted pair that no longer occurs, so the list can only shrink (ratchet).
  Map today's folders to layers during the transition (`engine/` counts as host, `render/` as
  ui); later phases rename them.
- Create `kernel/`: move `engine/Plugin.ts` → `kernel/Plugin.ts`, `render/Scene.ts` →
  `kernel/Scene.ts`, `render/tween.ts` → `kernel/tween.ts`; add `kernel/Slide.ts` with
  `SlideContext`, `SlideView`, `Mechanic`. `GameContext` moves to
  `plugins/combinators/GameContext.ts`. Office imports `kernel/Slide.ts`, not the deck.

### Phase 2: invert the registry, services, events and mechanics
- Each plugin gets `manifest.ts` (single source for id/title/colour/kind/packTypes); its
  `plugin.ts` spreads it. Delete `engine/registry.ts`.
- `apps/web/src/plugins.ts` (new) is the only list of built-in plugins: manifest + lazy
  `load` that constructs the plugin with its ports. Memoize loads so the early route prefetch
  in `main.ts` and the Host share one instance, and keep that prefetch (the chunk for the
  current route must still start downloading before fonts/Pixi init).
- `Host` takes `entries: ReadonlyArray<PluginEntry>` in its constructor. Third-party plugins
  loaded by `#/plugin/<url>` join the same table (so their mechanics resolve).
- Replace `Services` with per-plugin ports (§3). Remove `HostApi.services`, `Host.onEvent`,
  `Scene.onEvent`. Combinators subscribes to game events itself.
- Mechanics: delete `engine/mechanics.ts` (global `loaders`/`loaded`/`registerMechanics`).
  Office becomes a `library` plugin with `mechanics: { scene }` and no route. `HostApi.mechanics`
  resolves kinds through the entries. The deck plugin resolves its deck's kinds once and
  passes the map to `DeckScene` / `renderSlide` (no module-level state).
- `HostApi.share` replaces plugin imports of `engine/share.ts`; `devHooks` moves to `platform/`.

### Phase 3: a generic host
- `HomeScene` builds its rows from the entries: tools (entries that are not `library`/`deck`),
  one row per entry with a `shelf` (deck: its decks, mapped to cards in
  `plugins/deck/shelf.ts`, which stays light), and the community row. No decks service, no
  registry import.
- `OpenScene` becomes a generic pack card: decode the share envelope, find the entry whose
  `packTypes` includes `type`, load it, call `previewPack` → `{ title, subtitle, meta, actions }`,
  render it; errors render the existing "doesn't match the format" card. Deck previews (play
  now, remix a copy) move into the deck plugin; level previews (play now, open in editor) into
  combinators. `share.ts`'s `SharedPack.type` becomes `string`.
- Move domain-free helpers the host or several plugins need into `ui/`: `para`, `color`,
  `shade`, `SERIF`, `MONO` (e.g. `ui/text.ts`), `cardArt`, `stickyNote`, `avatar`, `Reveal`
  where more than the deck uses them, and `logo` (from `MenuScene`) plus the generic building
  art used by the home decor. Helpers only the deck uses stay in the deck.

### Phase 4: move the combinator game out of the shared kit; rename to the target layout
- Move the game's scenes from `render/` to `plugins/combinators/`: `LevelScene`, `BoardView`,
  `BoardEditor`, `SimAnimator`, `LevelTray`, `LevelComplete`, `floorGeometry`, `StickerPile`,
  `BookScene`, `MenuScene`, `Theater`, `TheaterSpec`, `TermRow`, `archive`, and whatever else
  only the game uses. Split `factoryArt.ts`: domain-free art stays in `ui/`; anything that
  needs `core/Catalogue` (`colorOf`) moves to combinators.
- `theater` slide → combinators mechanic `combinators/theater`, validated with its own schema
  in `packages/contracts/src/TheaterSlide.ts` (like `OfficeSpec`). Remove `Theater` from the
  deck's `Core` union and its template. **Backward compatibility:** a schema-level migration in
  `Deck.ts` decodes legacy `kind: "theater"` as `combinators/theater`, so saved decks and old
  share links still open; test it. Update the two bundled decks to the new kind.
- Rename folders: `render/` → `ui/`, `engine/` → `host/`; `game/Storage.ts`, `game/Preload.ts`
  → `platform/`; `game/Decks.ts` → `plugins/deck/Decks.ts`. `game/` keeps the combinator
  game's services (header says so: used by the combinators and editor plugins).
- `KNOWN_VIOLATIONS` must now be empty: delete it. The test is strict from here on.

### Phase 5: docs
- CLAUDE.md: new "Dependency rule" section (the diagram and rules, pointing at
  `architecture.test.ts`); update the Map and the recipes ("add a plugin" = a folder with
  `manifest.ts` + `plugin.ts`, and one entry in `apps/web/src/plugins.ts`; "add a plugin
  slide mechanic" = add it to the plugin's `mechanics`; "add a share pack type" = `packTypes` +
  `previewPack`). File headers for every moved/new file.

## 5. Out of scope (propose separately if wanted)
- Splitting `runtime` into separate npm workspace packages (the test gives the same
  guarantee with less ceremony; revisit if the rule table grows).
- Moving the office VM (`vm.ts`, `program.ts`) into a pure package.
- Plugin-supplied editor templates for mechanic slide kinds.

## 6. How the result is judged
1. `pnpm check` exits 0; `pnpm build` succeeds.
2. `architecture.test.ts` exists, encodes rules 1–9, and has no allowlist.
3. Change-amplification probes: adding a plugin touches its folder + one line in
   `apps/web/src/plugins.ts`; adding a mechanic or pack type touches only its plugin; the host
   and kernel are untouched in all three.
4. Behaviour (driven with `scripts/drive.ts`, screenshots inspected): home (tools, decks
   shelf, community), combinators menu and a level, the mechanics tour including the theater
   and office slides, the editor, and a `#/open/…` link for a deck and for levels.
5. APOSD hygiene: headers on every new/moved file, no pass-through modules, no re-exports,
   no getters leaking internal state, names consistent across files, CLAUDE.md true.

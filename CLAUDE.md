# λ factori

A framework for explaining ideas with moving parts, in Word Factori's visual language. The
host knows nothing about combinators or slides: everything is a plugin, lazily loaded and
addressed by a hash route (`#/<plugin>/<path…>`). All art is procedural Pixi Graphics; do not
add assets ripped from Word Factori (or any other game).

## How to work in this codebase

The goal is that an agent can **research, plan and change** this project by reading as little
as possible. The rules come from *A Philosophy of Software Design* (APOSD) and *Clean Code*,
chosen for what makes that cheap. When they conflict, prefer APOSD's depth over small units.

1. **Read headers first, bodies last.** Every file starts with a comment saying what the module
   is for and what it hides; exported functions and types have interface comments. Research
   stays cheap if you read headers and signatures and open a body only when you'll change it.
   When you create a file, write that header. When you touch a file without one, add it.
2. **Make the compiler find the places, not the reader.** A change that must touch several
   files is change amplification. If those places can be forgotten, they are unknown unknowns.
   Turn them into compile errors: registries typed as mapped types over a union (see
   `slideKinds` and `templates`, keyed by the schema's `CoreKind`), exhaustive `switch`es,
   and `Schema` for every piece of data from outside. Never keep a hand-written list of kinds,
   ids or names that must match another list.
3. **Deep modules, split along knowledge.** A module earns its interface by hiding more than it
   exposes. Split a file when a part hides its own decision (e.g. `LevelComplete.ts`,
   `TheaterSpec.ts`), not because it's long, and never into 3-line pass-throughs (Parnas:
   decompose by the decisions you hide, not by the order things run in). Keep representations
   private: no getters that hand out internal maps or arrays.
   - **One module, one job.** If its header needs "and" between unrelated things, it's two
     modules.
   - **One slide kind per file**, so kind → file is obvious.
   - **Pure parts get their own file and tests:** the clock (`lineTimeline.ts`), text formats
     (`levelText.ts`), specs (`TheaterSpec.ts`).
   - **Size:** most files are under ~250 lines. Something longer is fine only if it's one
     coherent thing, like a schema list or an algorithm.
4. **Pure core, effects at the edges.** Logic lives in `packages/core` as pure functions with
   tests. Scenes and slides make what's on screen a function of state, e.g. `line.ts` renders
   from `(run, time)`, so pause, seek and replay can't drift. Avoid hidden mutable state. When
   state is needed, keep it in one place and name it (*Out of the Tar Pit*: avoid, then
   separate).
5. **Packages are the information-hiding boundary.** Every package except `runtime` (`core`,
   `contracts`, `office`, …) is pure: it depends only on `effect`, itself and `contracts` (no
   Pixi, no DOM). Anything that renders lives in `runtime`. Apps are thin shells.
   Import across packages by name (`@lambda-factori/core/Term.ts`) and relatively within one.
   Don't re-export another module's names; import them from where they live. Within `runtime`,
   the same boundary applies one level down between its folders — see "Dependency rule".
6. **Names are search keys.** Use one precise name per concept, the same name everywhere
   (schema field, variable, CSS class), and names specific enough to grep. Don't create two
   names for one value (the `TRAY_X` alias of `BOARD_W` was removed for this reason).
7. **Comments carry what code can't.** Say why, what's not obvious, units and invariants. Don't
   restate the code. Keep them true: a stale comment is worse than none, so fix it when you
   see it.
8. **Invest strategically.** Fix the design problem instead of patching around it. Spend about
   10–20% of a task leaving the design better than you found it.
9. **Tests are the spec and must stay fast** (the whole suite runs in about a second). Data is
   tested too: every deck decodes, every code step points at real lines, every change map
   names real decisions, every editor template decodes.
10. **Verify with one command: `pnpm check`** (typecheck + tests + knip dead-code scan), and
    check its exit code. `pnpm -s` hides typecheck errors, so don't use `-s` for verification.
    For behaviour, drive the running app with `scripts/drive.ts` and look at the screenshots.

### Incidental cleanups (the Boy Scout rule)

While working on a task, leave each file you touch a little cleaner:
- delete dead code and unused imports (`noUnusedLocals` and knip will flag them);
- fix a stale comment or add a missing header;
- rename an unclear local;
- collapse a pass-through.

Keep these cleanups small, confined to the code you're already in, behaviour-preserving, and
covered by `pnpm check`. Mention them in the commit message. Don't rewrite unrelated modules on
the way. If you find a bigger design problem, finish the task, then propose the fix separately.

## Dependency rule

Source-code imports point only from details toward policy, never the other way — the opposite
of how control flows at runtime (`main → Host → plugin → Pixi`). Enforced by
`packages/runtime/src/architecture.test.ts` (part of `pnpm check`), the only place the rule
table lives, with no allowlist: a new violation, of any size, fails the build.

```
            ┌───────────────────────────────────────────────────────────┐
  POLICY    │ every packages/* except runtime and kernel: pure domain   │  → effect, itself,
  (stable)  │ + schemas (core, contracts, office, …), `pure:<name>` each│    contracts
            │ packages/kernel   the SDK: Plugin, HostApi, Scene,         │  → nothing of ours
            │                   Slide (SlideView, SlideContext, Mechanic),│  (pixi *types* ok)
            │                   defineMechanic, tween                    │
 ═══════════╪════════════════════ red line ═════════════════════════════╪══════════
  DETAILS   │ runtime/platform/ Storage, Preload, devHooks (browser)     │  → nothing in runtime
 (volatile) │ runtime/ui/       domain-free Pixi kit                     │  → kernel
            │ runtime/host/     Host, router, HomeScene, OpenScene,      │  → kernel, ui, platform
            │                   share codec, community registry, perf    │
            │ runtime/game/     the combinator game's Effect services    │  → platform, core, contracts
            │ runtime/plugins/<id>/  one plugin each                     │  → kernel, ui, platform, game,
            │                                                            │    core, contracts, itself
            │ examples/<name>/src  a worked third-party plugin           │  → kernel only
            │ apps/*/src        composition root                        │  → anything
            └───────────────────────────────────────────────────────────┘
```

1. `packages/kernel` imports nothing of ours, and externally only `effect`/`effect/*` and
   `pixi.js`'s types (`import type`, never a value import — a third-party plugin can't share
   the host's copy of pixi.js, so the kernel must never force one in).
2. `platform/` imports nothing else in `runtime`.
3. `ui/` imports only `kernel/` — the kit is domain-free (no `core`, no `contracts`).
4. `host/` imports only `kernel/`, `ui/`, `platform/`. **The host never names a plugin.**
5. `game/` imports only `platform/`, `core`, `contracts` (the pure packages) — no Pixi.
6. `plugins/<a>/` never imports `plugins/<b>/` or `host/`. Plugins talk to each other only
   through routes (strings) and kernel ports.
7. `plugins/<a>/manifest.ts` imports only `kernel/` — it is loaded eagerly, before the chunk.
8. Only `apps/*/src` names concrete plugins and wires services (the composition root).
9. Every package under `packages/` except `runtime` and `kernel` is pure: it imports only
   `effect`, itself and `contracts` — never Pixi or another package. Derived from
   `readdirSync(packages/)`, so a new pure package is covered without editing the rule table.
10. `examples/<name>/src` (a third-party plugin built as a worked example, e.g.
    `examples/hello-plugin`) imports only `@lambda-factori/kernel` — proof that the SDK is
    enough on its own, never the runtime or another package.

## Recipes

- **Add a core slide kind:**
  1. Add a `Schema.Struct` in `packages/contracts/src/Deck.ts` and list it in `Core`.
  2. `pnpm typecheck` now fails until you add a renderer entry in
     `packages/runtime/src/plugins/deck/render.ts` (`slideKinds`) and an editor template in
     `plugins/deck/templates.ts`.
  3. Write the renderer in `plugins/deck/slides/`. It returns a `SlideView`: `steps`,
     `setStep`, optional `tick`/`animating`.
  4. Add a slide to the mechanics tour deck, and a test if the kind has data invariants.
- **Add a plugin slide mechanic** (`<plugin>/<name>`): export a `mechanics: Record<string,
  Mechanic>` from the plugin and spread it onto the `Plugin` object returned by `plugin.ts`
  (see `plugins/office/mechanics.ts`, `plugins/combinators/mechanics.ts`). `HostApi.mechanics`
  resolves a deck's `<plugin>/<name>` kinds by loading the owning plugin — nothing to register
  elsewhere. Validate the slide's fields with its own schema in `packages/contracts`, as
  `office/scene` does with `OfficeSpec.ts` (`combinators/theater` does the same with
  `TheaterSlide.ts`).
- **Add a plugin:**
  1. Give it a folder under `plugins/<id>/` with a `manifest.ts` (`id`, `title`, `subtitle`,
     `kind`, `color`, `shade`, and `packTypes` if it shares anything) and a `plugin.ts` that
     spreads the manifest onto a `Plugin` (`@lambda-factori/kernel/Plugin.ts`).
  2. List one entry in `apps/web/src/plugins.ts` — the only file that names concrete plugins —
     with a lazy `load` that imports `plugin.ts` and constructs it with its own port.
  3. Its routes are `#/<id>/…`. A `library` plugin (like `office`) has no route, only
     `mechanics`.
- **Add a share pack type:** add it to the plugin's manifest `packTypes` and implement
  `previewPack(type, data, host)` on the `Plugin`, returning `{ title, subtitle, meta, actions
  }` (throw a readable message on bad data — `OpenScene` shows it as "this pack doesn't match
  the format"). `OpenScene` finds the owning entry by matching `packTypes` alone; the host
  never decodes the pack itself.
- **Add a home-screen shelf:** give the plugin's entry, in `apps/web/src/plugins.ts`, a
  `shelf: { title, cards() }` (`@lambda-factori/kernel/Plugin.ts`'s `HomeShelf`; see `plugins/deck/shelf.ts`).
  `HomeScene` renders one row per entry that has a shelf, titled by the shelf itself — never a
  title it guesses from `kind`.
- **Add a level:** add it to `packages/core/src/data/levels.json`. Find the smallest recipe with
  `pnpm search <name> <atoms> <depth>`. Tests decode the pack.
- **Add or edit a deck:** put the JSON in `apps/web/public/decks/<id>.json` and list it in
  `index.json`. `Deck.test.ts` checks it. Quote sources verbatim.

## Map

Plugins (`apps/web/src/plugins.ts`, the composition root — see "Dependency rule"):
- **`combinators`:** the combinator-logic factory game (start from S and K, derive the birds, up
  to APL/BQN trains and Church booleans). Routes: `#/combinators`, `/level/<id>`,
  `/book/<page>`, `/test/<id>` (playtest from the editor). Shares level packs
  (`packTypes: ["levels"]`) and lends the deck one slide mechanic, `combinators/theater`, an
  inline reduction theater.
- **`editor`:** level creation mode: validate, find the smallest recipe, save, playtest,
  import/export.
- **`deck`:** slide decks as runtime data, in `apps/web/public/decks/<id>.json` and listed in
  its `index.json`. Routes: `#/deck/<id>/<n>`, `#/deck/<id>/presenter`. Shares decks
  (`packTypes: ["deck"]`) and lends the home screen its "your decks" shelf.
  - Factory-style kinds:
    - `factory`: modules as buildings, with an x-ray step;
    - `decisions`: a Parnas change map, where `secretly` gems are unknown unknowns;
    - `line`: an assembly line with hidden-state gauges, a seekable timeline and its own
      playback bar.
  - Slides can move the deck's step with `ctx.syncStep`, and report `animating()` so
    render-on-demand knows when they need frames.
- **`office`:** a `library` plugin (no route, no home-screen card): a Human Resource
  Machine-style mechanic, the slide kind `office/scene`.
  - It runs an HRM-format program (INBOX/OUTBOX/COPYFROM/COPYTO/ADD/SUB/BUMP/JUMP/JUMPZ/JUMPN,
    with labels `a:`).
  - It also has presentation verbs: VISIT/PASS/WORK desks, SAY/THINK, BOSS, CLERK
    <desk> "…", HOLD/DROP, NOTE, and PAUSE as a build beat.
  - The VM is a pure package: `packages/office/src/vm.ts` (`@lambda-factori/office/vm.ts`).
- **Third-party plugins:** `#/plugin/<url>` loads an ES module whose default export is a
  `Plugin`. Plugin slide kinds are namespaced (`<plugin>/<mechanic>`) and preloaded before a
  deck opens. Built only against `@lambda-factori/kernel` (see `examples/hello-plugin` and the
  README's "Write a plugin"); a deck can resolve a URL plugin's mechanics only after that
  plugin has already been opened once by route in the same session.

Sharing (no backend): a pack is `{ type, data }`; the host matches `type` against a plugin's
`packTypes` and asks that plugin's `previewPack` what to show — it never decodes a deck or a
level pack itself (`host/OpenScene.ts`).
- `#/open/<deflate+base64url pack>` share links: S in a deck, or "copy share link" in the
  editor;
- `#/import/<url>` for hosted JSON packs;
- community registries: `apps/web/public/registry.json`, plus any registry URL added from the
  home screen.

Layout (a pnpm workspace organized like t3code; `pnpm-workspace.yaml` has a version catalog):
- **`apps/web`:** the browser app: `index.html`, `vite.config.ts`, `src/main.ts` (wires the
  Effect layers) and `src/plugins.ts` (the composition root), and `public/` (decks, fonts,
  registry.json). This is what GitHub Pages serves.
- **`apps/mobile-capacitor`:** experiment. The web build as an iOS app (Capacitor 8, SPM).
  - `pnpm --filter @lambda-factori/mobile-capacitor sync`, then `build:sim`.
  - `LF_START="?perf#/deck/…"` opens a route with the frame-stats probe on.
- **`packages/core`:** pure logic (terms, reduction, trace, board with wire routing over
  `MinHeap`, sim, levels, recipe search) and `data/levels.json`.
- **`packages/contracts`:** the shared schemas: `Deck.ts` (`Slide`, `SlideOf`, `CoreKind`, and
  the migration that still decodes a legacy `kind: "theater"` slide as `combinators/theater`),
  `OfficeSpec.ts`, `TheaterSlide.ts`.
- **`packages/office`:** the office plugin's HRM interpreter, pure and Pixi-free: `vm.ts`
  (`run`, `check`) and `program.ts` (the text format). `packages/runtime/src/plugins/office/`
  holds everything that renders it.
- **`packages/kernel`:** the plugin SDK — the only package a third-party plugin (or `runtime`)
  depends on: `Plugin.ts` (`HostApi` including `pixi`, `PluginManifest`, `Plugin`, `PluginEntry`,
  `HomeShelf`, `SharedPack`, `PackPreview`), `Scene.ts`, `Slide.ts` (`SlideContext`, `SlideView`,
  `Mechanic`), `mechanic.ts` (`defineMechanic`), `tween.ts`. Depends only on `effect`, and on
  `pixi.js` as a peerDependency for its types (never a value import — see the dependency rule).
- **`examples/hello-plugin`:** the SDK's worked example — a third-party plugin built only
  against `@lambda-factori/kernel`, with a route and the `hello/counter` slide mechanic, built to
  a single ES module with Vite library mode. Not a dependency of any app; see the README's
  "Write a plugin" section.
- **`packages/runtime`:** what every shell loads, laid out by the dependency rule.
  - `platform/`: browser details shared by nothing else in `runtime`: `Storage`, `Preload`,
    `devHooks.ts`.
  - `ui/`: the domain-free Pixi kit — `label` (optically centred text), `factoryArt` (the
    building/bin/token shapes, all colours passed in; the one piece that needs the combinator
    catalogue, `machineArt`, lives in the combinators plugin instead), `backdrop`, `Button`,
    `icons`, `Toasts`, `PlaybackBar`, `logo`, `overlay`, `text`, `theme`, and `Pixi` (the
    Application service).
  - `host/`: `Host` (stage, router, render loop), `HomeScene`, `OpenScene` (the generic pack
    card), the share codec (`share.ts`), the community registry, `perfProbe.ts`. Never names a
    plugin.
  - `game/`: the combinator game's own Effect services, shared by the combinators and editor
    plugins: `Levels`, `Progress`, `CustomLevels`, `GameEvents`, `Discovery`.
  - `plugins/`: combinators, editor, deck, office.
    - **combinators:** `manifest`, `plugin` (its port is `CombinatorsPort`), `GameContext` (the
      game's own window onto the host); `mechanics.ts` + `theaterSlide.ts` (the
      `combinators/theater` mechanic) and `Theater`/`TheaterSpec`/`TermRow`/`theaterPlayback`
      (the reduction theater modal, opened from a level or the book — `theaterPlayback` is its
      play/step state machine, pure and tested apart from the animation it triggers);
      `machineArt` (the one factory-art piece
      that needs the catalogue); and the game's scenes —
      `LevelScene`: state and mode;
      `BoardView`: the drawn floor;
      `BoardEditor`: pointer editing;
      `SimAnimator`: how simulation events look;
      `LevelTray`, `LevelComplete`, `floorGeometry`, `StickerPile`, `BookScene`, `MenuScene`,
      `archive`.
    - **editor:** `levelText` (the pure model, tested), `form` (the DOM), `plugin`.
    - **deck:** `Decks` (the `DeckLibrary` backend), `shelf` (the home screen's "your decks"
      row), `DeckScene` (navigation and keys) with `keyAction` (which key means which action, pure
      and tested), `DeckChrome`, `slideFrame`, `overlays`,
      `messages` (the presenter protocol), `render.ts` (the kind registry) plus `templates.ts`,
      `slides/` (one kind per file, plus `lineTimeline` and `highlight`), the slide editor on E
      and the presenter window on P.
    - **office:**
      - `OfficeSlide`: beats and controls;
      - `Room`, `ProgramStrip`, `Speech`;
      - `Performer` (the moving state and motions) and `perform` (per-command
        choreography);
      - `program` (the text format), `vm` (the interpreter), `layout`, and the art files
        (`roomArt`, `peopleArt`, `bubbleArt`, `commandArt`, `officePalette`).
- **`scripts/search.ts`:** recipe search, e.g. `pnpm search Ψ S,K,B,C,W,I 8` or
  `pnpm search "and: 0001" S,K,I,C 6`.
- **`scripts/drive.ts`:** headless Playwright play-tester. Actions use 1920×1080 design
  coordinates.
  - Env: `THROTTLE=4` (CPU), `LATENCY=80` (network), `VIDEO=<dir>` (record), `VW`/`VH`
    (viewport).
  - Dev hooks (`platform/devHooks.ts`): `lfDeck.goto(i, step)`, `lfApp`, and `lfFrames`
    (frames rendered).
- **Rendering is on demand** (`Host`): a frame is drawn while tweens run, while a scene with
  `tick` animates (override with `animating()`), after input, and on a 4 Hz heartbeat.
  `?perf` in the URL logs `[lf-perf]` frame stats.
- **Deploys:** `BASE=/sub/path/ pnpm build` for subpath deploys. `.github/workflows/pages.yml`
  deploys `apps/web/dist` to Pages on every push to main, and that site is public.

Deck keys: → / space / PageDown next · ← / PageUp back · N notes · O overview · F fullscreen ·
P presenter window · E slide editor · Esc home.

Commands: `pnpm dev`, `pnpm check` (typecheck + test + knip), `pnpm test`, `pnpm typecheck`,
`pnpm build`, `pnpm present`.

# Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.

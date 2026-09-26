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
5. **Packages are the information-hiding boundary.** `core` and `contracts` depend only on
   `effect` (no Pixi, no DOM). Anything that renders lives in `runtime`. Apps are thin shells.
   Import across packages by name (`@lambda-factori/core/Term.ts`) and relatively within one.
   Don't re-export another module's names; import them from where they live.
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

## Recipes

- **Add a core slide kind:**
  1. Add a `Schema.Struct` in `packages/contracts/src/Deck.ts` and list it in `Core`.
  2. `pnpm typecheck` now fails until you add a renderer entry in
     `packages/runtime/src/plugins/deck/render.ts` (`slideKinds`) and an editor template in
     `plugins/deck/templates.ts`.
  3. Write the renderer in `plugins/deck/slides/`. It returns a `SlideView`: `steps`,
     `setStep`, optional `tick`/`animating`.
  4. Add a slide to the mechanics tour deck, and a test if the kind has data invariants.
- **Add a plugin slide mechanic** (`<plugin>/<name>`): export a `Mechanic` from the plugin and
  register its loader in `packages/runtime/src/engine/mechanics.ts`. Validate its fields with
  its own schema, as `office/scene` does with `@lambda-factori/contracts/OfficeSpec.ts`.
- **Add a plugin:**
  1. Implement `Plugin` (`engine/Plugin.ts`).
  2. List a lazy `load` in `engine/registry.ts`.
  3. Its routes are `#/<id>/…`.
- **Add a level:** add it to `packages/core/src/data/levels.json`. Find the smallest recipe with
  `pnpm search <name> <atoms> <depth>`. Tests decode the pack.
- **Add or edit a deck:** put the JSON in `apps/web/public/decks/<id>.json` and list it in
  `index.json`. `Deck.test.ts` checks it. Quote sources verbatim.

## Map

Plugins (`packages/runtime/src/engine/registry.ts`):
- **`combinators`:** the combinator-logic factory game (start from S and K, derive the birds, up
  to APL/BQN trains and Church booleans). Routes: `#/combinators`, `/level/<id>`,
  `/book/<page>`, `/test/<id>` (playtest from the editor).
- **`editor`:** level creation mode: validate, find the smallest recipe, save, playtest,
  import/export.
- **`deck`:** slide decks as runtime data, in `apps/web/public/decks/<id>.json` and listed in
  its `index.json`. Routes: `#/deck/<id>/<n>`, `#/deck/<id>/presenter`.
  - Factory-style kinds:
    - `factory`: modules as buildings, with an x-ray step;
    - `decisions`: a Parnas change map, where `secretly` gems are unknown unknowns;
    - `line`: an assembly line with hidden-state gauges, a seekable timeline and its own
      playback bar.
  - Slides can move the deck's step with `ctx.syncStep`, and report `animating()` so
    render-on-demand knows when they need frames.
- **`office`:** a Human Resource Machine-style mechanic, the slide kind `office/scene`.
  - It runs an HRM-format program (INBOX/OUTBOX/COPYFROM/COPYTO/ADD/SUB/BUMP/JUMP/JUMPZ/JUMPN,
    with labels `a:`).
  - It also has presentation verbs: VISIT/PASS/WORK desks, SAY/THINK, BOSS, CLERK
    <desk> "…", HOLD/DROP, NOTE, and PAUSE as a build beat.
  - The VM is pure: `plugins/office/vm.ts`.
- **Third-party plugins:** `#/plugin/<url>` loads an ES module whose default export is a
  `Plugin`. Plugin slide kinds are namespaced (`<plugin>/<mechanic>`) and preloaded before a
  deck opens.

Sharing (no backend):
- `#/open/<deflate+base64url pack>` share links: S in a deck, or "copy share link" in the
  editor;
- `#/import/<url>` for hosted JSON packs;
- community registries: `apps/web/public/registry.json`, plus any registry URL added from the
  home screen.

Layout (a pnpm workspace organized like t3code; `pnpm-workspace.yaml` has a version catalog):
- **`apps/web`:** the browser app: `index.html`, `vite.config.ts`, `src/main.ts` (wires the
  Effect layers), and `public/` (decks, fonts, registry.json). This is what GitHub Pages serves.
- **`apps/mobile-capacitor`:** experiment. The web build as an iOS app (Capacitor 8, SPM).
  - `pnpm --filter @lambda-factori/mobile-capacitor sync`, then `build:sim`.
  - `LF_START="?perf#/deck/…"` opens a route with the frame-stats probe on.
- **`packages/core`:** pure logic (terms, reduction, trace, board with wire routing over
  `MinHeap`, sim, levels, recipe search) and `data/levels.json`.
- **`packages/contracts`:** the shared schemas, `Deck.ts` (`Slide`, `SlideOf`, `CoreKind`) and
  `OfficeSpec.ts`.
- **`packages/runtime`:** what every shell loads.
  - `engine/`: Host (stage, router, render loop), plugin contract, home screen, sharing,
    `devHooks.ts`, `perfProbe.ts`.
  - `render/`: shared Pixi pieces and the game's scenes.
    - Art and UI: `label` (optically centred text), `factoryArt`, `backdrop`, `archive`,
      `Button`, `icons`, `Toasts`, `effects`, and `PlaybackBar`.
    - The theater: `Theater` (the modal), `TermRow` (term layout and the rewrite animation),
      and `TheaterSpec` (what to show).
    - A level is split into:
      - `LevelScene`: state and mode;
      - `BoardView`: the drawn floor;
      - `BoardEditor`: pointer editing;
      - `SimAnimator`: how simulation events look;
      - `LevelTray`, `LevelComplete` and `floorGeometry`.
  - `game/`: Effect services: Levels, Progress, CustomLevels, Decks, GameEvents, Storage.
  - `plugins/`: combinators, editor, deck, office.
    - **editor:** `levelText` (the pure model, tested), `form` (the DOM), `plugin`.
    - **deck:**
      - `DeckScene`: navigation and keys;
      - `DeckChrome`, `slideFrame`, `overlays`, `messages` (the presenter protocol);
      - `render.ts`: the kind registry, plus `templates.ts`;
      - `slides/`: one kind per file, plus `lineTimeline` and `highlight`;
      - the slide editor on E and the presenter window on P.
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
  - Dev hooks (`engine/devHooks.ts`): `lfDeck.goto(i, step)`, `lfApp`, and `lfFrames`
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

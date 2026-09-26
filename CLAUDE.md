# λ factori

A framework for explaining ideas with moving parts, in Word Factori's visual language. The
host knows nothing about combinators or slides: everything is a plugin, lazily loaded and
addressed by a hash route (`#/<plugin>/<path…>`). All art is procedural Pixi Graphics; do not
add assets ripped from Word Factori.

Plugins (`src/engine/registry.ts`):
- `combinators` — the combinator-logic factory game (start from S and K, derive the birds, up to
  APL/BQN trains and Church booleans). Routes: `#/combinators`, `/level/<id>`, `/book/<page>`,
  `/test/<id>` (playtest from the editor).
- `editor` — level creation mode: validate, find smallest recipe, save, playtest, import/export.
- `deck` — slide decks as runtime data: `public/decks/<id>.json`, listed in
  `public/decks/index.json`. Routes: `#/deck/<id>/<n>`, `#/deck/<id>/presenter`.
  Factory-style slide kinds: `factory` (modules as buildings, x-ray step), `decisions` (Parnas
  change map; `secretly` gems are unknown unknowns revealed when a change bites), `line`
  (assembly line: items ride a belt through machines; hidden state gauges open on an `xray` run).
  `line` is a timeline (pure function of run + time) with its own playback bar; slides can move
  the deck's step with `ctx.syncStep` and report `animating()` for render-on-demand.
- `office` — a Human Resource Machine-style mechanic contributed to decks as the slide kind
  `office/scene`: a worker runs an HRM-format program (INBOX/OUTBOX/COPYFROM/COPYTO/ADD/SUB/
  BUMP/JUMP/JUMPZ/JUMPN, labels `a:`) plus presentation verbs (VISIT/PASS/WORK desks, SAY/THINK,
  BOSS, CLERK <desk> "…", HOLD/DROP, NOTE, PAUSE = build beat). Pure VM in `src/plugins/office/vm.ts`.
- `#/plugin/<url>` loads a third-party ES module whose default export is a `Plugin`.
- Plugin slide mechanics use namespaced kinds (`<plugin>/<mechanic>`), are registered in
  `src/engine/mechanics.ts`, and are preloaded before a deck opens.

Sharing (no backend): `#/open/<deflate+base64url pack>` share links (S in a deck, "copy share
link" in the editor), `#/import/<url>` for hosted JSON packs, and community registries
(`public/registry.json` plus any registry URL added from the home screen).

Layout:
- `src/core` — pure logic (terms, reduction, trace, board, sim, levels, recipe search). No Pixi/DOM.
- `src/game` — Effect services: Levels, Progress, CustomLevels, Decks, GameEvents, Storage.
- `src/engine` — Host (stage, router, plugin loading), plugin contract, home screen.
- `src/render` — shared Pixi art, UI, tweens, the reduction Theater, and the game's scenes.
- `src/plugins/deck` — deck schema (`Deck.ts`), `DeckScene`, slide mechanics in `slides/`, the
  in-app slide editor (E) and presenter window (P).
- `scripts/search.ts` — recipe search (`pnpm search Ψ S,K,B,C,W,I 8`, `pnpm search "and: 0001" S,K,I,C 6`).
- `scripts/drive.ts` — headless Playwright play-tester; actions use 1920×1080 design coords.
  In dev, `globalThis.lfDeck.goto(i, step)` jumps a deck to any slide/build step.
  Env: `THROTTLE=4` (CPU), `LATENCY=80` (network), `VIDEO=<dir>` (record), `VW`/`VH` (viewport).
- Rendering is on demand (`Host`): frames are drawn while tweens run, while a scene with `tick`
  animates (override with `animating()`), after input, and as a 4 Hz heartbeat.
- `BASE=/sub/path/ pnpm build` for subpath deploys; `.github/workflows/pages.yml` deploys to Pages.

Deck keys: → / space / PageDown next · ← / PageUp back · N notes · O overview · F fullscreen ·
P presenter window · E slide editor · Esc home.

Commands: `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm build`.

# Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.

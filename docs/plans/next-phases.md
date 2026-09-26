# Plan: after the dependency rule (phases 6–10)

Builds on `docs/plans/dependency-rule.md` (phases 1–5, PR #4). The layers are in place and
enforced. These phases make the kernel **usable by someone who isn't us** (another app, a
third-party plugin, a new mechanic), and move the remaining logic that's trapped in Pixi
classes into pure, tested functions. Same philosophy: deep modules, information hiding, the
compiler or a test finds the places, and effects stay at the edges.

Every phase is one commit, `pnpm check` exits 0, and behaviour is preserved unless the phase
says otherwise. The phases are ordered by value per token: cheap, high-leverage ones first.

## Phase 6: pure host logic, with tests
`host/Host.ts` mixes three decisions with Pixi plumbing: how a hash becomes a route, how a
slide kind resolves to a plugin, and which plugin owns a pack type. None of these needs Pixi.
- Add `host/routes.ts`, a pure module. `parseRoute(hash)` returns a tagged union (`Home`,
  `Open{payload}`, `Import{url}`, `ThirdParty{url, path}`, `Plugin{id, path}`), and there are
  pure resolvers for mechanic kinds (`"<id>/<name>"`, with the same readable errors as today)
  and for pack owners. `Host` does an exhaustive `switch` over the union.
- Fix, with a test: a third-party plugin loaded by `#/plugin/<url>` must not be able to shadow
  a built-in id (today `this.plugins.set(mod.default.id, …)` overwrites it). Refuse with a
  toast.
- Tests in `host/routes.test.ts` cover every route shape, including URL-encoded segments and
  empty segments.

## Phase 7: mechanics as first-class slide kinds
Today each plugin repeats the same decode-then-throw block (`office/mechanics.ts` and
`combinators/mechanics.ts`). The slide editor's insert menu only offers core kinds, and it
hardcodes the text "plus plugin kinds such as office/scene".
- Add a kernel helper that builds a `Mechanic` from `(schema, render, { fullBleed? })`, so
  validation and the error format live in one place. `kernel/` may import `effect`, but still
  nothing else. Both plugins use it.
- Add `Mechanic.template?`: a minimal valid slide. The deck's slide editor lists the core
  templates plus the templates of every mechanic the current deck has resolved (pass the map
  it already has), and derives its help text from them.
- Add a test per plugin that every mechanic's template decodes with that mechanic's schema
  (like `Deck.test.ts` does for core templates).

## Phase 8: the office VM as a pure package
The HRM interpreter (`plugins/office/vm.ts`, `program.ts`) is pure logic living in the
runtime, which goes against CLAUDE.md rule 4.
- Move it, with its tests, to `packages/office` (`@lambda-factori/office`, depending only on
  `effect` if it needs anything). Update importers, knip, `vitest.config.ts` includes, and the
  runtime's `package.json` dependency.
- `architecture.test.ts`: generalise rule 9 from a hardcoded `core`/`contracts` pair to "every
  package except `runtime` is pure: it imports only `effect`, itself, and `contracts`", derived
  from the `packages/` directory. That way a new pure package is covered automatically,
  without editing a list.

## Phase 9: an SDK for third-party plugins, with a real example
`#/plugin/<url>` exists, but a third-party author can't type against anything, and nothing
proves the contract works from outside the repo.
- Split `runtime/src/kernel/` into its own package, `@lambda-factori/kernel`. It holds only
  types and dependency-free helpers (tween, the mechanic helper); its sole dependencies are
  `pixi.js` types and `effect`. The runtime depends on it. pnpm's strict `node_modules` now also
  enforces rule 1 at compile time. The architecture test maps the new package to the `kernel`
  layer.
- Add `examples/hello-plugin/`: a tiny plugin built against `@lambda-factori/kernel`. It has
  one route that draws a scene and one mechanic (`hello/counter`). It builds to a single ES
  module with Vite library mode, as a workspace package that isn't part of the app bundle. Add
  a drive check that loads it through `#/plugin/<url>` from the dev server, opens its route,
  and renders its mechanic inside a deck.
- Document the SDK in the README ("Write a plugin"): the manifest, `open`, `mechanics`,
  `packTypes`/`previewPack`, `shelf`, and what a third-party plugin cannot do.

## Phase 10: a deep-module audit (bounded)
Audit only by reading **headers and exported signatures**. Candidates: any runtime file whose
header needs "and" between unrelated jobs, or whose class has private state serving two
decisions (likely `deck/DeckScene.ts`: navigation + presenter channel + keys;
`combinators/LevelScene.ts`; `combinators/Theater.ts`).
- Split **at most three** modules. Each split must hide a named decision (write it in the new
  file's header). No pass-throughs.
- Report the candidates you rejected and why.

## Out of scope
- Splitting `ui/` into a package. Do it only after phase 9 shows third-party authors need it.
- A second composition root (e.g. mobile choosing a different plugin set).

## Budget rules for the implementing agents
These keep each phase inside a session budget. Earlier phases used 230k–420k tokens; the
target is ≤150k per phase.
- Read headers and signatures first; open a body only when you'll change it (CLAUDE.md rule 1).
  Use `sed -n` ranges or `grep -n`, not whole-file dumps of large files.
- Run `pnpm check >/tmp/lf-check.log 2>&1; echo EXIT=$?; tail -40 /tmp/lf-check.log`. Don't run the full check after
  every edit: use `pnpm typecheck` or a single `npx vitest run <file>` while iterating, and the
  full check once at the end.
- Screenshots only where a phase changes what's on screen, at most four, at the default size.
- Report in 250 words or fewer.

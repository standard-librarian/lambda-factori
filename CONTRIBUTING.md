# Contributing to λ factori

Thanks for helping. New levels, decks, slide mechanics and plugins are all welcome, and so are
bug reports with a link to the route where things go wrong.

## Setup

You need Node 24 or later (see `.nvmrc`) and pnpm 10 (`corepack enable` picks the version pinned in
`package.json`).

```sh
pnpm install
pnpm dev      # http://localhost:5173
pnpm check    # typecheck + tests + knip: must pass before you open a PR
```

To drive the running app headless and look at screenshots, use `pnpm drive '[{"shot":"home"}]'`
(run `npx playwright install chromium` once first).

## How the code is organized

Read [CLAUDE.md](CLAUDE.md) before your first change. It's short, and it explains:
- **the dependency rule:** which layer may import which. `architecture.test.ts` enforces it,
  so a forbidden import fails `pnpm check`;
- **the design rules we review against:** a header comment on every file, deep modules, pure
  logic with tests, and one name per concept;
- **recipes** for the common changes: a slide kind, a plugin mechanic, a plugin, a level or a
  deck.

## Pull requests

`main` is protected, and every push to it goes live at https://mdht.me/lambda-factori/. So:

1. Branch from `main`. Keep one change per PR.
2. Run `pnpm check`. For anything visual, attach a screenshot or a short clip.
3. Open the PR. CI must pass (the `check` job) and every review thread must be resolved before
   it can merge. Force-pushes to `main` and deleting it are blocked.
4. Commit messages say what changed and why, in plain sentences. Mention any small cleanups you
   made on the way (CLAUDE.md, "Incidental cleanups").

## Content

- **Levels** go in `packages/core/src/data/levels.json`. `pnpm search <name> <atoms> <depth>`
  finds the smallest recipe.
- **Decks** go in `apps/web/public/decks/<id>.json`, listed in `index.json`. Quote sources word
  for word and credit them. `Deck.test.ts` checks every deck.
- **Art** is procedural Pixi `Graphics`. Please don't add assets taken from Word Factori, Human
  Resource Machine or any other game.

By contributing, you agree that your contribution is licensed under the MIT License of this
repository.

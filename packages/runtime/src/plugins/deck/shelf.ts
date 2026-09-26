/**
 * The home screen's "your decks" shelf, from `DeckLibrary.list()` alone — no
 * Pixi, so `apps/web/src/plugins.ts` can wire this in eagerly for the home
 * screen while the deck plugin's own chunk (`plugin.ts`, `DeckScene`, …)
 * still loads lazily only when a deck route opens.
 */
import type { DeckMeta } from "@lambda-factori/contracts/Deck.ts"
import type { HomeShelf } from "@lambda-factori/kernel/Plugin.ts"
import { manifest } from "./manifest.ts"

export const deckShelf = (list: () => Promise<ReadonlyArray<DeckMeta>>): HomeShelf => ({
  title: "your decks",
  cards: () =>
    list().then((decks) =>
      decks.map((d) => ({
        title: d.title,
        subtitle: d.subtitle,
        color: manifest.color,
        shade: manifest.shade,
        tag: `deck · ${d.slides} slides${d.edited ? " · edited" : ""}`,
        route: `deck/${d.id}`
      }))
    )
})

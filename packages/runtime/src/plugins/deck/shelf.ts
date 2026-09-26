/**
 * Cards for the home screen's "your decks" shelf, from `DeckLibrary.list()`
 * alone — no Pixi, so `apps/web/src/plugins.ts` can wire this in eagerly for
 * the home screen while the deck plugin's own chunk (`plugin.ts`,
 * `DeckScene`, …) still loads lazily only when a deck route opens.
 */
import type { DeckMeta } from "@lambda-factori/contracts/Deck.ts"
import type { ShelfCard } from "../../kernel/Plugin.ts"
import { manifest } from "./manifest.ts"

export const deckShelf = (decks: ReadonlyArray<DeckMeta>): ReadonlyArray<ShelfCard> =>
  decks.map((d) => ({
    title: d.title,
    subtitle: d.subtitle,
    color: manifest.color,
    shade: manifest.shade,
    tag: `deck · ${d.slides} slides${d.edited ? " · edited" : ""}`,
    route: `deck/${d.id}`
  }))

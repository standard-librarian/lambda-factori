/**
 * The `deck` plugin (`#/deck/<id>/<n>`, `#/deck/<id>/presenter`): plays a
 * deck of slides. Its port (`DeckLibrary`) is where decks come from — served
 * JSON plus anything saved or imported in this browser.
 */
import type { Deck } from "@lambda-factori/contracts/Deck.ts"
import type { Plugin } from "../../kernel/Plugin.ts"
import { DeckScene } from "./DeckScene.ts"
import { manifest } from "./manifest.ts"
import { openPresenter } from "./presenter.ts"

export interface DeckLibrary {
  load(id: string): Promise<Deck>
  save(deck: Deck): Promise<void>
  reset(id: string): Promise<void>
}

let presenting = false

export const plugin = (library: DeckLibrary): Plugin => ({
  ...manifest,
  async open(host, path) {
    const [id, where] = path
    if (!id) return host.home()
    const deck = await library.load(id)
    const mechanics = await host.mechanics(deck.slides.map((s) => s.kind))
    if (where === "presenter") {
      // The presenter window replaces the canvas with its own DOM view.
      if (!presenting) openPresenter(deck)
      presenting = true
      return
    }
    const n = Number.parseInt(where ?? "1", 10)
    host.show(() => new DeckScene({ host, library, mechanics, deck, index: Number.isNaN(n) ? 0 : n - 1 }))
  }
})

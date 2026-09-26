import type { Plugin } from "../../kernel/Plugin.ts"
import { preloadMechanics } from "../../engine/mechanics.ts"
import { DeckScene } from "./DeckScene.ts"
import { openPresenter } from "./presenter.ts"

let presenting = false

export const plugin: Plugin = {
  id: "deck",
  title: "slide decks",
  subtitle: "explain ideas with moving parts",
  kind: "deck",
  color: 0x4cc887,
  shade: 0x399871,
  async open(host, path) {
    const [id, where] = path
    if (!id) return host.home()
    const deck = await host.services.loadDeck(id)
    await preloadMechanics(deck.slides.map((s) => s.kind))
    if (where === "presenter") {
      // The presenter window replaces the canvas with its own DOM view.
      if (!presenting) openPresenter(deck)
      presenting = true
      return
    }
    const n = Number.parseInt(where ?? "1", 10)
    host.show(() => new DeckScene(host, deck, Number.isNaN(n) ? 0 : n - 1))
  }
}

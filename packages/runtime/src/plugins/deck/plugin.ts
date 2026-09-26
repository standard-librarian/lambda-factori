/**
 * The `deck` plugin (`#/deck/<id>/<n>`, `#/deck/<id>/presenter`): plays a
 * deck of slides. Its port (`DeckLibrary`) is where decks come from — served
 * JSON plus anything saved or imported in this browser. It also owns
 * `packTypes: ["deck"]`: a shared deck is decoded and described here
 * (`previewPack`), not by the host.
 */
import { Exit, Schema } from "effect"
import { Deck, type DeckMeta } from "@lambda-factori/contracts/Deck.ts"
import type { HostApi, PackPreview, Plugin } from "@lambda-factori/kernel/Plugin.ts"
import { DeckScene } from "./DeckScene.ts"
import { manifest } from "./manifest.ts"
import { openPresenter } from "./presenter.ts"

export interface DeckLibrary {
  list(): Promise<ReadonlyArray<DeckMeta>>
  load(id: string): Promise<Deck>
  save(deck: Deck): Promise<void>
  reset(id: string): Promise<void>
}

let presenting = false

const decodeDeck = Schema.decodeUnknownExit(Deck)

/** Decode a shared deck and describe it; "remix a copy" clones it under a fresh id so it
 * doesn't collide with the original if both are ever open in the same browser. */
const previewDeckPack = (library: DeckLibrary, data: unknown, host: HostApi): PackPreview => {
  const exit = decodeDeck(data)
  if (Exit.isFailure(exit)) throw new Error(String(exit.cause))
  const deck = exit.value
  return {
    title: deck.title,
    subtitle: deck.subtitle ?? "",
    meta: `a deck · ${deck.slides.length} slides${deck.author ? ` · by ${deck.author}` : ""}`,
    actions: [
      { text: "play now", tone: "primary", run: () => void library.save(deck).then(() => host.navigate(`deck/${encodeURIComponent(deck.id)}/1`)) },
      { text: "remix a copy", tone: "secondary", run: () => {
        const copy = new Deck({ ...deck, id: `${deck.id}-remix-${Math.random().toString(36).slice(2, 6)}`, title: `${deck.title} (remix)` })
        void library.save(copy).then(() => {
          host.navigate(`deck/${encodeURIComponent(copy.id)}/1`)
          host.toast("your copy — press E to edit any slide")
        })
      } }
    ]
  }
}

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
  },
  previewPack: (_type, data, host) => previewDeckPack(library, data, host)
})

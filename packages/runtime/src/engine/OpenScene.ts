import { Exit, Schema } from "effect"
import { Container } from "pixi.js"
import { Level } from "@lambda-factori/core/Level.ts"
import { Deck } from "@lambda-factori/contracts/Deck.ts"
import { label, paperArt, skylineArt } from "../render/art.ts"
import type { Scene } from "../render/Scene.ts"
import { DESIGN_H, DESIGN_W, palette } from "../render/theme.ts"
import { ease, lerp } from "../render/tween.ts"
import { Button, icons } from "../render/ui.ts"
import { para } from "../plugins/deck/slides/common.ts"
import type { HostApi } from "./Plugin.ts"
import { decodePack } from "./share.ts"

const decodeDeck = Schema.decodeUnknownExit(Deck)
const isDeck = (j: unknown) => typeof j === "object" && j !== null && "slides" in j
const decodeLevels = Schema.decodeUnknownExit(Schema.Array(Level))

/** The landing screen for a shared link: what it is, who made it, and what to do with it. */
export class OpenScene implements Scene {
  readonly view = new Container()
  private readonly host: HostApi

  constructor(host: HostApi, payload: string, from: "link" | "url" = "link") {
    this.host = host
    this.view.addChild(paperArt(DESIGN_W, DESIGN_H), skylineArt(DESIGN_W, DESIGN_H - 10))
    const card = new Container()
    card.position.set(DESIGN_W / 2, DESIGN_H / 2)
    this.view.addChild(card)
    const status = label("unpacking…", 36, palette.inkSoft, "600")
    card.addChild(status)
    const load = from === "url"
      ? fetch(payload).then((r) => r.json()).then((j: unknown) => ({ type: isDeck(j) ? ("deck" as const) : ("levels" as const), data: j }))
      : decodePack(payload)
    void load.then(
      (pack) => (this.view.destroyed ? undefined : this.present(card, status, pack.type, pack.data)),
      (e: unknown) => status.text = `this link is broken: ${e instanceof Error ? e.message : String(e)}`
    )
  }

  private present(card: Container, status: Container, type: "deck" | "levels", data: unknown) {
    status.destroy()
    const shared = label("shared with you", 26, palette.red, "700")
    shared.y = -250
    card.addChild(shared)
    const actions: Array<{ text: string; color: number; shade: number; run: () => void }> = []
    if (type === "deck") {
      const exit = decodeDeck(data)
      if (Exit.isFailure(exit)) return this.fail(card, String(exit.cause))
      const deck = exit.value
      this.describe(card, deck.title, deck.subtitle ?? "", `a deck · ${deck.slides.length} slides${deck.author ? ` · by ${deck.author}` : ""}`)
      actions.push(
        { text: "play now", color: palette.red, shade: palette.redShade, run: () => void this.keep(deck).then(() => this.host.navigate(`deck/${encodeURIComponent(deck.id)}/1`)) },
        { text: "remix a copy", color: palette.blue, shade: 0x1f4c85, run: () => {
          const copy = new Deck({ ...deck, id: `${deck.id}-remix-${Math.random().toString(36).slice(2, 6)}`, title: `${deck.title} (remix)` })
          void this.keep(copy).then(() => {
            this.host.navigate(`deck/${encodeURIComponent(copy.id)}/1`)
            this.host.toast("your copy — press E to edit any slide")
          })
        } }
      )
    } else {
      const exit = decodeLevels(data)
      if (Exit.isFailure(exit)) return this.fail(card, String(exit.cause))
      const levels = exit.value
      this.describe(card, levels.length === 1 ? levels[0]!.title : `${levels.length} levels`, levels[0]?.blurb ?? "", "a level pack")
      actions.push(
        { text: "play now", color: palette.red, shade: palette.redShade, run: () => void this.keepLevels(levels).then(() => this.host.navigate(`combinators/level/${encodeURIComponent(levels[0]!.id)}`)) },
        { text: "open in editor", color: palette.blue, shade: 0x1f4c85, run: () => void this.keepLevels(levels).then(() => this.host.navigate(`editor/${encodeURIComponent(levels[0]!.id)}`)) }
      )
    }
    actions.push({ text: "home", color: palette.inkSoft, shade: palette.ink, run: () => this.host.home() })
    actions.forEach((a, i) => {
      const b = new Button({ width: 300, height: 76, color: a.color, shade: a.shade, text: a.text, fontSize: 28, onTap: a.run }, this.host.tweens)
      b.position.set((i - (actions.length - 1) / 2) * 330, 200)
      card.addChild(b)
    })
    card.scale.set(0.9)
    card.alpha = 0
    this.host.tweens.add({ duration: 420, ease: ease.outBack, update: (k) => {
      card.alpha = Math.min(1, k * 2)
      card.scale.set(lerp(0.9, 1, k))
    } })
  }

  private describe(card: Container, title: string, subtitle: string, meta: string) {
    const t = para(title, 76, palette.ink, 1500, "700", "center")
    t.y = -190
    const s = para(subtitle, 32, palette.inkSoft, 1400, "500", "center")
    s.y = t.y + t.height + 20
    const m = label(meta, 26, palette.blue, "700")
    m.y = 110
    card.addChild(t, s, m)
  }

  private fail(card: Container, why: string) {
    const t = para(`this pack doesn't match the format:\n${why.slice(0, 400)}`, 24, palette.bad, 1400, "500", "center")
    card.addChild(t)
    const b = new Button({ width: 220, height: 70, color: palette.inkSoft, shade: palette.ink, text: "home", icon: icons.back, onTap: () => this.host.home() }, this.host.tweens)
    b.y = 260
    card.addChild(b)
  }

  private keep(deck: Deck) {
    return this.host.services.saveDeck(deck)
  }

  private async keepLevels(levels: ReadonlyArray<Level>) {
    for (const l of levels) await this.host.services.saveCustomLevel(new Level({ ...l, world: "custom" }))
  }

  destroy() {
    this.view.destroy({ children: true })
  }
}

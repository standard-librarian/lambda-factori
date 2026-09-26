/**
 * The landing screen for a shared link (`#/open/<payload>`) or a hosted pack
 * (`#/import/<url>`): a generic pack card. The host decodes only the share
 * envelope (`{ type, data }`); it finds the plugin entry whose `packTypes`
 * includes `type`, loads it, and asks its `previewPack` for what to show and
 * what "play now" etc. do — the host never decodes a deck or a level itself.
 * `entries` is the host's own plugin table, handed in by `Host` (it isn't
 * part of `HostApi`: a plugin never sees it).
 */
import { Container } from "pixi.js"
import { label } from "../render/label.ts"
import { para } from "../render/text.ts"
import { paperArt, skylineArt } from "../render/backdrop.ts"
import type { HostApi, PackPreview, PackPreviewAction, PluginEntry } from "../kernel/Plugin.ts"
import type { Scene } from "../kernel/Scene.ts"
import { DESIGN_H, DESIGN_W, palette } from "../render/theme.ts"
import { ease, lerp } from "../kernel/tween.ts"
import { Button } from "../render/Button.ts"
import { icons } from "../render/icons.ts"
import { decodePack } from "./share.ts"

/** A bare (non-enveloped) JSON pack, as served by `#/import/<url>` for a hosted file: a deck has
 * `slides`, anything else is a level pack. An enveloped `#/open/<payload>` pack always carries
 * its own `type`, so this sniff only covers plain files that predate the envelope. */
const sniffType = (j: unknown): string => (typeof j === "object" && j !== null && "slides" in j ? "deck" : "levels")

const TONE: Record<PackPreviewAction["tone"], { color: number; shade: number }> = {
  primary: { color: palette.red, shade: palette.redShade },
  secondary: { color: palette.blue, shade: 0x1f4c85 }
}

export class OpenScene implements Scene {
  readonly view = new Container()
  private readonly host: HostApi
  private readonly entries: ReadonlyArray<PluginEntry>

  constructor(host: HostApi, entries: ReadonlyArray<PluginEntry>, payload: string, from: "link" | "url" = "link") {
    this.host = host
    this.entries = entries
    this.view.addChild(paperArt(DESIGN_W, DESIGN_H), skylineArt(DESIGN_W, DESIGN_H - 10))
    const card = new Container()
    card.position.set(DESIGN_W / 2, DESIGN_H / 2)
    this.view.addChild(card)
    const status = label("unpacking…", 36, palette.inkSoft, "600")
    card.addChild(status)
    const load = from === "url"
      ? fetch(payload).then((r) => r.json()).then((j: unknown) => ({ type: sniffType(j), data: j }))
      : decodePack(payload)
    void load.then(
      (pack) => (this.view.destroyed ? undefined : this.resolve(card, status, pack.type, pack.data)),
      (e: unknown) => status.text = `this link is broken: ${e instanceof Error ? e.message : String(e)}`
    )
  }

  /** Find who owns `type`, load them, and ask for a preview — the one place bad data (an
   * unknown type, or a plugin's `previewPack` throwing) turns into the "doesn't match" card. */
  private resolve(card: Container, status: Container, type: string, data: unknown) {
    status.destroy()
    const owner = this.entries.find((e) => e.packTypes?.includes(type))
    if (!owner) return this.fail(card, `no plugin recognizes pack type “${type}”`)
    void owner.load().then(
      (plugin) => {
        if (this.view.destroyed) return
        if (!plugin.previewPack) return this.fail(card, `“${owner.title}” can't preview this pack`)
        try {
          this.present(card, plugin.previewPack(type, data, this.host))
        } catch (e) {
          this.fail(card, e instanceof Error ? e.message : String(e))
        }
      },
      (e: unknown) => (this.view.destroyed ? undefined : this.fail(card, e instanceof Error ? e.message : String(e)))
    )
  }

  private present(card: Container, preview: PackPreview) {
    const shared = label("shared with you", 26, palette.red, "700")
    shared.y = -250
    card.addChild(shared)
    this.describe(card, preview.title, preview.subtitle, preview.meta)
    const buttons = [
      ...preview.actions.map((a) => ({ text: a.text, ...TONE[a.tone], run: a.run })),
      { text: "home", color: palette.inkSoft, shade: palette.ink, run: () => this.host.home() }
    ]
    buttons.forEach((a, i) => {
      const b = new Button({ width: 300, height: 76, color: a.color, shade: a.shade, text: a.text, fontSize: 28, onTap: a.run }, this.host.tweens)
      b.position.set((i - (buttons.length - 1) / 2) * 330, 200)
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

  destroy() {
    this.view.destroy({ children: true })
  }
}

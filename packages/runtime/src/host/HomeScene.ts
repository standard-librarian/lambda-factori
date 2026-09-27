/**
 * The launcher: a card for every plugin, a shelf row for each entry that
 * lends the home screen one (e.g. the deck plugin's own decks), the
 * community registry, and the factory decor. Knows only the generic
 * `PluginEntry`/`ShelfCard` shape and the community registry format — never
 * a concrete plugin's data. `entries` is the host's own plugin table, handed
 * in by `Host` (it isn't part of `HostApi`: a plugin never sees it).
 */
import { Container, Graphics, Rectangle } from "pixi.js"
import type { HostApi, PluginEntry, ShelfCard } from "@lambda-factori/kernel/Plugin.ts"
import type { Scene } from "@lambda-factori/kernel/Scene.ts"
import { label } from "../ui/label.ts"
import { paperArt, skylineArt } from "../ui/backdrop.ts"
import { sourceArt, applyArt, W } from "../ui/factoryArt.ts"
import { logo } from "../ui/logo.ts"
import { DESIGN_H, DESIGN_W, palette } from "../ui/theme.ts"
import { ease, lerp } from "@lambda-factori/kernel/tween.ts"
import { addRegistry, loadRegistries } from "./registry-community.ts"

/** Row `y`s, top to bottom: one per entry with a shelf (in entry order), then community, then
 * tools — today that's the deck's shelf at 270, community at 530, tools at 790. */
const ROW_TOP = 270
const ROW_GAP = 260

export class HomeScene implements Scene {
  readonly view = new Container()
  private readonly host: HostApi
  private readonly cards = new Container()
  private time = 0
  private readonly decor: Array<Container> = []

  constructor(host: HostApi, entries: ReadonlyArray<PluginEntry>) {
    this.host = host
    this.view.addChild(paperArt(DESIGN_W, DESIGN_H), skylineArt(DESIGN_W, DESIGN_H - 10))
    const l = logo()
    l.scale.set(1.15)
    l.position.set(DESIGN_W / 2, 110)
    const tag = label("study it, then make it playable · share your talks and notes as levels", 28, palette.inkSoft, "500")
    tag.position.set(DESIGN_W / 2, 200)
    this.view.addChild(l, tag)

    // A couple of idle factories for character.
    const s = sourceArt("S", 0x4f56b8, 0x3a3f8f)
    s.root.position.set(190, 110)
    const a = applyArt()
    a.root.position.set(DESIGN_W - 190 - W, 110)
    this.view.addChild(s.root, a.root)
    this.decor.push(s.icon, a.icon)
    this.view.addChild(this.cards)

    let row = 0
    for (const entry of entries) {
      if (!entry.shelf) continue
      const y = ROW_TOP + ROW_GAP * row++
      const shelf = entry.shelf
      void shelf.cards().then((cards) => {
        if (this.view.destroyed) return
        this.layoutRow(shelf.title, cards, y)
      })
    }

    const communityY = ROW_TOP + ROW_GAP * row++
    void loadRegistries().then((entries) => {
      if (this.view.destroyed) return
      this.layoutRow("community", entries.map((e) => ({
        title: e.title,
        subtitle: `${e.author ? `by ${e.author} · ` : ""}${e.subtitle ?? ""}`,
        color: e.kind === "plugin" ? 0xac1b2b : 0x306db5,
        shade: e.kind === "plugin" ? 0x73000b : 0x1f4c85,
        tag: `${e.kind} · ${e.source}`,
        route: e.route ?? (e.url ? `import/${encodeURIComponent(e.url)}` : "")
      })), communityY)
    })

    const toolsY = ROW_TOP + ROW_GAP * row++
    const tools: Array<ShelfCard> = [
      // Library plugins (e.g. office) only lend the deck a mechanic; they have no card of their own.
      ...entries.filter((b) => b.kind !== "deck" && b.kind !== "library").map<ShelfCard>((b) => ({
        title: b.title, subtitle: b.subtitle, color: b.color, shade: b.shade, tag: `${b.kind} · plugin`, route: b.id
      })),
      { title: "add a registry", subtitle: "follow someone's shared decks and levels by URL", color: palette.inkSoft, shade: palette.ink, tag: "community", route: "" }
    ]
    this.layoutRow("plugins & tools", tools, toolsY)
  }

  private layoutRow(heading: string, specs: ReadonlyArray<ShelfCard>, y: number) {
    const h = label(heading, 30, palette.ink, "700", "left")
    h.position.set(160, y)
    this.cards.addChild(h)
    specs.slice(0, 4).forEach((spec, i) => {
      const c = this.card(spec)
      const x = 160 + i * 410
      c.position.set(x, y + 40)
      c.alpha = 0
      this.cards.addChild(c)
      this.host.tweens.add({ delay: i * 70, duration: 420, ease: ease.outBack, update: (k) => {
        c.alpha = Math.min(1, k * 2)
        c.y = lerp(y + 80, y + 40, k)
      } })
    })
  }

  private card(spec: ShelfCard) {
    const w = 390
    const h = 180
    const c = new Container()
    const face = new Container()
    face.addChild(
      new Graphics().roundRect(0, 8, w, h, 26).fill(spec.shade).roundRect(0, 0, w, h, 26).fill(spec.color),
      new Graphics().roundRect(18, 18, w - 36, h - 36, 18).fill({ color: palette.white, alpha: 0.1 })
    )
    const tag = label(spec.tag, 18, palette.white, "600", "left")
    tag.alpha = 0.85
    tag.position.set(30, 40)
    const title = label(spec.title, 32, palette.white, "700", "left")
    title.position.set(30, 88)
    if (title.width > w - 60) title.scale.set((w - 60) / title.width)
    const sub = label(spec.subtitle.length > 60 ? `${spec.subtitle.slice(0, 58)}…` : spec.subtitle, 18, palette.white, "500", "left")
    sub.alpha = 0.9
    sub.position.set(30, 134)
    if (sub.width > w - 60) sub.scale.set((w - 60) / sub.width)
    face.addChild(tag, title, sub)
    c.addChild(face)
    c.eventMode = "static"
    c.cursor = "pointer"
    c.hitArea = new Rectangle(0, 0, w, h + 8)
    c.interactiveChildren = false
    const lift = (to: number) => {
      this.host.tweens.cancel(face)
      const from = face.y
      this.host.tweens.add({ owner: face, duration: 110, update: (k) => (face.y = lerp(from, to, k)) })
    }
    c.on("pointerover", () => lift(-4))
    c.on("pointerout", () => lift(0))
    c.on("pointerup", () => {
      if (spec.route) return this.host.navigate(spec.route)
      const url = window.prompt("Registry URL (a JSON file listing decks, levels and plugins):")
      if (url) {
        addRegistry(url)
        this.host.toast("registry added")
        this.host.navigate("")
      }
    })
    return c
  }

  tick(dt: number) {
    this.time += dt
    this.decor.forEach((d, i) => (d.y = (i === 0 ? -20 : 2) + Math.sin(this.time / 420 + i) * 3))
  }

  destroy() {
    this.view.destroy({ children: true })
  }
}

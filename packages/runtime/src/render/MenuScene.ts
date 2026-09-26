import { Container, Graphics, Rectangle } from "pixi.js"
import { byName } from "@lambda-factori/core/Catalogue.ts"
import { label } from "./label.ts"
import { paperArt, skylineArt } from "./backdrop.ts"
import { stickerArt } from "./factoryArt.ts"
import type { GameContext, Scene } from "./Scene.ts"
import { DESIGN_H, DESIGN_W, palette } from "./theme.ts"
import { ease, lerp } from "./tween.ts"
import { Button } from "./Button.ts"
import { icons } from "./icons.ts"

export const logo = () => {
  const c = new Container()
  const t = label("λ factori", 76, palette.red, "700")
  t.style.stroke = { color: palette.white, width: 12, join: "round" }
  t.style.dropShadow = { color: palette.redShade, alpha: 0.25, blur: 0, distance: 5, angle: Math.PI / 2 }
  c.addChild(t)
  return c
}

const PER_ROW = 8
const CARD_W = 146
const CARD_H = 104
const CARD_DX = 156
const CARD_DY = 116

export class MenuScene implements Scene {
  readonly view = new Container()
  private readonly ctx: GameContext
  private readonly bobbers: Array<Container> = []

  constructor(ctx: GameContext) {
    this.ctx = ctx
    const save = ctx.progress()
    this.view.addChild(paperArt(DESIGN_W, DESIGN_H), skylineArt(DESIGN_W, DESIGN_H - 10))

    // Left panel ------------------------------------------------------------
    const side = new Container()
    side.addChild(new Graphics().rect(0, 0, 560, DESIGN_H).fill(palette.tray).rect(554, 0, 6, DESIGN_H).fill(palette.trayShade))
    const l = logo()
    l.position.set(280, 110)
    side.addChild(l)
    const sub = label("combinatory logic, one factory at a time", 21, palette.inkSoft, "500")
    sub.position.set(280, 178)
    side.addChild(sub)

    const firstOpen = ctx.pack.levels.find((lv) => !save.completed[lv.id]) ?? ctx.pack.levels[0]!
    const play = new Button({
      width: 440,
      height: 120,
      color: palette.red,
      shade: palette.redShade,
      text: "play",
      fontSize: 52,
      icon: icons.play,
      onTap: () => ctx.play(firstOpen.id)
    }, ctx.tweens)
    play.position.set(280, 330)
    const upNext = label(`up next · ${firstOpen.title}`, 20, palette.inkSoft, "500")
    upNext.position.set(280, 410)
    side.addChild(play, upNext)

    const journals = label("journals", 26, palette.inkSoft, "600")
    journals.position.set(280, 500)
    side.addChild(journals)
    const journal = (text: string, color: number, shade: number, icon: (g: Graphics) => void, page: "recipes" | "stickers" | "papers", x: number) => {
      const b = new Button({ width: 150, height: 120, color, shade, text, fontSize: 22, icon, onTap: () => ctx.book(page) }, ctx.tweens)
      b.position.set(x, 610)
      side.addChild(b)
    }
    journal("recipes", palette.token, palette.binShade, icons.book, "recipes", 110)
    journal("stickers", palette.green, palette.greenShade, icons.star, "stickers", 280)
    journal("papers", palette.yellow, 0xc8902c, icons.scroll, "papers", 450)

    const found = Object.values(save.recipes).reduce((n, r) => n + r.length, 0)
    const stats = label(`${Object.keys(save.completed).length}/${ctx.pack.levels.length} levels · ${found} recipes · ${save.stickers.length} stickers`, 20, palette.inkSoft, "500")
    stats.position.set(280, 730)
    side.addChild(stats)
    const home = new Button({ width: 200, height: 70, color: palette.inkSoft, shade: palette.ink, text: "home", fontSize: 24, icon: icons.back, onTap: () => ctx.home() }, ctx.tweens)
    home.position.set(170, 960)
    const editor = new Button({ width: 200, height: 70, color: palette.blue, shade: 0x1f4c85, text: "editor", fontSize: 24, icon: icons.pencil, onTap: () => ctx.editor() }, ctx.tweens)
    editor.position.set(390, 960)
    side.addChild(home, editor)
    this.view.addChild(side)

    // Worlds and level cards, in a wheel-scrollable column ---------------------
    const content = new Container()
    const clip = new Graphics().rect(570, 0, DESIGN_W - 570, DESIGN_H).fill(0xffffff)
    content.mask = clip
    this.view.addChild(content, clip)
    let y = 54
    ctx.pack.worlds.forEach((world) => {
      const levels = ctx.pack.levels.filter((lv) => lv.world === world.id)
      const title = label(world.title.toLowerCase(), 32, palette.ink, "700", "left")
      title.position.set(620, y)
      const subtitle = label(world.subtitle, 19, palette.inkSoft, "500", "left")
      subtitle.position.set(632 + title.width + 12, y + 3)
      content.addChild(title, subtitle)
      y += 34
      levels.forEach((lv, i) => {
        const card = this.levelCard(lv.id, lv.title, lv.targets.map((t) => t.label).join(" "), lv.sticker, !!save.completed[lv.id], ctx.pack.levels.indexOf(lv) + 1)
        card.position.set(620 + (i % PER_ROW) * CARD_DX, y + Math.floor(i / PER_ROW) * CARD_DY)
        content.addChild(card)
        this.bobbers.push(card)
      })
      y += Math.ceil(levels.length / PER_ROW) * CARD_DY + 30
    })
    const overflow = Math.max(0, y - DESIGN_H + 40)
    if (overflow > 0) {
      this.view.eventMode = "static"
      this.view.hitArea = new Rectangle(0, 0, DESIGN_W, DESIGN_H)
      this.view.on("wheel", (e) => {
        content.y = Math.max(-overflow, Math.min(0, content.y - e.deltaY))
      })
      const more = label("scroll for more ↓", 18, palette.inkSoft, "600")
      more.position.set(DESIGN_W - 140, DESIGN_H - 30)
      this.view.addChild(more)
    }

    // Cards fly in.
    this.bobbers.forEach((c, i) => {
      const targetY = c.y
      c.alpha = 0
      ctx.tweens.add({ delay: i * 35, duration: 420, ease: ease.outBack, update: (k) => {
        c.alpha = Math.min(1, k * 2)
        c.y = lerp(targetY + 40, targetY, k)
      } })
    })
  }

  private levelCard(id: string, title: string, word: string, sticker: string | undefined, done: boolean, n: number) {
    const c = new Container()
    const w = CARD_W
    const h = CARD_H
    const face = new Container()
    face.addChild(new Graphics().roundRect(0, 6, w, h, 18).fill(done ? palette.binShade : palette.trayShade).roundRect(0, 0, w, h, 18).fill(done ? palette.bin : palette.cream))
    const num = label(`${n}`, 16, done ? palette.white : palette.inkSoft, "700")
    num.position.set(18, 17)
    const glyph = label(word, [...word].length > 5 ? 20 : [...word].length > 2 ? 26 : 34, done ? palette.white : palette.ink, "700")
    glyph.position.set(w / 2, 46)
    const t = label(title, 14, done ? palette.white : palette.inkSoft, "600")
    if (t.width > w - 14) t.scale.set((w - 14) / t.width)
    t.position.set(w / 2, 84)
    face.addChild(num, glyph, t)
    if (sticker && done) {
      const s = stickerArt(sticker, undefined, byName.get(sticker)?.color ?? palette.green, 24)
      s.position.set(w - 20, 20)
      s.rotation = 0.2
      face.addChild(s)
    }
    c.addChild(face)
    c.eventMode = "static"
    c.cursor = "pointer"
    c.hitArea = new Rectangle(0, -4, w, h + 10)
    c.interactiveChildren = false
    const lift = (to: number) => {
      this.ctx.tweens.cancel(face)
      const from = face.y
      this.ctx.tweens.add({ owner: face, duration: 110, update: (k) => (face.y = lerp(from, to, k)) })
    }
    c.on("pointerover", () => lift(-3))
    c.on("pointerout", () => lift(0))
    c.on("pointerup", () => this.ctx.play(id))
    return c
  }

  destroy() {
    this.view.destroy({ children: true })
  }
}

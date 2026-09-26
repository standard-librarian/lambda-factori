/** The deck's two overlays: speaker notes (N) and the slide overview grid (O). */
import { Container, Graphics, Rectangle } from "pixi.js"
import type { Slide } from "@lambda-factori/contracts/Deck.ts"
import { label } from "../../render/label.ts"
import { DESIGN_H, DESIGN_W, palette } from "../../render/theme.ts"
import { slideTitle } from "./render.ts"
import { para } from "../../render/text.ts"

/** A cream panel along the bottom with this slide's speaker notes. */
export const notesPanel = (notes: string) => {
  const c = new Container()
  const body = para(notes || "no speaker notes on this slide", 30, palette.ink, DESIGN_W - 360, "500")
  const h = body.height + 90
  c.addChild(new Graphics().roundRect(120, DESIGN_H - h - 90, DESIGN_W - 240, h, 26).fill({ color: palette.cream, alpha: 0.97 }).stroke({ width: 3, color: palette.trayShade }))
  const head = label("speaker notes · N to hide", 20, palette.red, "700", "left")
  head.position.set(160, DESIGN_H - h - 60)
  body.position.set(160, DESIGN_H - h - 36)
  c.addChild(head, body)
  return c
}

/** Every slide as a card (number, kind, title) on a dimmed backdrop; `onPick` gets the index. */
export const overviewGrid = (slides: ReadonlyArray<Slide>, current: number, onPick: (index: number) => void) => {
  const c = new Container()
  c.addChild(new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: palette.ink, alpha: 0.82 }))
  const cols = 6
  const cw = 280
  const ch = 150
  const gap = 22
  const x0 = (DESIGN_W - (cols * cw + (cols - 1) * gap)) / 2
  slides.forEach((s, i) => {
    const card = new Container()
    const dark = s.kind === "section" || s.kind === "title"
    const fill = s.kind === "section" ? palette.red : s.kind === "title" ? palette.blue : palette.cream
    card.addChild(new Graphics().roundRect(0, 0, cw, ch, 18).fill(fill).stroke({ width: i === current ? 6 : 0, color: palette.yellow }))
    const num = label(`${i + 1}`, 22, dark ? palette.white : palette.red, "700", "left")
    num.position.set(16, 24)
    const kind = label(s.kind, 16, dark ? palette.white : palette.inkSoft, "600", "right")
    kind.position.set(cw - 16, 24)
    const t = para(slideTitle(s, i), 22, dark ? palette.white : palette.ink, cw - 32, "700")
    t.position.set(16, 48)
    if (t.height > ch - 58) t.scale.set((ch - 58) / t.height)
    card.addChild(num, kind, t)
    card.position.set(x0 + (i % cols) * (cw + gap), 70 + Math.floor(i / cols) * (ch + gap))
    card.eventMode = "static"
    card.cursor = "pointer"
    card.hitArea = new Rectangle(0, 0, cw, ch)
    card.on("pointerup", () => onPick(i))
    c.addChild(card)
  })
  return c
}

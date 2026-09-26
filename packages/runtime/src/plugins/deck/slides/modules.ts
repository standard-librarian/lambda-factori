/**
 * The `modules` slide. Ousterhout's picture of a module: the top edge is the interface (what every
 * caller pays to learn), the area below it is the functionality it hides.
 * Deep modules are tall and narrow; shallow ones are wide and flat.
 */
import { Container, Graphics } from "pixi.js"
import { label } from "../../../ui/label.ts"
import { DESIGN_W, palette } from "../../../ui/theme.ts"
import { ease } from "@lambda-factori/kernel/tween.ts"
import type { SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { color, Reveal, shade } from "./common.ts"
import { para } from "../../../ui/text.ts"
import { CONTENT_TOP, type SlideContext, type SlideView } from "@lambda-factori/kernel/Slide.ts"

export const modulesSlide = (s: SlideOf<"modules">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const reveal = new Reveal(ctx.tweens)
  const n = s.modules.length
  const maxI = Math.max(...s.modules.map((m) => m.interface), 1)
  const maxF = Math.max(...s.modules.map((m) => m.functionality), 1)
  const slotW = (DESIGN_W - 200) / n
  const maxW = Math.min(620, slotW - 60)
  const maxH = 520
  const baseY = CONTENT_TOP + 60
  const growers: Array<(k: number) => void> = []
  s.modules.forEach((m, i) => {
    const fill = color(m.color, [palette.blue, palette.red, palette.green, 0x9b5fc0][i % 4]!)
    const c = new Container()
    const cx = 100 + slotW * i + slotW / 2
    c.position.set(cx, baseY)
    const w = Math.max(90, (m.interface / maxI) * maxW)
    const h = Math.max(60, (m.functionality / maxF) * maxH)
    const g = new Graphics()
    const name = label(m.name, 34, palette.ink, "700")
    const depth = m.functionality / Math.max(1e-9, m.interface)
    const ratio = label(`depth ${depth >= 10 ? Math.round(depth) : depth.toFixed(1)}×`, 24, palette.white, "700")
    c.addChild(g, name, ratio)
    const draw = (k: number) => {
      const hh = 34 + (h - 34) * k
      g.clear()
        .roundRect(-w / 2, 8, w, hh, 14).fill(shade(fill, 0.8))
        .roundRect(-w / 2, 0, w, hh, 14).fill({ color: fill, alpha: 0.28 })
        .roundRect(-w / 2, 0, w, 34, 12).fill(fill)
      ratio.position.set(0, 17)
      name.position.set(0, hh + 50)
    }
    draw(0)
    growers.push(draw)
    if (m.note) {
      const note = para(m.note, 24, palette.inkSoft, Math.min(slotW - 40, 540), "500", "center")
      note.position.set(0, h + 80)
      c.addChild(note)
    }
    const ifaceTag = label("interface", 18, palette.white, "600", "left")
    ifaceTag.alpha = 0.85
    ifaceTag.position.set(-w / 2 + 10, -18)
    ifaceTag.style.fill = shade(fill, 0.7)
    c.addChild(ifaceTag)
    v.addChild(c)
    reveal.add(c, i + 1, { y: 20 })
  })
  if (s.caption) {
    const cap = para(s.caption, 30, palette.ink, DESIGN_W - 300, "600", "center")
    cap.position.set(DESIGN_W / 2, 950)
    v.addChild(cap)
    reveal.add(cap, n, { y: 16 })
  }
  let shown = 0
  return {
    view: v,
    steps: n,
    setStep: (step, animate) => {
      reveal.set(step, animate)
      growers.forEach((draw, i) => {
        if (i >= step) return draw(0)
        if (!animate || i < shown) return draw(1)
        ctx.tweens.add({ target: v, delay: 120, duration: 800, ease: ease.outBack, update: draw })
      })
      shown = step
    },
    destroy: () => v.destroy({ children: true })
  }
}

/** The `curve` slide: tactical vs strategic progress over time, drawn after APOSD figure 3.1. */
import { Container, Graphics } from "pixi.js"
import { label } from "../../../ui/label.ts"
import { DESIGN_W, palette } from "../../../ui/theme.ts"
import { ease } from "@lambda-factori/kernel/tween.ts"
import type { SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { color, Reveal } from "./common.ts"
import { para } from "../../../ui/text.ts"
import type { SlideContext, SlideView } from "@lambda-factori/kernel/Slide.ts"

/** Illustrative shapes (after APOSD fig. 3.1): cumulative progress over time. */
const SHAPES = {
  tactical: (x: number) => 0.62 * (1 - Math.exp(-4 * x)) + 0.04 * x,
  strategic: (x: number) => 0.95 * x ** 1.8,
  linear: (x: number) => 0.8 * x
} as const

export const curveSlide = (s: SlideOf<"curve">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const x0 = 220
  const y0 = 860
  const w = DESIGN_W - 520
  const h = 560
  const axes = new Graphics()
    .moveTo(x0, y0 - h - 20).lineTo(x0, y0).lineTo(x0 + w + 20, y0)
    .stroke({ width: 5, color: palette.ink, cap: "round" })
    .poly([x0 + w + 30, y0, x0 + w + 12, y0 - 10, x0 + w + 12, y0 + 10]).fill(palette.ink)
    .poly([x0, y0 - h - 30, x0 - 10, y0 - h - 12, x0 + 10, y0 - h - 12]).fill(palette.ink)
  v.addChild(axes)
  const xl = label(s.xLabel ?? "time", 28, palette.inkSoft, "600")
  xl.position.set(x0 + w / 2, y0 + 44)
  const yl = label(s.yLabel ?? "progress", 28, palette.inkSoft, "600")
  yl.rotation = -Math.PI / 2
  yl.position.set(x0 - 50, y0 - h / 2)
  v.addChild(xl, yl)
  const reveal = new Reveal(ctx.tweens)
  const lines = s.series.map((ser, i) => {
    const fill = color(ser.color, i === 0 ? palette.red : palette.greenShade)
    const g = new Graphics()
    v.addChild(g)
    const f = SHAPES[ser.shape]
    const tag = label(ser.label, 30, fill, "700", "left")
    tag.position.set(x0 + w + 30, y0 - f(1) * h)
    v.addChild(tag)
    reveal.add(tag, i + 1, { x: -20 })
    const draw = (k: number) => {
      g.clear().moveTo(x0, y0 - f(0) * h)
      for (let t = 1; t <= 80 * k; t++) g.lineTo(x0 + (t / 80) * w, y0 - f(t / 80) * h)
      g.stroke({ width: 8, color: fill, cap: "round", join: "round" })
    }
    draw(0)
    return draw
  })
  if (s.caption) {
    const c = para(s.caption, 30, palette.ink, DESIGN_W - 300, "600", "center")
    c.position.set(DESIGN_W / 2, 930)
    v.addChild(c)
    reveal.add(c, s.series.length, { y: 16 })
  }
  let shown = 0
  return {
    view: v,
    steps: s.series.length,
    setStep: (step, animate) => {
      reveal.set(step, animate)
      lines.forEach((draw, i) => {
        if (i >= step) return draw(0)
        if (!animate || i < shown) return draw(1)
        ctx.tweens.add({ target: v, duration: 1400, ease: ease.inOutSine, update: draw })
      })
      shown = step
    },
    destroy: () => v.destroy({ children: true })
  }
}

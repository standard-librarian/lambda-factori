import { Container, Graphics } from "pixi.js"
import { label } from "../../../render/art.ts"
import { DESIGN_W, palette } from "../../../render/theme.ts"
import { ease } from "../../../render/tween.ts"
import { parse } from "../../../core/Term.ts"
import { trace } from "../../../core/Trace.ts"
import { TermRow } from "../../../render/Theater.ts"
import { describeStep } from "../../../core/Trace.ts"
import type { SlideOf } from "../Deck.ts"
import { color, CONTENT_TOP, para, Reveal, type SlideContext, type SlideView } from "./common.ts"

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

/** An inline reduction theater: each build step performs one rewrite. */
export const theaterSlide = (s: SlideOf<"theater">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const tr = trace(parse(s.term))
  // TermRow fits itself to its width at scale ≤ 1, so enlarge it via a holder.
  const holder = new Container()
  holder.scale.set(1.4)
  holder.position.set(DESIGN_W / 2, CONTENT_TOP + 330)
  const row = new TermRow(ctx.tweens, (DESIGN_W - 300) / 1.4)
  holder.addChild(row)
  v.addChild(new Graphics().roundRect(120, CONTENT_TOP + 120, DESIGN_W - 240, 420, 36).fill({ color: palette.white, alpha: 0.6 }), holder)
  const caption = para("", 36, palette.ink, DESIGN_W - 300, "600", "center")
  caption.position.set(DESIGN_W / 2, CONTENT_TOP + 580)
  const sub = para(s.caption ?? "", 28, palette.inkSoft, DESIGN_W - 300, "500", "center")
  sub.position.set(DESIGN_W / 2, CONTENT_TOP + 660)
  v.addChild(caption, sub)
  let at = 0
  const cap = (i: number) => {
    const st = tr.steps[i - 1]
    caption.text = i === 0 ? "" : st ? `${st.redex}  ⟶  ${st.result}   ·   ${describeStep(st)}` : ""
  }
  row.show(tr.terms[0]!)
  return {
    view: v,
    steps: tr.steps.length,
    setStep: (step, animate) => {
      if (animate && step === at + 1 && tr.steps[at]) {
        const st = tr.steps[at]!
        row.animate(tr.terms[step]!, st, () => {})
      } else {
        row.show(tr.terms[step]!)
      }
      at = step
      cap(step)
    },
    destroy: () => v.destroy({ children: true })
  }
}

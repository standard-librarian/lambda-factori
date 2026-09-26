/** The `measure` slide: before/after bars for a few metrics. */
import { Container, Graphics } from "pixi.js"
import { label, relabel } from "../../../render/label.ts"
import { DESIGN_W, palette } from "../../../render/theme.ts"
import { ease } from "../../../kernel/tween.ts"
import type { SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { CONTENT_TOP, MARGIN, Reveal } from "./common.ts"
import { para } from "../../../render/text.ts"
import type { SlideContext, SlideView } from "../../../kernel/Slide.ts"

export const measureSlide = (s: SlideOf<"measure">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const reveal = new Reveal(ctx.tweens)
  const x0 = MARGIN
  const nameW = 560
  const barW = (DESIGN_W - MARGIN * 2 - nameW - 60) / 2
  const hdr = (text: string, x: number, fill: number) => {
    const t = label(text, 30, fill, "700", "left")
    t.position.set(x, CONTENT_TOP + 10)
    v.addChild(t)
  }
  hdr(s.before, x0 + nameW, palette.red)
  hdr(s.after, x0 + nameW + barW + 60, palette.greenShade)
  const rowH = Math.min(110, (900 - CONTENT_TOP - 80) / Math.max(1, s.rows.length))
  const animators: Array<(k: number) => void> = []
  s.rows.forEach((r, i) => {
    const row = new Container()
    row.position.set(x0, CONTENT_TOP + 70 + i * rowH)
    const name = para(r.metric, 28, palette.ink, nameW - 30, "600")
    row.addChild(name)
    if (r.note) {
      const n = para(r.note, 20, palette.inkSoft, nameW - 30, "500")
      n.position.set(0, name.height + 2)
      row.addChild(n)
    }
    const max = Math.max(r.before, r.after, 1)
    const bars = new Graphics()
    const bv = label("", 30, palette.white, "700", "left")
    const av = label("", 30, palette.white, "700", "left")
    row.addChild(bars, bv, av)
    const draw = (k: number) => {
      const b = (r.before / max) * barW * k
      const a = (r.after / max) * barW * k
      bars.clear()
        .roundRect(nameW, 4, Math.max(8, barW), 52, 14).fill({ color: palette.red, alpha: 0.1 })
        .roundRect(nameW, 4, Math.max(8, b), 52, 14).fill(palette.red)
        .roundRect(nameW + barW + 60, 4, Math.max(8, barW), 52, 14).fill({ color: palette.green, alpha: 0.12 })
        .roundRect(nameW + barW + 60, 4, Math.max(8, a), 52, 14).fill(palette.green)
      const fmt = (n: number) => (Number.isInteger(n) ? `${Math.round(n * k)}` : (n * k).toFixed(1))
      relabel(bv, fmt(r.before), "left")
      relabel(av, fmt(r.after), "left")
      const inside = (w: number) => w > 90
      bv.style.fill = inside(b) ? palette.white : palette.red
      av.style.fill = inside(a) ? palette.white : palette.greenShade
      bv.position.set(inside(b) ? nameW + 18 : nameW + b + 14, 30)
      av.position.set(inside(a) ? nameW + barW + 78 : nameW + barW + 60 + a + 14, 30)
    }
    draw(0)
    animators.push(draw)
    v.addChild(row)
    reveal.add(row, i + 1, { x: -30 })
  })
  if (s.caption) {
    const c = para(s.caption, 26, palette.inkSoft, DESIGN_W - MARGIN * 2, "600", "center")
    c.position.set(DESIGN_W / 2, 930)
    v.addChild(c)
    reveal.add(c, s.rows.length, { y: 20 })
  }
  let shown = 0
  return {
    view: v,
    steps: s.rows.length,
    setStep: (step, animate) => {
      reveal.set(step, animate)
      animators.forEach((draw, i) => {
        const visible = i < step
        if (!visible) return draw(0)
        if (!animate || i < shown) return draw(1)
        ctx.tweens.add({ target: v, duration: 700, delay: 150, ease: ease.outCubic, update: draw })
      })
      shown = step
    },
    destroy: () => v.destroy({ children: true })
  }
}

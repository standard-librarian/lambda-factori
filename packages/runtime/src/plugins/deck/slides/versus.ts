/** The `versus` slide: two positions side by side, and what both agree on. */
import { Container, Graphics } from "pixi.js"
import { label } from "../../../render/label.ts"
import { DESIGN_W, palette } from "../../../render/theme.ts"
import type { SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { cardArt, color, CONTENT_TOP, MARGIN, para, Reveal, shade, type SlideContext, type SlideView } from "./common.ts"

export const versusSlide = (s: SlideOf<"versus">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const reveal = new Reveal(ctx.tweens)
  const colW = 760
  const cols = [
    { side: s.left, x: MARGIN, fallback: palette.blue },
    { side: s.right, x: DESIGN_W - MARGIN - colW, fallback: palette.red }
  ]
  const rows: Array<Array<Container>> = [[], []]
  cols.forEach(({ side, x, fallback }, k) => {
    const fill = color(side.color, fallback)
    const head = new Container()
    head.addChild(cardArt(colW, 84, fill, shade(fill), 24))
    const hl = label(side.name, 38, palette.white, "700")
    hl.position.set(colW / 2, 42)
    head.addChild(hl)
    head.position.set(x, CONTENT_TOP)
    v.addChild(head)
    let y = CONTENT_TOP + 120
    for (const p of side.points) {
      const c = new Container()
      const t = para(p, 30, palette.ink, colW - 80, "500")
      c.addChild(cardArt(colW, t.height + 44, palette.white, shade(palette.cream, 0.88), 18))
      c.addChild(new Graphics().roundRect(0, 0, 10, t.height + 44, 5).fill(fill))
      t.position.set(40, 22)
      c.addChild(t)
      c.position.set(x, y)
      v.addChild(c)
      rows[k]!.push(c)
      y += t.height + 66
    }
  })
  // Interleave: left 1, right 1, left 2, …
  let step = 0
  for (let i = 0; i < Math.max(rows[0]!.length, rows[1]!.length); i++) {
    for (const k of [0, 1]) {
      const c = rows[k]![i]
      if (c) reveal.add(c, ++step, { x: k === 0 ? -40 : 40 })
    }
  }
  if (s.agree?.length) {
    const band = new Container()
    const t = para(`we agree: ${s.agree.join(" · ")}`, 30, palette.white, DESIGN_W - MARGIN * 2 - 80, "600", "center")
    band.addChild(cardArt(DESIGN_W - MARGIN * 2, t.height + 44, palette.green, palette.greenShade, 22))
    t.position.set((DESIGN_W - MARGIN * 2) / 2, 22)
    band.addChild(t)
    band.position.set(MARGIN, 980 - t.height - 44)
    v.addChild(band)
    reveal.add(band, ++step, { y: 30 })
  }
  return { view: v, steps: step, setStep: (i, a) => reveal.set(i, a), destroy: () => v.destroy({ children: true }) }
}

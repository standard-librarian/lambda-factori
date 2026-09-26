/** The `bullets` slide: points (with optional sub-points and tags) that build one per step. */
import { Container, Graphics } from "pixi.js"
import { label } from "../../../render/label.ts"
import { DESIGN_W, palette } from "../../../render/theme.ts"
import type { SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { CONTENT_TOP, MARGIN, para, Reveal, type SlideContext, type SlideView } from "./common.ts"

export const bulletsSlide = (s: SlideOf<"bullets">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const reveal = new Reveal(ctx.tweens)
  const build = s.build !== false
  let y = CONTENT_TOP + 20
  const count = s.items.length
  const size = count > 6 ? 34 : count > 4 ? 38 : 44
  s.items.forEach((item, i) => {
    const text = typeof item === "string" ? item : item.text
    const sub = typeof item === "string" ? [] : item.sub ?? []
    const tag = typeof item === "string" ? undefined : item.tag
    const row = new Container()
    row.position.set(MARGIN, y)
    const dot = new Graphics().circle(22, size * 0.62, 12).fill(palette.red)
    const t = para(text, size, palette.ink, DESIGN_W - MARGIN * 2 - 80 - (tag ? 220 : 0), "600")
    t.position.set(60, 0)
    row.addChild(dot, t)
    let h = t.height
    if (tag) {
      const pill = new Container()
      const pl = label(tag, 24, palette.white, "700")
      const pw = pl.width + 36
      pill.addChild(new Graphics().roundRect(-pw / 2, -22, pw, 44, 22).fill(palette.blue), pl)
      pill.position.set(DESIGN_W - MARGIN * 2 - pw / 2, size * 0.62)
      row.addChild(pill)
    }
    for (const line of sub) {
      const st = para(line, size * 0.72, palette.inkSoft, DESIGN_W - MARGIN * 2 - 140, "500")
      st.position.set(96, h + 10)
      row.addChild(new Graphics().circle(76, h + 10 + size * 0.45, 6).fill(palette.inkSoft), st)
      h += st.height + 10
    }
    v.addChild(row)
    reveal.add(row, build ? i + 1 : 0, { x: -40 })
    y += h + (size > 40 ? 38 : 28)
  })
  return {
    view: v,
    steps: build ? count : 0,
    setStep: (step, animate) => reveal.set(step, animate),
    destroy: () => v.destroy({ children: true })
  }
}

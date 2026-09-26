/** The `theater` slide: an inline reduction theater; each build step performs one rewrite. */
import { Container, Graphics } from "pixi.js"
import { DESIGN_W, palette } from "../../../render/theme.ts"
import { parse } from "@lambda-factori/core/Term.ts"
import { trace } from "@lambda-factori/core/Trace.ts"
import { TermRow } from "../../../render/TermRow.ts"
import { describeStep } from "@lambda-factori/core/Trace.ts"
import type { SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { CONTENT_TOP, para } from "./common.ts"
import type { SlideContext, SlideView } from "../../../kernel/Slide.ts"

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

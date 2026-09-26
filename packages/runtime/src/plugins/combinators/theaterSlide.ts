/**
 * The `combinators/theater` slide mechanic's rendering: an inline reduction
 * theater; each build step performs one rewrite. Validated by `mechanics.ts`
 * against `TheaterSlide` before this ever sees the data.
 */
import { Container, Graphics } from "pixi.js"
import { DESIGN_W, palette } from "../../ui/theme.ts"
import { parse } from "@lambda-factori/core/Term.ts"
import { trace } from "@lambda-factori/core/Trace.ts"
import { TermRow } from "./TermRow.ts"
import { describeStep } from "@lambda-factori/core/Trace.ts"
import type { TheaterSlide } from "@lambda-factori/contracts/TheaterSlide.ts"
import { para } from "../../ui/text.ts"
import type { SlideContext, SlideView } from "../../kernel/Slide.ts"

/** Where the deck's own chrome (painted by `plugins/deck/slideFrame.ts` for any non-fullBleed
 * mechanic) leaves off, so this content starts below the slide title without overlapping it.
 * Mirrors `plugins/deck/slides/common.ts`'s `CONTENT_TOP`; combinators can't import the deck
 * plugin (the dependency rule forbids plugin-to-plugin imports), so this is a deliberate,
 * named duplicate, not a shared import. */
const CONTENT_TOP = 190

export const theaterSlide = (s: TheaterSlide, ctx: SlideContext): SlideView => {
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

/** The `quote` slide: a large serif quotation with its author and source. */
import { Container } from "pixi.js"
import { label } from "../../../ui/label.ts"
import { DESIGN_W, palette } from "../../../ui/theme.ts"
import type { SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { SERIF, staticSlide } from "./common.ts"
import { para } from "../../../ui/text.ts"
import { CONTENT_TOP, type SlideView } from "../../../kernel/Slide.ts"

export const quoteSlide = (s: SlideOf<"quote">): SlideView => {
  const v = new Container()
  const mark = label("“", 400, palette.red, "700")
  mark.alpha = 0.18
  mark.position.set(260, 330)
  const len = s.quote.length
  const size = len > 260 ? 44 : len > 160 ? 52 : 62
  const q = para(s.quote, size, palette.ink, 1420, "600", "center")
  q.style.fontFamily = SERIF
  q.style.fontStyle = "italic"
  q.position.set(DESIGN_W / 2, (s.title ? CONTENT_TOP + 40 : 260))
  const by = label(`— ${s.by}`, 34, palette.red, "700")
  by.position.set(DESIGN_W / 2, q.y + q.height + 70)
  v.addChild(mark, q, by)
  if (s.source) {
    const src = para(s.source, 26, palette.inkSoft, 1400, "500", "center")
    src.position.set(DESIGN_W / 2, by.y + 36)
    v.addChild(src)
  }
  return staticSlide(v)
}

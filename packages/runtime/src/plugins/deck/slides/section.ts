/** The `section` slide: a full-bleed coloured divider with a big number and a subtitle. */
import { Container, Graphics } from "pixi.js"
import { label } from "../../../render/label.ts"
import { skylineArt } from "../../../render/backdrop.ts"
import { DESIGN_H, DESIGN_W, palette } from "../../../render/theme.ts"
import type { SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { color, shade, staticSlide } from "./common.ts"
import { para } from "../../../render/text.ts"
import type { SlideView } from "../../../kernel/Slide.ts"

export const sectionSlide = (s: SlideOf<"section">): SlideView => {
  const v = new Container()
  const fill = color(s.color, palette.red)
  v.addChild(new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(fill))
  v.addChild(skylineArt(DESIGN_W, DESIGN_H - 6, shade(fill, 0.85)))
  if (s.number) {
    const n = label(s.number, 300, palette.white, "700")
    n.alpha = 0.16
    n.position.set(DESIGN_W / 2, 360)
    v.addChild(n)
  }
  const title = para(s.title ?? "", 110, palette.white, 1500, "700", "center")
  title.position.set(DESIGN_W / 2, 420)
  v.addChild(title)
  if (s.subtitle) {
    const sub = para(s.subtitle, 40, palette.white, 1300, "500", "center")
    sub.alpha = 0.9
    sub.position.set(DESIGN_W / 2, title.y + title.height + 30)
    v.addChild(sub)
  }
  return staticSlide(v)
}

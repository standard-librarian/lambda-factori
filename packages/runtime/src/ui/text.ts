/**
 * Word-wrapped paragraph text: the one text-layout primitive both the host
 * (the generic shared-pack card, `host/OpenScene.ts`) and the deck plugin
 * (slide bodies) need. Everything else the deck's old `slides/common.ts`
 * held — named colours, fonts, card art, reveal animation — stays deck-only,
 * since nothing outside the deck uses it.
 */
import { Text } from "pixi.js"
import { fontFor } from "./label.ts"

/** Word-wrapped paragraph text, left aligned at its top-left corner (or centred, anchored on top-centre). */
export const para = (text: string, size: number, fill: number, width: number, weight: "500" | "600" | "700" = "500", align: "left" | "center" = "left") => {
  const t = new Text({
    text,
    style: {
      fontFamily: fontFor(text),
      fontSize: size,
      fill,
      fontWeight: weight,
      wordWrap: true,
      wordWrapWidth: width,
      lineHeight: size * 1.28,
      align
    }
  })
  if (align === "center") t.anchor.set(0.5, 0)
  return t
}

/** Speech bubbles for the office: say, think (cloud-style) or error, with a tail to the speaker. */
import { Container, Graphics, Text } from "pixi.js"
import { FONT } from "../../render/theme.ts"
import { office } from "./officePalette.ts"

/** A speech bubble with a tail pointing down-left (or down-right). */
export const bubbleArt = (text: string, maxW = 420, tail: "left" | "right" = "left", tone: "say" | "think" | "error" = "say") => {
  const c = new Container()
  const t = new Text({ text, style: { fontFamily: FONT, fontSize: 25, fill: tone === "error" ? 0xffffff : office.bubbleInk, fontWeight: "600", wordWrap: true, wordWrapWidth: maxW - 40, align: "center", lineHeight: 30 } })
  t.anchor.set(0.5)
  const w = Math.max(140, t.width + 44)
  const h = t.height + 34
  const fill = tone === "error" ? office.bad : office.bubble
  const g = new Graphics().roundRect(-w / 2, -h / 2, w, h, 20).fill(fill).stroke({ width: 3, color: 0x2b211b, alpha: 0.35 })
  if (tone === "think") g.circle(tail === "left" ? -w / 4 : w / 4, h / 2 + 14, 9).fill(fill).circle(tail === "left" ? -w / 4 - 12 : w / 4 + 12, h / 2 + 32, 5).fill(fill)
  else g.poly(tail === "left" ? [-w / 4 - 10, h / 2 - 2, -w / 4 + 14, h / 2 - 2, -w / 4 - 22, h / 2 + 24] : [w / 4 + 10, h / 2 - 2, w / 4 - 14, h / 2 - 2, w / 4 + 22, h / 2 + 24]).fill(fill)
  c.addChild(g, t)
  c.pivot.set(tail === "left" ? -w / 4 - 22 : w / 4 + 22, h / 2 + 24)
  return c
}

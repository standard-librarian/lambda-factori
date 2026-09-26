/** The `title` slide: the talk's opening card, with idle S/K/apply factories below it. */
import { Container } from "pixi.js"
import { applyArt, sourceArt, W } from "../../../render/factoryArt.ts"
import { label } from "../../../render/label.ts"
import { skylineArt } from "../../../render/backdrop.ts"
import { DESIGN_H, DESIGN_W, palette } from "../../../render/theme.ts"
import type { SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { staticSlide } from "./common.ts"
import { para } from "../../../render/text.ts"
import type { SlideContext, SlideView } from "../../../kernel/Slide.ts"

export const titleSlide = (s: SlideOf<"title">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const title = para(s.title ?? "", 104, palette.ink, 1500, "700", "center")
  title.position.set(DESIGN_W / 2, 300)
  v.addChild(title)
  let y = title.y + title.height + 30
  if (s.subtitle) {
    const sub = para(s.subtitle, 40, palette.inkSoft, 1400, "600", "center")
    sub.position.set(DESIGN_W / 2, y)
    v.addChild(sub)
    y += sub.height + 50
  }
  const by = [s.byline, s.date].filter(Boolean).join("  ·  ")
  if (by) {
    const t = label(by, 30, palette.red, "700")
    t.position.set(DESIGN_W / 2, y + 20)
    v.addChild(t)
  }
  // A little factory scene: two sources feeding an apply machine.
  const scene = new Container()
  const sArt = sourceArt("S", 0x4f56b8, 0x3a3f8f)
  const kArt = sourceArt("K", 0xee8d56, 0xc96a38)
  const ap = applyArt()
  sArt.root.position.set(0, 60)
  kArt.root.position.set(W + 60, 60)
  ap.root.position.set((W + 60) / 2, -80)
  scene.addChild(sArt.root, kArt.root, ap.root)
  scene.scale.set(1.25)
  scene.position.set(DESIGN_W / 2 - ((2 * W + 60) * 1.25) / 2, 800)
  v.addChild(skylineArt(DESIGN_W, DESIGN_H - 6, 0xe7dfd1), scene)
  let t = 0
  return staticSlide(v, {
    tick: (dt) => {
      t += dt
      sArt.icon.y = -20 + Math.max(0, Math.sin(t / 380)) * 10
      kArt.icon.y = -20 + Math.max(0, Math.sin(t / 380 + 1.6)) * 10
      ap.icon.scale.set(1 + Math.max(0, Math.sin(t / 380 + 0.8)) * 0.15)
    }
  })
}

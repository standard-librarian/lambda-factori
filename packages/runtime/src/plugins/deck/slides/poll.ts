/** The `poll` slide: big option buttons that count hands (shift-click undoes). */
import { Container, Graphics, Rectangle } from "pixi.js"
import { label, relabel } from "../../../ui/label.ts"
import { DESIGN_W, palette } from "../../../ui/theme.ts"
import { ease } from "@lambda-factori/kernel/tween.ts"
import type { SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { color, shade, staticSlide } from "./common.ts"
import { para } from "../../../ui/text.ts"
import { CONTENT_TOP, MARGIN, type SlideContext, type SlideView } from "@lambda-factori/kernel/Slide.ts"

export const pollSlide = (s: SlideOf<"poll">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const q = para(s.question, 56, palette.ink, 1500, "700", "center")
  q.position.set(DESIGN_W / 2, CONTENT_TOP)
  v.addChild(q)
  const counts = s.options.map(() => 0)
  const n = s.options.length
  const w = Math.min(460, (DESIGN_W - MARGIN * 2 - (n - 1) * 40) / n)
  const bars: Array<() => void> = []
  s.options.forEach((o, i) => {
    const fill = color(o.color, [palette.blue, palette.red, palette.green, palette.yellow][i % 4]!)
    const c = new Container()
    const x = DESIGN_W / 2 - ((n - 1) * (w + 40)) / 2 + i * (w + 40) - w / 2
    c.position.set(x, 380)
    const bar = new Graphics()
    const num = label("0", 90, palette.white, "700")
    const name = para(o.label, 34, palette.white, w - 40, "700", "center")
    c.addChild(bar, num, name)
    const draw = () => {
      const total = Math.max(1, ...counts)
      const h = 120 + (counts[i]! / total) * 330
      bar.clear().roundRect(0, 470 - h + 8, w, h, 26).fill(shade(fill)).roundRect(0, 470 - h, w, h, 26).fill(fill)
      relabel(num, `${counts[i]}`)
      num.position.set(w / 2, 470 - h + 70)
      name.position.set(w / 2, 490)
      name.style.fill = palette.ink
    }
    bars.push(draw)
    c.eventMode = "static"
    c.cursor = "pointer"
    c.hitArea = new Rectangle(0, 0, w, 600)
    c.on("pointerdown", (e) => {
      counts[i] = Math.max(0, counts[i]! + (e.button === 2 || e.shiftKey ? -1 : 1))
      bars.forEach((d) => d())
      ctx.tweens.add({ target: num, duration: 260, ease: ease.linear, update: (k) => num.scale.set(1 + ease.bump(k) * 0.3) })
    })
    v.addChild(c)
  })
  bars.forEach((d) => d())
  const hint = label("click to count a vote · shift-click to undo", 22, palette.inkSoft, "500")
  hint.position.set(DESIGN_W / 2, 1000)
  v.addChild(hint)
  return staticSlide(v)
}

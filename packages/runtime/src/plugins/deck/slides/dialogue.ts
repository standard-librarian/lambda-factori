/**
 * The `dialogue` slide: a conversation as chat bubbles under an optional context
 * card. John is always on the left, Bob on the right; bubbles build one per step.
 */
import { Container, Graphics } from "pixi.js"
import { label } from "../../../render/label.ts"
import { DESIGN_W, palette } from "../../../render/theme.ts"
import { ease, lerp } from "../../../kernel/tween.ts"
import type { SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { avatar, color, CONTENT_TOP, MARGIN, Reveal, shade } from "./common.ts"
import { para } from "../../../render/text.ts"
import type { SlideContext, SlideView } from "../../../kernel/Slide.ts"

const defaultSpeakers: Record<string, { name: string; color: number; initials: string }> = {
  john: { name: "John Ousterhout", color: palette.blue, initials: "JO" },
  bob: { name: "Uncle Bob", color: palette.red, initials: "UB" }
}

export const dialogueSlide = (s: SlideOf<"dialogue">, ctx: SlideContext): SlideView => {
  const v = new Container()
  let top = CONTENT_TOP
  if (s.context) {
    // The setup: what they are arguing about, before anyone speaks.
    const t = para(s.context, 26, palette.inkSoft, DESIGN_W - MARGIN * 2 - 80, "500")
    t.style.fontStyle = "italic"
    const card = new Container()
    card.addChild(new Graphics().roundRect(0, 0, DESIGN_W - MARGIN * 2, t.height + 36, 18).fill({ color: palette.white, alpha: 0.55 }).rect(0, 0, 8, t.height + 36).fill(palette.yellow))
    t.position.set(36, 18)
    card.addChild(t)
    card.position.set(MARGIN, CONTENT_TOP - 20)
    v.addChild(card)
    top = CONTENT_TOP + t.height + 36
  }
  const clip = new Graphics().rect(0, top + 2, DESIGN_W, 1010 - top).fill(0xffffff)
  const stream = new Container()
  stream.mask = clip
  v.addChild(stream, clip)
  const speakers = (who: string) => {
    const custom = s.speakers?.[who]
    const base = defaultSpeakers[who] ?? { name: who, color: palette.inkSoft, initials: who.slice(0, 2).toUpperCase() }
    return custom
      ? { name: custom.name, color: color(custom.color, base.color), initials: custom.initials ?? base.initials }
      : base
  }
  const order = [...new Set(s.lines.map((l) => l.who))]
  const bubbles: Array<{ c: Container; bottom: number }> = []
  let y = top + 16
  s.lines.forEach((line) => {
    const sp = speakers(line.who)
    // John always sits on the left and Bob on the right; anyone else alternates.
    const left = line.who === "john" ? true : line.who === "bob" || line.who === "spock" ? false : order.indexOf(line.who) % 2 === 0
    const c = new Container()
    const len = line.text.length
    const size = len > 380 ? 26 : len > 220 ? 29 : 33
    const body = para(line.text, size, palette.ink, 1180, "500")
    const name = label(sp.name, 22, sp.color, "700", left ? "left" : "right")
    const bw = Math.max(body.width, name.width) + 64
    const bh = body.height + 70
    const bx = left ? 150 : DESIGN_W - 150 - bw
    const bubble = new Graphics()
      .roundRect(bx, 6, bw, bh, 26).fill(shade(palette.cream, 0.9))
      .roundRect(bx, 0, bw, bh, 26).fill(palette.white)
      .poly(left ? [bx + 10, 34, bx - 22, 58, bx + 26, 58] : [bx + bw - 10, 34, bx + bw + 22, 58, bx + bw - 26, 58]).fill(palette.white)
    name.position.set(left ? bx + 32 : bx + bw - 32, 30)
    body.position.set(bx + 32, 52)
    const av = avatar(sp.initials, sp.color)
    av.position.set(left ? 90 : DESIGN_W - 90, 40)
    c.addChild(bubble, av, name, body)
    c.y = y
    stream.addChild(c)
    bubbles.push({ c, bottom: y + bh + 20 })
    y += bh + 34
  })
  const reveal = new Reveal(ctx.tweens)
  bubbles.forEach((b, i) => reveal.add(b.c, i + 1, { y: 30, s: 0.96 }))
  const scrollTo = (step: number, animate: boolean) => {
    const last = bubbles[step - 1]
    const target = last ? Math.min(0, 1000 - last.bottom) : 0
    ctx.tweens.cancel(stream)
    if (!animate) return void (stream.y = target)
    const from = stream.y
    ctx.tweens.add({ owner: stream, target: stream, duration: 420, ease: ease.inOutSine, update: (k) => (stream.y = lerp(from, target, k)) })
  }
  return {
    view: v,
    steps: bubbles.length,
    setStep: (step, animate) => {
      reveal.set(step, animate)
      scrollTo(step, animate)
    },
    destroy: () => v.destroy({ children: true })
  }
}

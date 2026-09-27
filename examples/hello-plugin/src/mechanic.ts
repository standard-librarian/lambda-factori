/**
 * Renders `hello/counter`: a big number that counts from `from` to `to` as
 * the deck's presenter steps through it. Demonstrates the two things a
 * third-party mechanic needs and nothing more: `SlideContext.host.pixi` to
 * reach real Pixi constructors (no bundled copy of pixi.js of its own), and
 * `defineMechanic` (from `@lambda-factori/kernel/mechanic.ts`) for schema
 * validation with a readable error.
 */
import { defineMechanic } from "@lambda-factori/kernel/mechanic.ts"
import type { SlideContext, SlideView } from "@lambda-factori/kernel/Slide.ts"
import { counterTemplate } from "./counterTemplate.ts"
import { HelloCounterSlide } from "./schema.ts"

const render = (slide: HelloCounterSlide, ctx: SlideContext): SlideView => {
  // Not `fullBleed`, so the deck's own chrome already painted `slide.title`; this mechanic
  // only owns the content area below it (`CONTENT_TOP`, from `@lambda-factori/kernel/Slide.ts`).
  const { Container, Text } = ctx.host.pixi
  const view = new Container()
  const number = new Text({
    text: String(slide.from),
    style: { fontFamily: "sans-serif", fontSize: 220, fill: 0xd0342c, fontWeight: "700" }
  })
  number.anchor.set(0.5)
  number.position.set(960, 540)
  view.addChild(number)
  return {
    view,
    steps: Math.max(0, slide.to - slide.from),
    setStep: (step) => (number.text = String(slide.from + step)),
    destroy: () => view.destroy({ children: true })
  }
}

export const counter = defineMechanic(HelloCounterSlide, render, { template: counterTemplate })

import { mechanic } from "../../engine/mechanics.ts"
import { para } from "./slides/common.ts"
import { Container } from "pixi.js"
import { palette } from "../../render/theme.ts"
import type { Slide } from "@lambda-factori/contracts/Deck.ts"
import { codeSlide } from "./slides/code.ts"
import type { SlideContext, SlideView } from "./slides/common.ts"
import { curveSlide, theaterSlide } from "./slides/curve.ts"
import { decisionsSlide } from "./slides/decisions.ts"
import { lineSlide } from "./slides/line.ts"
import { factorySlide, modulesSlide } from "./slides/modules.ts"
import {
  bulletsSlide,
  dialogueSlide,
  measureSlide,
  pollSlide,
  quoteSlide,
  sectionSlide,
  titleSlide,
  versusSlide
} from "./slides/text.ts"

/** The registry of slide mechanics: one renderer per slide kind. */
export const renderSlide = (s: Slide, ctx: SlideContext): SlideView => {
  switch (s.kind) {
    case "title":
      return titleSlide(s, ctx)
    case "section":
      return sectionSlide(s)
    case "bullets":
      return bulletsSlide(s, ctx)
    case "quote":
      return quoteSlide(s)
    case "dialogue":
      return dialogueSlide(s, ctx)
    case "code":
      return codeSlide(s, ctx)
    case "modules":
      return modulesSlide(s, ctx)
    case "factory":
      return factorySlide(s, ctx)
    case "decisions":
      return decisionsSlide(s, ctx)
    case "line":
      return lineSlide(s, ctx)
    case "curve":
      return curveSlide(s, ctx)
    case "poll":
      return pollSlide(s, ctx)
    case "theater":
      return theaterSlide(s, ctx)
    case "measure":
      return measureSlide(s, ctx)
    case "versus":
      return versusSlide(s, ctx)
    default: {
      const m = mechanic(s.kind)
      try {
        if (!m) throw new Error(`no mechanic loaded for “${s.kind}”`)
        return m.render(s, ctx)
      } catch (e) {
        // A broken plugin slide must never take the whole deck down.
        const v = new Container()
        const t = para(`this slide couldn't render (${s.kind}):\n${e instanceof Error ? e.message : String(e)}`, 30, palette.bad, 1500, "600", "center")
        t.position.set(960, 420)
        v.addChild(t)
        return { view: v, steps: 0, setStep: () => {}, destroy: () => v.destroy({ children: true }) }
      }
    }
  }
}

/** Slide kinds that paint their own full-bleed background and title. */
export const ownsChrome = (s: Slide) => s.kind === "title" || s.kind === "section" || mechanic(s.kind)?.fullBleed === true

export const slideTitle = (s: Slide, i: number): string =>
  s.title ?? (s.kind === "quote" ? `“${s.quote.slice(0, 40)}…”` : s.kind === "poll" ? s.question : `slide ${i + 1}`)

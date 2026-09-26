/**
 * The registry of slide kinds. Every core kind has exactly one entry here: how
 * to render it and whether it paints its own chrome (its editor template lives
 * in `templates.ts`, which is pure data so tests can check it). The table's type is mapped over the schema's kinds
 * (`@lambda-factori/contracts/Deck.ts`), so adding a kind there fails to
 * compile until it is registered here. Plugin kinds (`<plugin>/<mechanic>`)
 * are looked up in the `mechanics` map the deck resolved for this deck
 * (`host.mechanics`, see `plugin.ts`) instead.
 */
import { Container } from "pixi.js"
import type { CoreKind, Slide, SlideOf } from "@lambda-factori/contracts/Deck.ts"
import type { Mechanic, SlideContext, SlideView } from "../../kernel/Slide.ts"
import { palette } from "../../ui/theme.ts"
import { codeSlide } from "./slides/code.ts"
import { para } from "../../ui/text.ts"
import { curveSlide } from "./slides/curve.ts"
import { decisionsSlide } from "./slides/decisions.ts"
import { lineSlide } from "./slides/line.ts"
import { factorySlide } from "./slides/factory.ts"
import { modulesSlide } from "./slides/modules.ts"
import { bulletsSlide } from "./slides/bullets.ts"
import { dialogueSlide } from "./slides/dialogue.ts"
import { measureSlide } from "./slides/measure.ts"
import { pollSlide } from "./slides/poll.ts"
import { quoteSlide } from "./slides/quote.ts"
import { sectionSlide } from "./slides/section.ts"
import { titleSlide } from "./slides/title.ts"
import { versusSlide } from "./slides/versus.ts"

interface SlideKind<K extends CoreKind> {
  readonly render: (s: SlideOf<K>, ctx: SlideContext) => SlideView
  /** Paints its own full-bleed background and title (no paper, no deck title). */
  readonly ownsChrome?: true
}

export const slideKinds: { readonly [K in CoreKind]: SlideKind<K> } = {
  title: { render: titleSlide, ownsChrome: true },
  section: { render: sectionSlide, ownsChrome: true },
  bullets: { render: bulletsSlide },
  quote: { render: quoteSlide },
  dialogue: { render: dialogueSlide },
  code: { render: codeSlide },
  modules: { render: modulesSlide },
  factory: { render: factorySlide },
  decisions: { render: decisionsSlide },
  line: { render: lineSlide },
  curve: { render: curveSlide },
  poll: { render: pollSlide },
  measure: { render: measureSlide },
  versus: { render: versusSlide }
}

const isCore = (kind: string): kind is CoreKind => kind in slideKinds

export const renderSlide = (s: Slide, ctx: SlideContext, mechanics: ReadonlyMap<string, Mechanic>): SlideView => {
  if (isCore(s.kind)) {
    // The table pairs each kind with its own renderer; TypeScript can't correlate the two here.
    const render = slideKinds[s.kind].render as (s: Slide, ctx: SlideContext) => SlideView
    return render(s, ctx)
  }
  const m = mechanics.get(s.kind)
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

/** Whether a slide paints its own full-bleed background and title. */
export const ownsChrome = (s: Slide, mechanics: ReadonlyMap<string, Mechanic>) =>
  isCore(s.kind) ? slideKinds[s.kind].ownsChrome === true : mechanics.get(s.kind)?.fullBleed === true

export const slideTitle = (s: Slide, i: number): string =>
  s.title ?? (s.kind === "quote" ? `“${s.quote.slice(0, 40)}…”` : s.kind === "poll" ? s.question : `slide ${i + 1}`)

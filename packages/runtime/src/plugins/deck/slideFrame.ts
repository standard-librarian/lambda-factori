/**
 * What surrounds a rendered slide: the graph-paper background and the title
 * with its red underline (unless the slide paints its own chrome), and the
 * slide's sticky note, which pops in at its build step.
 */
import { Container, Graphics } from "pixi.js"
import type { Slide } from "@lambda-factori/contracts/Deck.ts"
import type { Mechanic, SlideView } from "../../kernel/Slide.ts"
import { ease, lerp, type Tweens } from "../../kernel/tween.ts"
import { paperArt, skylineArt } from "../../ui/backdrop.ts"
import { DESIGN_H, DESIGN_W, palette } from "../../ui/theme.ts"
import { ownsChrome } from "./render.ts"
import { MARGIN, stickyNote } from "./slides/common.ts"
import { para } from "../../ui/text.ts"

/** Frame `view` for slide `s`. The returned view's `setStep` also drives the sticky note. */
export const frameSlide = (s: Slide, view: SlideView, tweens: Tweens, mechanics: ReadonlyMap<string, Mechanic>): { frame: Container; view: SlideView } => {
  const frame = new Container()
  if (!ownsChrome(s, mechanics)) {
    frame.addChild(paperArt(DESIGN_W, DESIGN_H), skylineArt(DESIGN_W, DESIGN_H + 30, 0xe9e2d6))
    if (s.title && s.kind !== "quote") {
      const t = para(s.title, s.title.length > 48 ? 50 : 62, palette.ink, DESIGN_W - MARGIN * 2 - 380, "700")
      t.position.set(MARGIN - 40, 70)
      frame.addChild(t, new Graphics().roundRect(MARGIN - 40, 70 + t.height + 10, 120, 10, 5).fill(palette.red))
    }
  }
  frame.addChild(view.view)
  if (!s.sticky) return { frame, view }

  const note = stickyNote(s.sticky.text)
  note.position.set(s.sticky.x ?? DESIGN_W - 240, s.sticky.y ?? 40)
  frame.addChild(note)
  const at = s.sticky.step ?? 0
  const baseY = note.y
  const setStep: SlideView["setStep"] = (step, animate) => {
    view.setStep(step, animate)
    const show = step >= at
    if (show && !note.visible && animate) {
      note.visible = true
      tweens.add({ target: note, duration: 420, ease: ease.outBack, update: (k) => {
        note.alpha = Math.min(1, k * 2)
        note.y = lerp(baseY - 40, baseY, k)
      } })
    } else note.visible = show
  }
  return { frame, view: { ...view, setStep } }
}

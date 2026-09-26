/**
 * Small pieces every deck slide kind shares: named colours, the deck's card
 * and sticky-note art, an avatar, and the reveal-on-step animation. Deck-only
 * — `para`, the one piece the host also needs for its shared-pack card, lives
 * in `ui/text.ts` instead.
 */
import { Container, Graphics } from "pixi.js"
import type { SlideView } from "../../../kernel/Slide.ts"
import { label } from "../../../ui/label.ts"
import { palette } from "../../../ui/theme.ts"
import { para } from "../../../ui/text.ts"
import { ease, lerp, type Tweens } from "../../../kernel/tween.ts"

const named: Record<string, number> = {
  red: palette.red,
  blue: palette.blue,
  green: palette.green,
  yellow: palette.yellow,
  orange: 0xee8d56,
  teal: 0x2fa7a0,
  plum: 0x9b5fc0,
  indigo: 0x4f56b8,
  ink: palette.ink,
  periwinkle: palette.token,
  grey: 0x8a8fb0
}

export const color = (c: string | undefined, fallback: number): number => {
  if (!c) return fallback
  if (c in named) return named[c]!
  const hex = c.replace(/^#/, "")
  const n = Number.parseInt(hex, 16)
  return Number.isNaN(n) ? fallback : n
}

/** Darker shade of a colour, for lips and bands. */
export const shade = (c: number, k = 0.72) => {
  const r = ((c >> 16) & 255) * k
  const g = ((c >> 8) & 255) * k
  const b = (c & 255) * k
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}

export const SERIF = "Georgia, 'Times New Roman', serif"
export const MONO = "BQN386, Menlo, monospace"

/** Reveal helper: things hidden until their step, popping in when reached. */
export class Reveal {
  private readonly items: Array<{ obj: Container; step: number; from: { x: number; y: number; s: number }; shown: boolean; baseX: number; baseY: number }> = []
  private readonly tweens: Tweens

  constructor(tweens: Tweens) {
    this.tweens = tweens
  }

  add(obj: Container, step: number, from: { x?: number; y?: number; s?: number } = { y: 24 }) {
    this.items.push({ obj, step, from: { x: from.x ?? 0, y: from.y ?? 0, s: from.s ?? 1 }, shown: true, baseX: obj.x, baseY: obj.y })
    return obj
  }

  set(step: number, animate: boolean) {
    for (const it of this.items) {
      const show = step >= it.step
      if (show === it.shown && animate) continue
      it.shown = show
      this.tweens.cancel(it.obj)
      if (!show) {
        it.obj.visible = false
        continue
      }
      it.obj.visible = true
      if (!animate) {
        it.obj.alpha = 1
        it.obj.position.set(it.baseX, it.baseY)
        it.obj.scale.set(1)
        continue
      }
      it.obj.alpha = 0
      this.tweens.add({
        owner: it.obj,
        target: it.obj,
        duration: 420,
        ease: ease.outBack,
        update: (k) => {
          it.obj.alpha = Math.min(1, k * 1.6)
          it.obj.position.set(lerp(it.baseX + it.from.x, it.baseX, k), lerp(it.baseY + it.from.y, it.baseY, k))
          it.obj.scale.set(lerp(it.from.s, 1, k))
        }
      })
    }
  }
}

/** A yellow post-it — the deck's comments, literally. */
export const stickyNote = (text: string, fill: number = 0xfde68a) => {
  const c = new Container()
  const body = para(text, 26, palette.ink, 300, "600")
  const w = 340
  const h = Math.max(150, body.height + 60)
  c.addChild(
    new Graphics().rect(6, 8, w, h).fill({ color: palette.ink, alpha: 0.12 }),
    new Graphics().rect(0, 0, w, h).fill(fill).rect(0, 0, w, 26).fill({ color: palette.white, alpha: 0.35 }),
    new Graphics().rect(w / 2 - 50, -12, 100, 26).fill({ color: palette.white, alpha: 0.55 })
  )
  body.position.set(20, 40)
  c.addChild(body)
  c.pivot.set(w / 2, 0)
  c.rotation = 0.04
  return c
}

/** A rounded card with a darker lip, the deck's basic container. */
export const cardArt = (w: number, h: number, fill: number, lip = shade(fill, 0.85), radius = 22) =>
  new Graphics().roundRect(0, 8, w, h, radius).fill(lip).roundRect(0, 0, w, h, radius).fill(fill)

/** Circular avatar with initials. */
export const avatar = (initials: string, fill: number, r = 34) => {
  const c = new Container()
  c.addChild(new Graphics().circle(0, 3, r).fill(shade(fill)).circle(0, 0, r).fill(fill).stroke({ width: 4, color: palette.white }))
  c.addChild(label(initials, r * 0.8, palette.white, "700"))
  return c
}

/** A slide with no build steps (or with only a `tick`, via `extra`). */
export const staticSlide = (view: Container, extra: Partial<SlideView> = {}): SlideView => ({
  view,
  steps: 0,
  setStep: () => {},
  destroy: () => view.destroy({ children: true }),
  ...extra
})

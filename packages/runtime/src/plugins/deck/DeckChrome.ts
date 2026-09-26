/**
 * The deck's always-on chrome along the bottom edge: the deck title, a dot per
 * slide (sections larger, the current one red), the slide counter, and back /
 * forward buttons for mouse and touch.
 */
import { Container, Graphics } from "pixi.js"
import type { Slide } from "@lambda-factori/contracts/Deck.ts"
import { Button } from "../../render/Button.ts"
import { icons } from "../../render/icons.ts"
import { label, relabel } from "../../render/label.ts"
import { DESIGN_H, DESIGN_W, palette } from "../../render/theme.ts"
import type { Tweens } from "../../render/tween.ts"
import { ownsChrome } from "./render.ts"

export class DeckChrome extends Container {
  private readonly progress = new Graphics()
  private readonly counter = label("", 24, palette.inkSoft, "700", "right")
  private readonly deckTitle = label("", 22, palette.inkSoft, "600", "left")

  constructor(tweens: Tweens, nav: { readonly prev: () => void; readonly next: () => void }) {
    super()
    this.addChild(this.progress, this.counter, this.deckTitle)
    this.counter.position.set(DESIGN_W - 60, DESIGN_H - 36)
    this.deckTitle.position.set(60, DESIGN_H - 36)
    const button = (icon: (g: Graphics) => void, x: number, onTap: () => void) => {
      const b = new Button({ width: 54, height: 46, color: palette.token, shade: palette.binShade, icon, onTap }, tweens)
      b.position.set(x, DESIGN_H - 40)
      b.alpha = 0.75
      this.addChild(b)
    }
    button(icons.back, DESIGN_W - 300, nav.prev)
    button(icons.forward, DESIGN_W - 230, nav.next)
  }

  draw(title: string, slides: ReadonlyArray<Slide>, index: number) {
    relabel(this.deckTitle, title, "left")
    const n = slides.length
    const w = Math.min(900, n * 30)
    const x0 = DESIGN_W / 2 - w / 2
    const g = this.progress.clear()
    for (let i = 0; i < n - 1; i++) {
      const x = x0 + (i + 0.5) * (w / n)
      g.moveTo(x, DESIGN_H - 38).lineTo(x + w / n, DESIGN_H - 38)
    }
    g.stroke({ width: 3, color: palette.binDark, alpha: 0.18 })
    slides.forEach((s, i) => {
      const on = i === index
      g.circle(x0 + (i + 0.5) * (w / n), DESIGN_H - 38, on ? 9 : s.kind === "section" ? 7 : 5).fill(on ? palette.red : i < index ? palette.token : 0xc9c2b6)
    })
    relabel(this.counter, `${index + 1} / ${n}`, "right")
    const slide = slides[index]!
    // Plugin slides lay out their own full screen; the deck title would sit on top of them.
    this.deckTitle.visible = !slide.kind.includes("/")
    const dark = ownsChrome(slide) && slide.kind === "section"
    this.counter.style.fill = dark ? palette.white : palette.inkSoft
    this.deckTitle.style.fill = dark ? palette.white : palette.inkSoft
  }
}

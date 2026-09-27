/** Pill toasts that slide in under the bins, one at a time. */
import { Container, Graphics } from "pixi.js"
import { label } from "./label.ts"
import { palette } from "./theme.ts"
import { ease, type Tweens } from "@lambda-factori/kernel/tween.ts"

export class Toasts extends Container {
  private readonly queue: Array<{ text: string; color: number }> = []
  private busy = false
  private readonly tweens: Tweens

  constructor(tweens: Tweens) {
    super()
    this.tweens = tweens
  }

  show(text: string, color: number = palette.ink) {
    this.queue.push({ text, color })
    if (!this.busy) this.next()
  }

  private next() {
    const item = this.queue.shift()
    if (!item) {
      this.busy = false
      return
    }
    this.busy = true
    const t = label(item.text, 24, palette.white, "600")
    const w = t.width + 48
    const pill = new Container()
    pill.addChild(new Graphics().roundRect(-w / 2, -24, w, 48, 24).fill(item.color), t)
    pill.alpha = 0
    this.addChild(pill)
    this.tweens.add({
      duration: 380,
      ease: ease.outBack,
      update: (k) => {
        pill.alpha = Math.min(1, k * 1.5)
        pill.y = -24 * (1 - k)
        pill.scale.set(0.8 + 0.2 * k)
      }
    })
    this.tweens.add({
      delay: 2400,
      duration: 300,
      ease: ease.inCubic,
      update: (k) => {
        pill.alpha = 1 - k
        pill.y = -14 * k
      },
      done: () => {
        pill.destroy({ children: true })
        this.next()
      }
    })
  }
}

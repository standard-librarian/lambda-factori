/**
 * The chunky Word Factori-style button: a face with a darker lip that sinks when
 * pressed. It has a fixed hit area and taps on release, so fast clicks never miss.
 */
import { Container, Graphics, Rectangle, type Text } from "pixi.js"
import { label } from "./label.ts"
import { palette } from "./theme.ts"
import { type Tweens } from "./tween.ts"

export interface ButtonOptions {
  readonly width: number
  readonly height: number
  readonly color: number
  readonly shade: number
  readonly text?: string
  readonly fontSize?: number
  readonly textColor?: number
  readonly icon?: (g: Graphics) => void
  readonly onTap: () => void
}

/** Chunky Word Factori-style button with a darker lip that sinks when pressed. */
export class Button extends Container {
  private readonly face = new Container()
  private readonly bg = new Graphics()
  private readonly opts: ButtonOptions
  private readonly iconG = new Graphics()
  readonly text: Text | undefined
  private enabledState = true

  constructor(opts: ButtonOptions, tweens: Tweens) {
    super()
    this.opts = opts
    const { width: w, height: h } = opts
    const lip = new Graphics().roundRect(-w / 2, -h / 2 + 6, w, h, 14).fill(opts.shade)
    this.draw(opts.color)
    this.face.addChild(this.bg)
    // Tall buttons stack the icon above the label; wide ones put it on the left.
    const stacked = h >= 100
    if (opts.icon) {
      opts.icon(this.iconG)
      if (opts.text) {
        if (stacked) this.iconG.position.set(0, -h * 0.17)
        else this.iconG.x = -w / 2 + h / 2 + 4
      }
      this.face.addChild(this.iconG)
    }
    if (opts.text) {
      this.text = label(opts.text, opts.fontSize ?? 28, opts.textColor ?? palette.white)
      if (opts.icon) {
        if (stacked) this.text.y = h * 0.22
        else this.text.x = h / 3
      }
      this.face.addChild(this.text)
    }
    this.addChild(lip, this.face)
    this.eventMode = "static"
    this.cursor = "pointer"
    // A fixed hit area: the face moves when hovered and pressed, and if the hit
    // shape moved with it, clicks near an edge would miss on release (and hover
    // would flicker on and off).
    this.hitArea = new Rectangle(-w / 2, -h / 2 - 4, w, h + 12)
    this.interactiveChildren = false
    const to = (y: number) => {
      tweens.cancel(this)
      const from = this.face.y
      tweens.add({ owner: this, duration: 90, update: (t) => (this.face.y = from + (y - from) * t) })
    }
    let pressed = false
    this.on("pointerover", () => this.enabledState && to(-2))
    this.on("pointerout", () => to(0))
    this.on("pointerdown", (e) => {
      if (!this.enabledState || e.button === 2) return
      e.stopPropagation()
      pressed = true
      to(5)
    })
    this.on("pointerup", () => {
      to(-2)
      if (pressed && this.enabledState) opts.onTap()
      pressed = false
    })
    this.on("pointerupoutside", () => {
      pressed = false
      to(0)
    })
  }

  private draw(color: number) {
    const { width: w, height: h } = this.opts
    this.bg.clear().roundRect(-w / 2, -h / 2, w, h, 14).fill(color)
  }

  set enabled(v: boolean) {
    this.enabledState = v
    this.alpha = v ? 1 : 0.45
    this.cursor = v ? "pointer" : "default"
  }

  setIcon(icon: (g: Graphics) => void) {
    icon(this.iconG.clear())
  }

  highlight(on: boolean) {
    this.draw(on ? this.opts.shade : this.opts.color)
  }
}

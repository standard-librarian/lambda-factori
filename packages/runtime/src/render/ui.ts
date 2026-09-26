import { Container, Graphics, Rectangle, type Text } from "pixi.js"
import { label } from "./art.ts"
import { palette } from "./theme.ts"
import { ease, type Tweens } from "./tween.ts"

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

export const icons = {
  play: (g: Graphics) => g.poly([-9, -13, 14, 0, -9, 13]).fill(palette.white),
  fast: (g: Graphics) => g.poly([-16, -12, 0, 0, -16, 12]).poly([0, -12, 16, 0, 0, 12]).fill(palette.white),
  pause: (g: Graphics) => g.roundRect(-11, -13, 8, 26, 3).roundRect(3, -13, 8, 26, 3).fill(palette.white),
  stop: (g: Graphics) => g.roundRect(-11, -11, 22, 22, 4).fill(palette.white),
  menu: (g: Graphics) => g.roundRect(-13, -11, 26, 5, 2).roundRect(-13, -2, 26, 5, 2).roundRect(-13, 7, 26, 5, 2).fill(palette.white),
  back: (g: Graphics) => g.poly([4, -12, -8, 0, 4, 12], false).stroke({ width: 5, color: palette.white, cap: "round", join: "round" }),
  forward: (g: Graphics) => g.poly([-4, -12, 8, 0, -4, 12], false).stroke({ width: 5, color: palette.white, cap: "round", join: "round" }),
  book: (g: Graphics) =>
    g.roundRect(-14, -11, 13, 22, 3).roundRect(1, -11, 13, 22, 3).fill(palette.white).rect(-1, -11, 2, 22).fill(
      palette.ink
    ),
  restart: (g: Graphics) =>
    g.arc(0, 0, 12, -Math.PI * 0.35, Math.PI * 1.35).stroke({ width: 5, color: palette.white, cap: "round" })
      .poly([7, -17, 14, -6, 3, -5]).fill(palette.white),
  close: (g: Graphics) =>
    g.moveTo(-10, -10).lineTo(10, 10).moveTo(10, -10).lineTo(-10, 10).stroke({ width: 5, color: palette.white, cap: "round" }),
  eye: (g: Graphics) =>
    g.ellipse(0, 0, 15, 10).stroke({ width: 4, color: palette.white }).circle(0, 0, 4.5).fill(palette.white),
  pencil: (g: Graphics) =>
    g.poly([-12, 12, -9, 3, 6, -12, 12, -6, -3, 9]).fill(palette.white).poly([-12, 12, -9, 3, -3, 9]).fill(0x20234b),
  scroll: (g: Graphics) =>
    g.roundRect(-11, -14, 22, 28, 3).fill(palette.white)
      .rect(-6, -7, 12, 2.5).rect(-6, -1, 12, 2.5).rect(-6, 5, 8, 2.5).fill(0xc8902c),
  star: (g: Graphics) => g.star(0, 0, 5, 14, 6).fill(palette.white),
  hint: (g: Graphics) => g.circle(0, 0, 13).stroke({ width: 4, color: palette.white }).circle(0, 6, 2).fill(palette.white).rect(-1.5, -7, 3, 9).fill(palette.white)
}

/** Pill toasts that slide in under the bins, one at a time. */
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

interface Puff {
  readonly g: Graphics
  vx: number
  vy: number
  life: number
  readonly max: number
  readonly size: number
}

/** Chimney smoke: puffs rise, drift, grow and fade — the "machines chug along" feel. */
export class Smoke extends Container {
  private readonly puffs: Array<Puff> = []

  puff(x: number, y: number, color: number, size = 9) {
    const g = new Graphics().circle(0, 0, size).fill(color)
    g.position.set(x, y)
    this.addChild(g)
    this.puffs.push({ g, vx: (Math.random() - 0.3) * 0.02, vy: -0.035 - Math.random() * 0.02, life: 0, max: 900 + Math.random() * 400, size })
  }

  tick(dt: number) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!
      p.life += dt
      const k = p.life / p.max
      p.g.x += p.vx * dt
      p.g.y += p.vy * dt
      p.g.scale.set(0.4 + k * 1.1)
      p.g.alpha = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85
      if (k >= 1) {
        p.g.destroy()
        this.puffs.splice(i, 1)
      }
    }
  }
}

/** A ring that expands and fades, used for port pulses and pops. */
export const ring = (parent: Container, tweens: Tweens, x: number, y: number, color: number, radius = 16) => {
  const g = new Graphics().circle(0, 0, radius).stroke({ width: 4, color })
  g.position.set(x, y)
  parent.addChild(g)
  tweens.add({
    duration: 420,
    update: (k) => {
      g.scale.set(0.5 + k)
      g.alpha = 1 - k
    },
    done: () => g.destroy()
  })
}

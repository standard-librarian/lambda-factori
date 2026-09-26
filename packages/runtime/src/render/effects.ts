/** Small ambient effects: chimney smoke and the expanding ring used for pulses and pops. */
import { Container, Graphics } from "pixi.js"
import { type Tweens } from "../kernel/tween.ts"

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

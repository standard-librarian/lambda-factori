import { Container } from "pixi.js"
import { stickerArt } from "./factoryArt.ts"

interface Body {
  readonly view: Container
  vx: number
  vy: number
  vr: number
  resting: boolean
}

const SIZE = 52
const GRAVITY = 0.0028

/**
 * Earned stickers tumble into the tray and pile up, like Word Factori's
 * sticker tiles collecting at the side of the floor.
 */
export class StickerPile extends Container {
  private readonly bodies: Array<Body> = []
  private readonly heights: Array<number>
  private readonly w: number

  constructor(width: number, floor: number) {
    super()
    this.w = width
    this.heights = Array.from({ length: Math.floor(width / (SIZE * 0.9)) }, () => floor)
  }

  /** Drop a sticker from (x, y) in pile coordinates. `instant` places it at rest. */
  drop(glyph: string, color: number, x: number, y: number, instant = false) {
    const view = stickerArt(glyph, undefined, color, SIZE)
    view.position.set(x, y)
    view.rotation = (Math.random() - 0.5) * 0.6
    this.addChild(view)
    const body: Body = { view, vx: (Math.random() - 0.5) * 0.25, vy: -0.4, vr: (Math.random() - 0.5) * 0.012, resting: false }
    this.bodies.push(body)
    if (instant) {
      view.x = this.laneCenter(this.lowestLane())
      this.land(body)
    }
  }

  private lowestLane() {
    let best = 0
    this.heights.forEach((h, i) => {
      if (h > this.heights[best]!) best = i
    })
    return best
  }

  private laneOf(x: number) {
    return Math.max(0, Math.min(this.heights.length - 1, Math.floor(x / (this.w / this.heights.length))))
  }

  private laneCenter(i: number) {
    return (i + 0.5) * (this.w / this.heights.length) + (Math.random() - 0.5) * 8
  }

  private land(b: Body) {
    const lane = this.laneOf(b.view.x)
    b.view.y = this.heights[lane]! - SIZE / 2 - 4
    this.heights[lane] = b.view.y - SIZE / 2 + 6
    b.view.rotation = (Math.random() - 0.5) * 0.35
    b.resting = true
  }

  tick(dt: number) {
    for (const b of this.bodies) {
      if (b.resting) continue
      b.vy += GRAVITY * dt
      b.view.x = Math.max(SIZE / 2, Math.min(this.w - SIZE / 2, b.view.x + b.vx * dt))
      b.view.y += b.vy * dt
      b.view.rotation += b.vr * dt
      const lane = this.laneOf(b.view.x)
      if (b.view.y + SIZE / 2 >= this.heights[lane]!) {
        if (b.vy > 0.35) {
          // One little bounce before settling.
          b.vy = -b.vy * 0.3
          b.vr *= -0.5
          b.view.y = this.heights[lane]! - SIZE / 2
        } else {
          this.land(b)
        }
      }
    }
  }
}

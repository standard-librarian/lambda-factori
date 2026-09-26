/**
 * Speech bubbles in the office: the worker says or thinks, the boss speaks or
 * scolds, a clerk answers from their desk. One voice at a time, as in Human
 * Resource Machine: a new line fades everyone else out.
 */
import type { Container } from "pixi.js"
import { ease, lerp, type Tweens } from "../../kernel/tween.ts"
import { bubbleArt } from "./bubbleArt.ts"
import { WORKER_SCALE } from "./layout.ts"
import type { Room } from "./Room.ts"

export class Speech {
  private worker: Container | undefined
  private boss: Container | undefined
  private readonly clerks = new Map<string, Container>()
  private readonly room: Room
  private readonly tweens: Tweens

  constructor(room: Room, tweens: Tweens) {
    this.room = room
    this.tweens = tweens
  }

  say(text: string, tone: "say" | "think" | "error" = "say") {
    const w = this.room.worker.root
    const right = w.x > 900
    this.worker = this.pop(bubbleArt(text, 440, right ? "right" : "left", tone), w.x + (right ? -10 : 10), w.y - 205 * WORKER_SCALE)
  }

  bossSays(text: string, tone: "say" | "error" = "say") {
    this.boss = this.pop(bubbleArt(text, 480, "right", tone), this.room.boss.x - 60, this.room.boss.y - 90)
  }

  clerkSays(desk: string, text: string) {
    const d = this.room.deskPos.get(desk)
    if (!d) return
    const right = d.x > 700
    this.clerks.set(desk, this.pop(bubbleArt(text, 520, right ? "right" : "left", "say"), d.x + (right ? -20 : 20), d.y - 70))
  }

  /** Fade the worker's bubble (they've moved on to the next command). */
  fadeWorker() {
    const b = this.worker
    if (b) this.tweens.add({ target: b, duration: 200, update: (k) => (b.alpha = 1 - k) })
  }

  clear() {
    for (const b of [this.worker, this.boss, ...this.clerks.values()]) b?.destroy({ children: true })
    this.worker = undefined
    this.boss = undefined
    this.clerks.clear()
  }

  /** Hush everyone, then pop a new bubble in at (x, y). */
  private pop(bubble: Container, x: number, y: number) {
    this.hush()
    bubble.position.set(x, y)
    bubble.scale.set(0.6)
    this.room.fx.addChild(bubble)
    this.tweens.add({ target: bubble, duration: 260, ease: ease.outBack, update: (k) => bubble.scale.set(lerp(0.6, 1, k)) })
    return bubble
  }

  private hush() {
    for (const b of [this.worker, this.boss, ...this.clerks.values()]) {
      if (!b || b.destroyed) continue
      this.tweens.add({ target: b, duration: 180, update: (k) => (b.alpha = 1 - k), done: () => b.destroy({ children: true }) })
    }
    this.worker = undefined
    this.boss = undefined
    this.clerks.clear()
  }
}

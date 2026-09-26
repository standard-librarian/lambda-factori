/**
 * The office's moving parts: the boxes on the belts and tiles, what the worker
 * holds, where they stand, and the motions everything is built from (walk,
 * stomp, hop, fly, poof, belt shifts). `snap` sets the whole room to a VM
 * state at once; motions animate from there.
 *
 * `gen` guards against stale animations: every jump or replay bumps it, and a
 * motion started under an older generation stops touching the stage.
 */
import type { Container } from "pixi.js"
import { ease, lerp, type Tweens } from "../../kernel/tween.ts"
import { boxArt } from "./roomArt.ts"
import { CARRY_Y } from "./peopleArt.ts"
import { inSlot, outSlot, type Pt, SLOT, WORKER_SCALE } from "./layout.ts"
import type { Belt, Room } from "./Room.ts"
import type { State } from "./vm.ts"
import type { Value } from "./program.ts"

/** A promise-returning tween, so action scripts read top to bottom. */
export const tweenP = (tweens: Tweens, target: Container, ms: number, update: (k: number) => void, e = ease.inOutSine) =>
  new Promise<void>((resolve) => tweens.add({ target, duration: ms, ease: e, update, done: resolve }))

export class Performer {
  inboxViews: Array<Container> = []
  outboxViews: Array<Container> = []
  readonly tileViews = new Map<string, Container>()
  handView: Container | undefined
  /** Where the worker last went. */
  place: Pt
  /** Animation generation; see the module comment. */
  gen = 0
  /** Playback speed multiplier (4 while fast-forwarding). */
  speed: number
  /** True while walking, so idle glances don't fight the walk. */
  moving = false
  readonly room: Room
  readonly tweens: Tweens

  constructor(room: Room, tweens: Tweens, speed: number) {
    this.room = room
    this.tweens = tweens
    this.speed = speed
    this.place = room.home
  }

  /** Real duration of a `t` ms beat at the current speed. */
  ms(t: number) {
    return t / this.speed
  }

  /** The box in the worker's hands, in room coordinates. */
  handWorld(): Pt {
    return { x: this.room.worker.root.x, y: this.room.worker.root.y + CARRY_Y * WORKER_SCALE }
  }

  setHand(value: Value | undefined) {
    this.handView?.destroy({ children: true })
    this.handView = undefined
    this.room.worker.setArms(value !== undefined)
    if (value === undefined) return
    this.handView = boxArt(value)
    this.room.worker.carry.addChild(this.handView)
  }

  /** Take whatever is in hand out of the worker's arms, into the room's fx layer. */
  releaseHand(): Container | undefined {
    const hv = this.handView
    if (!hv) return undefined
    this.handView = undefined
    this.room.worker.carry.removeChild(hv)
    hv.position.copyFrom(this.handWorld())
    this.room.fx.addChild(hv)
    return hv
  }

  /** A new box resting at `at` (on a belt or tile). */
  addBox(value: Value, at: Pt, layer: "items" | "fx" = "items") {
    const b = boxArt(value)
    b.position.copyFrom(at)
    this.room[layer].addChild(b)
    return b
  }

  /** Set the whole room to a VM state, with the worker standing at `where`. */
  snap(s: State, where: string | undefined) {
    for (const b of [...this.inboxViews, ...this.outboxViews, ...this.tileViews.values()]) b.destroy({ children: true })
    this.inboxViews = s.inbox.slice(0, 9).map((val, i) => this.addBox(val, inSlot(i)))
    // The newest outbox item sits at the top of the belt.
    this.outboxViews = [...s.outbox].reverse().slice(0, 9).map((val, i) => this.addBox(val, outSlot(i)))
    this.tileViews.clear()
    s.tiles.forEach((val, id) => {
      const p = this.room.tilePos.get(id)
      if (p && val !== undefined) this.tileViews.set(id, this.addBox(val, p))
    })
    this.setHand(s.hand)
    this.place = this.room.spotOf(where, this.place)
    this.room.worker.root.position.copyFrom(this.place)
  }

  async walk(to: Pt, g: number) {
    const w = this.room.worker
    const from = { x: w.root.x, y: w.root.y }
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    if (dist < 4) return
    const strides = Math.max(2, Math.round(dist / 70))
    w.look(Math.sign(to.x - from.x) * 0.8, Math.sign(to.y - from.y) * 0.5)
    const carrying = this.handView !== undefined
    this.moving = true
    await tweenP(this.tweens, w.root, this.ms(Math.max(220, dist / 0.95)), (k) => {
      if (g !== this.gen) return
      w.root.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k))
      // A quick shuffle: two bounces per stride, a side-to-side waddle, the head lagging a little.
      const phase = Math.sin(k * Math.PI * strides)
      const bounce = Math.abs(phase)
      w.body.y = -bounce * 6
      w.head.y = -bounce * 9
      w.carry.y = CARRY_Y - bounce * 9
      w.root.rotation = phase * 0.07
      w.head.rotation = -phase * 0.04
      w.legs[0].rotation = phase * 0.55
      w.legs[1].rotation = -phase * 0.55
      if (!carrying) w.setArms(false, phase)
    }, ease.linear)
    w.body.y = 0
    w.head.y = 0
    w.head.rotation = 0
    w.carry.y = CARRY_Y
    w.root.rotation = 0
    w.legs[0].rotation = 0
    w.legs[1].rotation = 0
    if (!carrying) w.setArms(false)
    w.look(0, 0)
    this.moving = false
  }

  /** Squash down, stretch up: the stomp every tile command does. */
  stomp(g: number) {
    const root = this.room.worker.root
    return tweenP(this.tweens, root, this.ms(260), (k) => {
      if (g !== this.gen) return
      const s = ease.bump(k)
      root.scale.set(WORKER_SCALE * (1 + s * 0.12), WORKER_SCALE * (1 - s * 0.14))
    }, ease.linear).then(() => root.scale.set(WORKER_SCALE))
  }

  /** A little jump for joy. */
  hop(g: number) {
    const w = this.room.worker
    return tweenP(this.tweens, w.root, this.ms(300), (k) => {
      if (g !== this.gen) return
      w.body.y = -ease.bump(k) * 26
      w.head.y = -ease.bump(k) * 30
      w.carry.y = CARRY_Y - ease.bump(k) * 30
    }, ease.linear)
  }

  /** Fly a box along an arc to `to`. */
  async fly(box: Container, to: Pt, dur: number, arc = 60) {
    const from = { x: box.x, y: box.y }
    await tweenP(this.tweens, box, this.ms(dur), (k) => box.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k) - Math.sin(Math.PI * k) * arc))
  }

  /** Swell, fade and remove a box. */
  poof(box: Container) {
    this.tweens.add({ target: box, duration: this.ms(220), update: (k) => {
      box.scale.set(1 + k * 0.4)
      box.alpha = 1 - k
    }, done: () => box.destroy({ children: true }) })
  }

  /** Slide belt boxes to their slots and roll the belt by one slot (`dir` ±1). */
  shiftBelt(views: ReadonlyArray<Container>, slot: (i: number) => Pt, belt: Belt, dir: number) {
    views.forEach((b, i) => {
      const to = slot(i)
      const from = { x: b.x, y: b.y }
      this.tweens.add({ target: b, duration: this.ms(260), update: (k) => b.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k)) })
    })
    this.tweens.add({ target: belt.rollers, duration: this.ms(260), update: (k) => belt.drawRollers(k * SLOT * dir) })
  }

  /** Swell a box once (a new value landed in it). */
  pulse(box: Container, amount: number) {
    this.tweens.add({ target: box, duration: this.ms(260), ease: ease.linear, update: (k) => box.scale.set(1 + ease.bump(k) * amount) })
  }
}

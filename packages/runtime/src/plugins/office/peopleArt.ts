/**
 * The office's people: the big-headed worker with enormous eyes (with a rig
 * for walking, carrying, looking and blinking), the boss behind his desk, and
 * a coworker at each desk.
 */
import { Container, Graphics } from "pixi.js"
import { label } from "../../render/label.ts"
import { office, shadeOf } from "./officePalette.ts"

export interface WorkerArt {
  readonly root: Container
  readonly body: Container
  readonly head: Container
  readonly eyes: Container
  readonly pupils: ReadonlyArray<Graphics>
  readonly lids: Graphics
  readonly legs: readonly [Graphics, Graphics]
  readonly arms: Graphics
  readonly carry: Container
  setArms(up: boolean, swing?: number): void
  look(dx: number, dy: number): void
  blink(k: number): void
}

/** Where a carried box sits, above the worker's head (local coordinates, feet at 0). */
export const CARRY_Y = -170

const HAIR = [0x2e211a, 0x5a3a24, 0x8a4b2a, 0x1e1b1a, 0xc9a26a]
const SHIRTS = [0x3f4d6b, 0x5b6f3a, 0x7a3b33, 0x55505a, 0x2f5c63]

/**
 * The worker: an oversized, softly shaded head on a stubby little body, huge
 * eyes under sleepy lids, shoes, a tie. Legs pivot at the hip and arms swing
 * so walks read as a quick shuffle rather than a glide.
 */
export const workerArt = (style = 0): WorkerArt => {
  const root = new Container()
  const shadow = new Graphics().ellipse(0, 2, 38, 11).fill({ color: 0x000000, alpha: 0.24 })
  const body = new Container()
  const leg = () => new Graphics().roundRect(-4.5, 0, 9, 17, 4).fill(0x2a2522).ellipse(1.5, 17, 8, 5).fill(0x141110)
  const legL = leg()
  const legR = leg()
  legL.position.set(-9, -19)
  legR.position.set(9, -19)
  const shirt = SHIRTS[style % SHIRTS.length]!
  const torso = new Graphics()
    .roundRect(-21, -56, 42, 40, 13).fill(shirt)
    .roundRect(-21, -24, 42, 8, 4).fill({ color: 0x000000, alpha: 0.18 })
    .poly([-9, -56, 9, -56, 0, -44]).fill(0xf4efe6)
    .poly([-3, -50, 3, -50, 5, -28, 0, -23, -5, -28]).fill(0x9b2d2d)
  const arms = new Graphics()
  body.addChild(legL, legR, torso, arms)
  const head = new Container()
  const hairColor = HAIR[style % HAIR.length]!
  const skull = new Graphics()
    .ellipse(-45, -100, 8, 12).fill(office.skinShade).ellipse(45, -100, 8, 12).fill(office.skinShade)
    .ellipse(0, -100, 47, 45).fill(office.skin)
    .ellipse(0, -80, 40, 24).fill({ color: office.skinShade, alpha: 0.45 })
    .ellipse(-16, -124, 18, 11).fill({ color: 0xffffff, alpha: 0.18 })
  const hair = new Graphics()
  if (style % 3 === 0) hair.ellipse(0, -136, 42, 17).fill(hairColor).poly([-36, -130, -16, -160, 0, -138, 18, -162, 38, -128]).fill(hairColor)
  else if (style % 3 === 1) hair.ellipse(0, -134, 45, 19).fill(hairColor).ellipse(-42, -116, 12, 22).fill(hairColor).ellipse(42, -116, 12, 22).fill(hairColor)
  else hair.ellipse(-8, -137, 40, 15).fill(hairColor).ellipse(28, -141, 17, 12).fill(hairColor)
  const eyes = new Container()
  const pupils: Array<Graphics> = []
  for (const x of [-17, 17]) {
    const e = new Graphics().ellipse(x, -104, 16, 19).fill(0xffffff).stroke({ width: 2.5, color: office.ink })
    const p = new Graphics().circle(0, 0, 4.6).fill(office.ink)
    p.position.set(x, -100)
    eyes.addChild(e, p)
    pupils.push(p)
  }
  // Heavy upper lids give the weary office stare; `blink` closes them fully.
  const rest = new Graphics()
  for (const x of [-17, 17]) rest.ellipse(x, -118, 18, 10).fill(office.skin).moveTo(x - 15, -112).quadraticCurveTo(x, -107, x + 15, -112).stroke({ width: 2.5, color: office.ink, cap: "round" })
  const lids = new Graphics()
  const mouth = new Graphics().moveTo(-7, -74).lineTo(7, -74).stroke({ width: 2.5, color: office.ink, cap: "round" })
  head.addChild(skull, hair, eyes, rest, lids, mouth)
  const carry = new Container()
  carry.position.set(0, CARRY_Y)
  root.addChild(shadow, body, head, carry)
  const setArms = (up: boolean, swing = 0) => {
    arms.clear()
    if (up) {
      arms.moveTo(-19, -50).lineTo(-27, -96).moveTo(19, -50).lineTo(27, -96).stroke({ width: 7, color: shirt, cap: "round" })
      arms.circle(-27, -100, 5).circle(27, -100, 5).fill(office.skin)
    } else {
      arms.moveTo(-19, -50).lineTo(-24 - swing * 6, -26).moveTo(19, -50).lineTo(24 - swing * 6, -26).stroke({ width: 7, color: shirt, cap: "round" })
      arms.circle(-24 - swing * 6, -23, 5).circle(24 - swing * 6, -23, 5).fill(office.skin)
    }
  }
  setArms(false)
  return {
    root,
    body,
    head,
    eyes,
    pupils,
    lids,
    legs: [legL, legR],
    arms,
    carry,
    setArms,
    look: (dx, dy) => {
      pupils.forEach((p, i) => p.position.set((i === 0 ? -17 : 17) + dx * 6, -100 + dy * 5))
    },
    blink: (k) => {
      lids.clear()
      if (k <= 0) return
      for (const x of [-17, 17]) lids.rect(x - 17, -123, 34, 38 * k).fill(office.skin)
    }
  }
}

/** The manager behind his desk, glasses and all. */
export const bossArt = () => {
  const c = new Container()
  const desk = new Graphics()
    .roundRect(-110, 0, 220, 70, 8).fill(0x3f281c)
    .roundRect(-110, -8, 220, 18, 6).fill(0x5a3a28)
    .rect(-30, -24, 60, 16).fill(0xe8e2d0)
  const head = new Graphics()
    .ellipse(0, -62, 40, 42).fill(0xe6c4a8)
    .ellipse(-40, -60, 9, 13).fill(0xe6c4a8).ellipse(40, -60, 9, 13).fill(0xe6c4a8)
    .ellipse(-28, -92, 12, 8).fill(0xd8d2c8).ellipse(28, -92, 12, 8).fill(0xd8d2c8)
    .roundRect(-34, -74, 28, 22, 8).fill(0xffffff).stroke({ width: 5, color: office.ink })
    .roundRect(6, -74, 28, 22, 8).fill(0xffffff).stroke({ width: 5, color: office.ink })
    .moveTo(-6, -66).lineTo(6, -66).stroke({ width: 5, color: office.ink })
    .circle(-20, -63, 3.5).fill(office.ink).circle(20, -63, 3.5).fill(office.ink)
    .moveTo(-12, -34).lineTo(12, -34).stroke({ width: 3, color: office.ink, cap: "round" })
  const suit = new Graphics().roundRect(-44, -26, 88, 30, 12).fill(0x2d2a33)
  c.addChild(suit, head, desk)
  return c
}

/** A coworker's desk: the stations a request travels through. */
export const deskArt = (name: string, fill = 0x6d4a36, style = 1) => {
  const c = new Container()
  const clerk = new Container()
  const face = new Graphics()
    .ellipse(0, -46, 28, 27).fill(office.skin)
    .ellipse(0, -70, 26, 10).fill(HAIR[(style + 2) % HAIR.length]!)
    .ellipse(-10, -48, 8, 9).fill(0xffffff).stroke({ width: 2, color: office.ink })
    .ellipse(10, -48, 8, 9).fill(0xffffff).stroke({ width: 2, color: office.ink })
    .circle(-10, -47, 2.6).fill(office.ink).circle(10, -47, 2.6).fill(office.ink)
  const shoulders = new Graphics().roundRect(-26, -22, 52, 24, 10).fill(SHIRTS[(style + 1) % SHIRTS.length]!)
  clerk.addChild(shoulders, face)
  clerk.scale.set(1.35)
  const top = new Graphics()
    .roundRect(-95, 0, 190, 60, 8).fill(shadeOf(fill, 0.72))
    .roundRect(-95, -10, 190, 22, 7).fill(fill)
    .rect(40, -22, 34, 14).fill(0xe8e2d0)
  const plate = new Container()
  const t = label(name, name.length > 12 ? 17 : 20, 0x2b2118, "700")
  const pw = Math.min(180, t.width + 22)
  if (t.width > pw - 12) t.scale.set((pw - 12) / t.width)
  plate.addChild(new Graphics().roundRect(-pw / 2, -14, pw, 28, 6).fill(0xe7d9b9).stroke({ width: 2, color: 0x8a6f52 }), t)
  plate.position.set(0, 34)
  c.addChild(clerk, top, plate)
  return { root: c, clerk }
}

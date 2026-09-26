/**
 * Procedural art in the spirit of Human Resource Machine: a warm, dim office
 * seen from above, wooden walls in perspective, a glowing ceiling light, green
 * number boxes, and a big-headed worker with enormous eyes. Everything is
 * drawn here; nothing is copied from the game.
 */
import { Container, Graphics, Text } from "pixi.js"
import { label } from "../../render/label.ts"
import { FONT } from "../../render/theme.ts"

export const office = {
  floor: 0xc58967,
  floorAlt: 0xbd7f5d,
  rug: 0x9b6742,
  rugLine: 0x8a5a38,
  wallBack: 0x5e3b29,
  wallLeft: 0x8b5940,
  wallRight: 0x4b2b1c,
  plank: 0x00000,
  light: 0xffc49a,
  lightCore: 0xffe2c4,
  frame: 0x403229,
  belt: 0x4a382e,
  beltEdge: 0x2c211b,
  sign: 0xd9c7a7,
  signInk: 0x3b2e25,
  box: 0x9ec75f,
  boxTop: 0xbadc80,
  boxShade: 0x74973f,
  boxInk: 0x33421a,
  letter: 0xa9b3e2,
  letterShade: 0x7f89c2,
  letterInk: 0x282c5e,
  paper: 0xbda388,
  paperLight: 0xdcd6b4,
  gutter: 0xa9907c,
  lineNo: 0x7a685a,
  cmdIo: 0x9ec75f,
  cmdIoInk: 0x3f4f1d,
  cmdCopy: 0xd1655b,
  cmdCopyInk: 0x4a2419,
  cmdMath: 0xd9a06c,
  cmdMathInk: 0x4f3219,
  cmdJump: 0x8d8dc1,
  cmdJumpInk: 0x2f3150,
  cmdTalk: 0xe8dcc4,
  cmdTalkInk: 0x4b3f33,
  cmdDesk: 0x6fb0b8,
  cmdDeskInk: 0x173c40,
  arrow: 0x8d8dc1,
  bubble: 0xf3ead8,
  bubbleInk: 0x3b3530,
  skin: 0xf0d2b8,
  skinShade: 0xd9b394,
  ink: 0x1e1a18,
  bad: 0xd94a3d,
  good: 0x7fb24a
} as const

// ---------------------------------------------------------------------------
// The room
// ---------------------------------------------------------------------------

export interface RoomGeometry {
  readonly w: number
  readonly h: number
  /** Floor rectangle (walls are outside it). */
  readonly fx: number
  readonly fy: number
  readonly fw: number
  readonly fh: number
}

export const roomArt = (g: RoomGeometry, night = false) => {
  const c = new Container()
  const { w, h, fx, fy, fw } = g
  const floor = new Graphics().rect(fx, fy, fw, h - fy).fill(office.floor)
  // Faint square floor tiles.
  const T = 64
  for (let y = fy; y < h; y += T) {
    for (let x = fx; x < fx + fw; x += T) {
      if (((x - fx) / T + (y - fy) / T) % 2 === 0) floor.rect(x, y, Math.min(T, fx + fw - x), Math.min(T, h - y)).fill(office.floorAlt)
    }
  }
  c.addChild(floor)
  // Walls in perspective: back wall, then the two side walls over it.
  const back = new Graphics().poly([0, 0, w, 0, fx + fw, fy, fx, fy]).fill(office.wallBack)
  for (let k = 1; k < 4; k++) {
    const t = k / 4
    back.moveTo(lerp(0, fx, t), lerp(0, fy, t)).lineTo(lerp(w, fx + fw, t), lerp(0, fy, t))
  }
  back.stroke({ width: 3, color: 0x000000, alpha: 0.18 })
  const left = new Graphics().poly([0, 0, fx, fy, fx, h, 0, h]).fill(office.wallLeft)
  for (let x = 24; x < fx; x += 26) left.moveTo(x, (x / fx) * fy).lineTo(x, h)
  left.stroke({ width: 2, color: 0x000000, alpha: 0.16 })
  const right = new Graphics().poly([w, 0, fx + fw, fy, fx + fw, h, w, h]).fill(office.wallRight)
  for (let x = fx + fw + 24; x < w; x += 26) right.moveTo(x, ((w - x) / (w - fx - fw)) * fy).lineTo(x, h)
  right.stroke({ width: 2, color: 0x000000, alpha: 0.2 })
  // Skirting where walls meet the floor.
  const skirt = new Graphics()
    .moveTo(fx, fy).lineTo(fx + fw, fy).moveTo(fx, fy).lineTo(fx, h).moveTo(fx + fw, fy).lineTo(fx + fw, h)
    .stroke({ width: 8, color: 0x2a1a12, alpha: 0.55 })
  c.addChild(back, left, right, skirt)
  // The ceiling light on the back wall, glowing.
  const lw = fw * 0.5
  const lx = fx + fw / 2 - lw / 2
  const light = new Graphics()
    .rect(lx - 14, 10, lw + 28, fy - 40).fill(office.frame)
    .rect(lx, 22, lw, fy - 64).fill(night ? 0x2a3140 : office.light)
  for (let k = 1; k < 3; k++) light.rect(lx + (lw / 3) * k - 5, 22, 10, fy - 64).fill(office.frame)
  if (!night) light.rect(lx + 16, 30, lw - 32, (fy - 64) * 0.35).fill({ color: office.lightCore, alpha: 0.6 })
  c.addChild(light)
  // Warm light pooling on the floor, dark corners.
  const glow = new Graphics()
  for (let k = 0; k < 6; k++) glow.ellipse(fx + fw / 2, fy + (h - fy) * 0.42, fw * (0.62 - k * 0.07), (h - fy) * (0.6 - k * 0.07)).fill({ color: 0xffe0bd, alpha: night ? 0 : 0.035 })
  const shade = new Graphics()
  for (let k = 0; k < 8; k++) shade.rect(fx, fy, fw, h - fy).stroke({ width: 40 + k * 26, color: 0x000000, alpha: 0.025, alignment: 1 })
  c.addChild(glow, shade)
  return c
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** A vertical conveyor with a wooden sign on the wall beside it. */
export const beltArt = (kind: "in" | "out", height: number) => {
  const c = new Container()
  const w = 84
  const g = new Graphics().roundRect(-w / 2 - 6, -6, w + 12, height + 12, 12).fill(office.beltEdge).rect(-w / 2, 0, w, height).fill(office.belt)
  const rollers = new Graphics()
  c.addChild(g, rollers)
  const sign = new Container()
  const board = new Graphics().roundRect(-34, -110, 68, 220, 6).fill(office.sign).stroke({ width: 3, color: 0x8a6f52 })
  const t = label(kind === "in" ? "IN" : "OUT", 44, office.signInk, "700")
  t.rotation = kind === "in" ? -Math.PI / 2 : Math.PI / 2
  t.y = kind === "in" ? 28 : -28
  const arrow = new Graphics()
  if (kind === "in") arrow.poly([0, -88, -16, -64, 16, -64]).fill(office.signInk).rect(-5, -66, 10, 26).fill(office.signInk)
  else arrow.poly([0, 88, -16, 64, 16, 64]).fill(office.signInk).rect(-5, 40, 10, 26).fill(office.signInk)
  sign.addChild(board, t, arrow)
  return { root: c, sign, rollers, width: w, drawRollers: (offset: number) => {
    rollers.clear()
    for (let y = ((offset % 22) + 22) % 22; y < height; y += 22) rollers.rect(-w / 2 + 6, y, w - 12, 3).fill({ color: 0x000000, alpha: 0.25 })
  } }
}

/** The rug of numbered memory tiles. */
export const rugArt = (cols: number, rows: number, cell: number, labels: ReadonlyMap<number, string>) => {
  const c = new Container()
  const g = new Graphics().roundRect(-10, -10, cols * cell + 20, rows * cell + 20, 10).fill({ color: office.rug, alpha: 0.85 })
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      g.roundRect(k * cell + 6, r * cell + 6, cell - 12, cell - 12, 6).fill({ color: 0x000000, alpha: 0.1 }).stroke({ width: 2, color: office.rugLine, alpha: 0.7 })
    }
  }
  c.addChild(g)
  labels.forEach((text, index) => {
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: 15, fill: 0x2b1a10, fontWeight: "700" } })
    t.alpha = 0.7
    t.anchor.set(1, 1)
    t.position.set((index % cols) * cell + cell - 10, Math.floor(index / cols) * cell + cell - 6)
    c.addChild(t)
  })
  return c
}

// ---------------------------------------------------------------------------
// Things on the floor
// ---------------------------------------------------------------------------

export const BOX = 64
const BOX_MAX = 100

/** A box is always a square-ish tile, like HRM; long labels shrink to fit instead of growing the box. */
export const boxArt = (value: string | number) => {
  const c = new Container()
  const isNum = typeof value === "number"
  const fill = isNum ? office.box : office.letter
  const top = isNum ? office.boxTop : 0xc4cbef
  const sh = isNum ? office.boxShade : office.letterShade
  const text = String(value)
  const t = label(text, 32, isNum ? office.boxInk : office.letterInk, "700")
  const fit = Math.min(1, (BOX_MAX - 16) / t.width)
  t.scale.set(fit)
  const bw = Math.min(BOX_MAX, Math.max(BOX, t.width + 18))
  const g = new Graphics()
    .roundRect(-bw / 2, -BOX / 2 + 5, bw, BOX, 8).fill(sh)
    .roundRect(-bw / 2, -BOX / 2, bw, BOX, 8).fill(fill)
    .roundRect(-bw / 2 + 4, -BOX / 2 + 3, bw - 8, 11, 5).fill({ color: top, alpha: 0.9 })
  c.addChild(g, t)
  return c
}

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

const mix = (a: number, b: number, k: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

const shadeOf = (c: number, k: number) =>
  (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k)

/** A speech bubble with a tail pointing down-left (or down-right). */
export const bubbleArt = (text: string, maxW = 420, tail: "left" | "right" = "left", tone: "say" | "think" | "error" = "say") => {
  const c = new Container()
  const t = new Text({ text, style: { fontFamily: FONT, fontSize: 25, fill: tone === "error" ? 0xffffff : office.bubbleInk, fontWeight: "600", wordWrap: true, wordWrapWidth: maxW - 40, align: "center", lineHeight: 30 } })
  t.anchor.set(0.5)
  const w = Math.max(140, t.width + 44)
  const h = t.height + 34
  const fill = tone === "error" ? office.bad : office.bubble
  const g = new Graphics().roundRect(-w / 2, -h / 2, w, h, 20).fill(fill).stroke({ width: 3, color: 0x2b211b, alpha: 0.35 })
  if (tone === "think") g.circle(tail === "left" ? -w / 4 : w / 4, h / 2 + 14, 9).fill(fill).circle(tail === "left" ? -w / 4 - 12 : w / 4 + 12, h / 2 + 32, 5).fill(fill)
  else g.poly(tail === "left" ? [-w / 4 - 10, h / 2 - 2, -w / 4 + 14, h / 2 - 2, -w / 4 - 22, h / 2 + 24] : [w / 4 + 10, h / 2 - 2, w / 4 - 14, h / 2 - 2, w / 4 + 22, h / 2 + 24]).fill(fill)
  c.addChild(g, t)
  c.pivot.set(tail === "left" ? -w / 4 - 22 : w / 4 + 22, h / 2 + 24)
  return c
}

// ---------------------------------------------------------------------------
// The program strip
// ---------------------------------------------------------------------------

export const commandColors = (op: string): { fill: number; ink: number } => {
  switch (op) {
    case "inbox":
    case "outbox":
      return { fill: office.cmdIo, ink: office.cmdIoInk }
    case "copyfrom":
    case "copyto":
      return { fill: office.cmdCopy, ink: office.cmdCopyInk }
    case "add":
    case "sub":
    case "bump+":
    case "bump-":
      return { fill: office.cmdMath, ink: office.cmdMathInk }
    case "jump":
    case "jumpz":
    case "jumpn":
    case "label":
      return { fill: office.cmdJump, ink: office.cmdJumpInk }
    case "visit":
    case "pass":
    case "work":
      return { fill: office.cmdDesk, ink: office.cmdDeskInk }
    default:
      return { fill: office.cmdTalk, ink: office.cmdTalkInk }
  }
}

/** One command block, HRM-style: coloured tab, bold lowercase name, argument chip. */
export const commandArt = (name: string, op: string, arg: string | undefined, maxW: number) => {
  const c = new Container()
  const { fill, ink } = commandColors(op)
  const isLabel = op === "label"
  const t = label(isLabel ? "" : name, 24, ink, "700", "left")
  const shown = arg && arg.length > 30 ? `${arg.slice(0, 28)}…”` : arg
  const argT = shown ? label(shown, 20, op === "copyfrom" || op === "copyto" ? 0xffffff : ink, "700", "left") : undefined
  const tw = isLabel ? 70 : t.width + 24
  const g = new Graphics().roundRect(0, 3, tw, 36, 5).fill(shadeOf(fill, 0.78)).roundRect(0, 0, tw, 36, 5).fill(fill)
  t.position.set(12, 18)
  c.addChild(g, t)
  if (argT) {
    const aw = Math.min(maxW - tw - 8, argT.width + 18)
    if (argT.width > aw - 14) argT.scale.set((aw - 14) / argT.width)
    // Argument chips: darker for copy commands (like the tile chip), paler otherwise.
    const face = op === "copyfrom" || op === "copyto" ? shadeOf(fill, 0.86) : mix(fill, 0xffffff, 0.35)
    const chip = new Graphics().roundRect(tw + 6, 3, aw, 36, 5).fill(shadeOf(face, 0.8)).roundRect(tw + 6, 0, aw, 36, 5).fill(face)
    argT.position.set(tw + 15, 18)
    c.addChild(chip, argT)
  }
  return c
}

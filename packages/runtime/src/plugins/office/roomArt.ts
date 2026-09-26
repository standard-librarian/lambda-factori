/**
 * The office set, drawn procedurally (nothing is copied from the game): wooden
 * walls in perspective around a tiled floor, a glowing ceiling light, the in/out
 * conveyors with their wall signs, the rug of numbered memory tiles, and the
 * green value boxes.
 */
import { Container, Graphics, Text } from "pixi.js"
import { label } from "../../render/label.ts"
import { FONT } from "../../render/theme.ts"
import { office } from "./officePalette.ts"

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

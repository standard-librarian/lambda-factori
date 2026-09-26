/**
 * Procedural art in the Word Factori idiom: flat colour-coded castle-like
 * factories, chunky rounded shapes, darker shade bands, cyan input and pink
 * output ports. Source and apply machines, bins, tokens and stickers. Everything
 * is drawn with Graphics, so there are no bitmap assets to license. Domain-free:
 * every shape takes its colours as plain parameters. `machineArt`, which picks a
 * source's colour from the combinator catalogue, lives in
 * `plugins/combinators/machineArt.ts` instead (the kit itself must not depend on
 * `core`, see `architecture.test.ts`).
 */
import { Container, Graphics, Text } from "pixi.js"
import { CELL, palette } from "./theme.ts"
import { label } from "./label.ts"

export const W = CELL * 3
export const H = CELL * 2
const crenellate = (g: Graphics, x: number, y: number, w: number, color: number) => {
  const n = Math.max(2, Math.round(w / 12))
  const bw = w / (2 * n - 1)
  for (let i = 0; i < n; i++) g.rect(x + i * 2 * bw, y - 6, bw, 7)
  g.fill(color)
}

const archWindow = (g: Graphics, cx: number, top: number, w: number, h: number, color: number) => {
  g.roundRect(cx - w / 2, top, w, h, w / 2).fill(color)
}

export interface FactoryArt {
  readonly root: Container
  /** Body, squashed/stretched when the machine works. Pivot at bottom centre. */
  readonly body: Container
  /** Floating icon above the building (stamp, clamp …). */
  readonly icon: Container
  readonly iconY: number
  /** Where smoke leaves the chimney, in root coordinates. */
  readonly chimney: { x: number; y: number }
}

const towerBlock = (g: Graphics, x: number, y: number, w: number, color: number, shade: number, windows: number) => {
  g.rect(x, y, w, H - y).fill(color)
  crenellate(g, x, y, w, color)
  const ww = Math.min(9, w / (windows * 2))
  for (let i = 0; i < windows; i++) {
    const cx = x + (w / (windows + 1)) * (i + 1)
    archWindow(g, cx, y + 10, ww, 16, shade)
  }
}

const factoryBody = (color: number, shade: number, variant: "source" | "apply") => {
  const g = new Graphics()
  if (variant === "source") {
    // A long low press hall with a sawtooth roof and a chimney stack.
    g.rect(0, 34, W, H - 34).fill(color)
    for (let i = 0; i < 4; i++) g.poly([i * 30, 34, i * 30 + 30, 34, i * 30 + 30, 18]).fill(color)
    for (let i = 0; i < 4; i++) g.rect(i * 30 + 24, 20, 6, 14).fill(shade)
    // grille windows
    for (let i = 0; i < 5; i++) g.rect(14 + i * 20, 46, 10, 14).fill(shade)
    g.rect(96, 2, 14, 32).fill(color)
    g.rect(94, 0, 18, 6).fill(shade)
  } else {
    towerBlock(g, 0, 26, 38, color, shade, 1)
    towerBlock(g, 41, 12, 38, color, shade, 2)
    towerBlock(g, 82, 26, 38, color, shade, 1)
    g.rect(104, 6, 10, 20).fill(color)
    g.rect(102, 4, 14, 5).fill(shade)
  }
  // Shade band along the base, like Word Factori's darker foundations.
  g.rect(0, H - 9, W, 9).fill(shade)
  return g
}

const port = (x: number, y: number, color: number) =>
  new Graphics().circle(x, y, 8).fill(palette.white).circle(x, y, 5.5).fill(color)

/** Source: emits one atom per cycle. The stamp above shows (and pumps) the atom. */
export const sourceArt = (atomName: string, color: number, shade: number): FactoryArt => {
  const root = new Container()
  const body = new Container()
  body.pivot.set(W / 2, H)
  body.position.set(W / 2, H)
  body.addChild(factoryBody(color, shade, "source"))
  root.addChild(body)

  // The press: a crossbar and rod holding a stamp plate that prints the atom.
  const icon = new Container()
  const rod = new Graphics().rect(-16, -14, 32, 7).fill(shade).rect(-3.5, -8, 7, 16).fill(shade)
  const stamp = new Graphics()
    .roundRect(-18, 6, 36, 34, 9).fill(shade)
    .roundRect(-16, 4, 32, 32, 8).fill(palette.cream)
  const letter = label(atomName, [...atomName].length > 1 ? 17 : 25, color, "700")
  letter.position.set(0, 20)
  icon.addChild(rod, stamp, letter)
  const iconY = -20
  icon.position.set(26, iconY)
  root.addChild(icon)

  root.addChild(port(W / 2, 0, palette.portOut))
  return { root, body, icon, iconY, chimney: { x: 103, y: 0 } }
}

/** Apply: the red merger. Function goes in on the left, argument on the right. */
export const applyArt = (): FactoryArt => {
  const root = new Container()
  const body = new Container()
  body.pivot.set(W / 2, H)
  body.position.set(W / 2, H)
  body.addChild(factoryBody(palette.red, palette.redShade, "apply"))
  const f = label("f", 15, palette.cream, "700")
  f.position.set(19, H - 22)
  const x = label("x", 15, palette.cream, "700")
  x.position.set(W - 19, H - 22)
  body.addChild(f, x)
  root.addChild(body)

  // The clamp icon: two brackets that squeeze together when applying.
  const icon = new Container()
  const left = new Graphics().rect(-4, -12, 5, 24).fill(palette.redShade).rect(-14, -2, 12, 5).fill(palette.redShade)
  const right = new Graphics().rect(-1, -12, 5, 24).fill(palette.redShade).rect(2, -2, 12, 5).fill(palette.redShade)
  left.label = "left"
  right.label = "right"
  left.x = -8
  right.x = 8
  icon.addChild(left, right)
  const iconY = 2
  icon.position.set(20, iconY)
  root.addChild(icon)

  root.addChild(port(CELL / 2, H, palette.portIn), port(W - CELL / 2, H, palette.portIn), port(W / 2, 0, palette.portOut))
  return { root, body, icon, iconY, chimney: { x: 109, y: 4 } }
}

export interface BinArt {
  readonly root: Container
  readonly box: Container
  readonly counter: Text
  readonly bubble: Graphics
  readonly check: Graphics
}

/** Target bin: the blue letter boxes along the top, with a navy counter bubble. */
export const binArt = (text: string, quota: number): BinArt => {
  const root = new Container()
  const box = new Container()
  box.pivot.set(W / 2, H / 2)
  box.position.set(W / 2, H / 2)
  const g = new Graphics()
    .roundRect(8, 8, W - 16, H - 8, 16).fill(palette.binDark)
    .roundRect(12, 4, W - 24, H - 12, 14).fill(palette.bin)
    .roundRect(18, 10, W - 36, H - 26, 10).fill({ color: palette.white, alpha: 0.12 })
  const glyph = label(text, [...text].length > 2 ? 24 : 34, palette.white, "700")
  glyph.position.set(W / 2, H / 2 - 4)
  box.addChild(g, glyph)
  root.addChild(box)

  const bubble = new Graphics().roundRect(-26, -14, 52, 28, 14).fill(palette.binDark)
  bubble.position.set(W / 2, -2)
  const counter = label(`0/${quota}`, 17, palette.white, "700")
  counter.position.copyFrom(bubble.position)
  const check = new Graphics()
    .circle(0, 0, 13).fill(palette.green)
    .moveTo(-6, 0).lineTo(-2, 5).lineTo(7, -5).stroke({ width: 3.5, color: palette.white, cap: "round", join: "round" })
  check.position.set(W - 14, 10)
  check.scale.set(0)
  root.addChild(bubble, counter, check, port(W / 2, H, palette.portIn))
  return { root, box, counter, bubble, check }
}

/** The ⊸ bar that chains neighbouring bins together, as in Word Factori's word row. */
export const binLink = (width: number) =>
  new Graphics().roundRect(0, -6, width, 12, 6).fill(palette.binDark).circle(width / 2, 0, 9).fill(palette.binDark)

export const tokenArt = (text: string, color: number) => {
  const c = new Container()
  const r = [...text].length > 2 ? 21 : 17
  const g = new Graphics().circle(0, 0, r).fill(color).stroke({ width: 3, color: palette.white })
  const t = label(text, [...text].length > 3 ? 12 : [...text].length > 1 ? 16 : 20, palette.white, "700")
  c.addChild(g, t)
  return c
}

/** Sticker tile: white-bordered rounded square with the bird's glyph, like the scrapbook stickers. */
export const stickerArt = (glyph: string, name: string | undefined, color: number, size = 64) => {
  const c = new Container()
  const g = new Graphics()
    .roundRect(-size / 2 - 5, -size / 2 - 5, size + 10, size + 10, 16).fill(palette.white)
    .roundRect(-size / 2, -size / 2, size, size, 12).fill(color)
  const t = label(glyph, size * ([...glyph].length > 1 ? 0.38 : 0.55), palette.white, "700")
  t.y = name ? -size * 0.1 : 0
  c.addChild(g, t)
  if (name) {
    const n = label(name.toLowerCase(), size * 0.17, palette.white, "600")
    n.y = size * 0.3
    c.addChild(n)
  }
  return c
}

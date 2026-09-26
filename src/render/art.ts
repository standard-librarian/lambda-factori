/**
 * Procedural art in the Word Factori idiom: flat colour-coded castle-like
 * factories on graph paper, chunky rounded shapes, darker shade bands, cyan
 * input and pink output ports. Everything is drawn with Graphics, so there
 * are no bitmap assets to license.
 */
import { CanvasTextMetrics, Container, Graphics, Text } from "pixi.js"
import { APL_FONT, CELL, FONT, palette } from "./theme.ts"

export const W = CELL * 3
export const H = CELL * 2

/** APL/BQN glyph strings (no Latin letters) are set in BQN386; everything else in Fredoka. */
export const fontFor = (text: string) => (/[A-Za-z]/.test(text) || !/[^\s\d.,:;!?'"()\[\]/-]/u.test(text) ? FONT : APL_FONT)

export type Align = "center" | "left" | "right"

const ink = document.createElement("canvas").getContext("2d")!

/**
 * Anchor a single-line Text on the centre of its *ink* rather than its line
 * box, so glyphs sit dead-centre in circles and pills whatever the font's
 * ascent/descent. Horizontal ink centring applies to centred labels only.
 */
export const centerInk = (t: Text, align: Align = "center") => {
  const text = String(t.text)
  const ax = align === "left" ? 0 : align === "right" ? 1 : 0.5
  const metrics = CanvasTextMetrics.measureText(text, t.style)
  if (text.length === 0 || metrics.lines.length !== 1 || t.height === 0) return t.anchor.set(ax, 0.5)
  ink.font = t.style._fontString
  const m = ink.measureText(text)
  const stroke = t.style.stroke ? (t.style._stroke?.width ?? 0) : 0
  const { ascent, fontSize } = metrics.fontProperties
  const baseline = stroke / 2 + ascent + (metrics.lineHeight - fontSize) / 2
  const inkMidY = baseline + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2
  const inkMidX = stroke / 2 + (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2
  t.anchor.set(align === "center" ? inkMidX / t.width : ax, inkMidY / t.height)
}

export const label = (
  text: string,
  size: number,
  color: number = palette.white,
  weight: "500" | "600" | "700" = "600",
  align: Align = "center"
) => {
  const t = new Text({ text, style: { fontFamily: fontFor(text), fontSize: size, fill: color, fontWeight: weight } })
  centerInk(t, align)
  return t
}

/** Change a label's text and keep it optically centred. */
export const relabel = (t: Text, text: string, align: Align = "center") => {
  if (t.text === text) return
  t.text = text
  t.style.fontFamily = fontFor(text)
  centerInk(t, align)
}

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

/** Paper background with a fine grid, like the graph-paper floor. */
export const paperArt = (w: number, h: number) => {
  const g = new Graphics().rect(0, 0, w, h).fill(palette.paper)
  for (let x = 0; x <= w; x += CELL) g.moveTo(x, 0).lineTo(x, h)
  for (let y = 0; y <= h; y += CELL) g.moveTo(0, y).lineTo(w, y)
  g.stroke({ width: 1, color: palette.grid })
  return g
}

/** Distant factory skyline silhouettes along the bottom of the floor. */
export const skylineArt = (w: number, baseY: number, color: number = palette.skyline) => {
  const g = new Graphics()
  let x = -10
  let i = 0
  while (x < w) {
    const kind = i % 5
    const bw = 50 + ((i * 37) % 40)
    const bh = 26 + ((i * 53) % 34)
    g.rect(x, baseY - bh, bw, bh)
    if (kind === 0) g.rect(x + bw - 14, baseY - bh - 22, 9, 22)
    if (kind === 1) for (let k = 0; k < 3; k++) g.rect(x + 4 + k * (bw / 3), baseY - bh - 7, bw / 6, 8)
    if (kind === 2) g.poly([x, baseY - bh, x + bw / 2, baseY - bh - 18, x + bw, baseY - bh])
    if (kind === 3) g.circle(x + bw / 2, baseY - bh - 14, 8)
    if (kind === 4) g.rect(x + bw / 2 - 3, baseY - bh - 26, 6, 26).rect(x + bw / 2 - 12, baseY - bh - 28, 24, 6)
    x += bw + 6
    i++
  }
  g.rect(0, baseY, w, 200)
  g.fill(color)
  return g
}

const SERIF = "Georgia, 'Times New Roman', serif"

/**
 * A page from the archive: the paper that introduced this level's
 * combinators, drawn as a slightly yellowed journal page.
 */
export const archiveArt = (p: {
  readonly authors: string
  readonly year: number
  readonly title: string
  readonly venue: string
  readonly note: string
}, width = 460, height = 470) => {
  const c = new Container()
  const g = new Graphics()
    .roundRect(-width / 2 + 6, -height / 2 + 8, width, height, 10).fill({ color: palette.ink, alpha: 0.12 })
    .roundRect(-width / 2, -height / 2, width, height, 10).fill(0xfbf5e4)
    .rect(-width / 2 + 28, -height / 2 + 92, width - 56, 2).fill(0xd8ccb0)
  // Folded corner.
  g.poly([width / 2 - 34, -height / 2, width / 2, -height / 2 + 34, width / 2 - 34, -height / 2 + 34]).fill(0xe8dcc0)
  c.addChild(g)

  const ribbon = new Container()
  ribbon.addChild(new Graphics().roundRect(-92, -17, 184, 34, 17).fill(palette.red))
  ribbon.addChild(label("from the archive", 17, palette.white, "700"))
  ribbon.position.set(-width / 2 + 120, -height / 2)
  c.addChild(ribbon)

  const year = label(`${p.year}`, 46, palette.ink, "700", "left")
  year.position.set(-width / 2 + 28, -height / 2 + 58)
  c.addChild(year)

  const text = (s: string, size: number, color: number, y: number, style: "normal" | "italic" = "normal", weight: "400" | "700" = "400") => {
    const t = new Text({
      text: s,
      style: { fontFamily: SERIF, fontSize: size, fill: color, fontStyle: style, fontWeight: weight, wordWrap: true, wordWrapWidth: width - 56, lineHeight: size * 1.3 }
    })
    t.position.set(-width / 2 + 28, y)
    c.addChild(t)
    return t
  }
  const title = text(p.title, 25, palette.ink, -height / 2 + 108, "italic", "700")
  const authors = text(p.authors, 19, palette.inkSoft, title.y + title.height + 10)
  const venue = text(p.venue, 15, palette.inkSoft, authors.y + authors.height + 4, "italic")
  text(p.note, 17, palette.ink, venue.y + venue.height + 18)
  return c
}

/** "In the wild": where this combinator shows up in real code. */
export const usageArt = (snippets: ReadonlyArray<{ readonly lang: string; readonly code: string | ReadonlyArray<string>; readonly note: string }>, width = 460) => {
  const c = new Container()
  const body = new Container()
  let y = 70
  for (const s of snippets) {
    const lang = label(s.lang, 17, palette.white, "700", "left")
    const pill = new Graphics().roundRect(28, y - 16, lang.width + 24, 30, 15).fill(palette.blue)
    lang.position.set(40, y)
    const code = new Text({
      text: typeof s.code === "string" ? s.code : s.code.join("\n"),
      style: { fontFamily: "BQN386, Menlo, monospace", fontSize: 18, fill: palette.ink, lineHeight: 25 }
    })
    code.position.set(40, y + 26)
    if (code.width > width - 96) code.scale.set((width - 96) / code.width)
    const box = new Graphics().roundRect(28, y + 18, width - 56, code.height + 20, 12).fill(0xffffff)
    const note = new Text({ text: s.note, style: { fontFamily: FONT, fontSize: 17, fill: palette.inkSoft, fontWeight: "500", wordWrap: true, wordWrapWidth: width - 60 } })
    note.position.set(30, y + 26 + code.height + 18)
    body.addChild(pill, lang, box, code, note)
    y = note.y + note.height + 34
  }
  const height = y - 4
  c.addChild(
    new Graphics()
      .roundRect(-width / 2 + 6, -height / 2 + 8, width, height, 14).fill({ color: palette.ink, alpha: 0.12 })
      .roundRect(-width / 2, -height / 2, width, height, 14).fill(palette.cream)
  )
  const ribbon = new Container()
  ribbon.addChild(new Graphics().roundRect(-80, -17, 160, 34, 17).fill(palette.blue), label("in the wild", 17, palette.white, "700"))
  ribbon.position.set(-width / 2 + 108, -height / 2)
  body.position.set(-width / 2, -height / 2)
  c.addChild(body, ribbon)
  return { root: c, height }
}

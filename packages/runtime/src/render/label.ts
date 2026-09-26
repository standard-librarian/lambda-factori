/**
 * Text labels that sit optically centred: pick the right font for the text
 * (Fredoka, or BQN386 for APL/BQN glyphs) and anchor single-line labels on the
 * centre of their ink, not their line box.
 */
import { CanvasTextMetrics, Text } from "pixi.js"
import { APL_FONT, FONT, palette } from "./theme.ts"

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

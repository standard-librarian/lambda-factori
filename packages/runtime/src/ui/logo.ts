/**
 * The λ factori wordmark: a stroked, drop-shadowed label. Domain-free (no
 * combinator or deck knowledge), so both the home screen and the combinator
 * game's own menu can draw it without either depending on the other.
 */
import { Container } from "pixi.js"
import { label } from "./label.ts"
import { palette } from "./theme.ts"

export const logo = () => {
  const c = new Container()
  const t = label("λ factori", 76, palette.red, "700")
  t.style.stroke = { color: palette.white, width: 12, join: "round" }
  t.style.dropShadow = { color: palette.redShade, alpha: 0.25, blur: 0, distance: 5, angle: Math.PI / 2 }
  c.addChild(t)
  return c
}

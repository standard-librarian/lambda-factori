/** The scenery behind every scene: graph paper, and a distant factory skyline. */
import { Graphics } from "pixi.js"
import { CELL, palette } from "./theme.ts"

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

/**
 * Geometry of the factory floor, in floor coordinates: where a cell's centre
 * and a building's port dots are, and helpers to draw wire paths through them
 * (whole, partly drawn while animating in, or dashed while being dragged).
 */
import type { Graphics } from "pixi.js"
import * as B from "@lambda-factori/core/Board.ts"
import { CELL } from "../../ui/theme.ts"
import { lerp } from "@lambda-factori/kernel/tween.ts"

export interface Pt {
  readonly x: number
  readonly y: number
}

export const center = (c: B.Cell): Pt => ({ x: c.col * CELL + CELL / 2, y: c.row * CELL + CELL / 2 })

/** Where a port's dot sits on the building edge. */
export const portDot = (b: B.Building, port: B.PortName): Pt => {
  const c = center(B.portCell(b, port))
  return { x: c.x, y: port === "out" ? c.y + CELL / 2 : c.y - CELL / 2 }
}

export const polyline = (g: Graphics, pts: ReadonlyArray<Pt>) => {
  if (pts.length === 0) return
  g.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y)
}

/** The first `t` (0…1) of a path, by length. */
export const partial = (pts: ReadonlyArray<Pt>, t: number): Array<Pt> => {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y))
  let remaining = lens.reduce((a, b) => a + b, 0) * t
  const out: Array<Pt> = [pts[0]!]
  for (let i = 0; i < lens.length; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (remaining >= lens[i]!) {
      out.push(b)
      remaining -= lens[i]!
    } else {
      const k = remaining / lens[i]!
      out.push({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) })
      break
    }
  }
  return out
}

export const dashed = (g: Graphics, a: Pt, b: Pt) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const n = Math.floor(len / 14)
  for (let i = 0; i < n; i += 2) {
    const t0 = i / n
    const t1 = Math.min(1, (i + 1) / n)
    g.moveTo(lerp(a.x, b.x, t0), lerp(a.y, b.y, t0)).lineTo(lerp(a.x, b.x, t1), lerp(a.y, b.y, t1))
  }
}

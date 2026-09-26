/**
 * The office set, built once from the spec: walls and floor, the in/out belts,
 * the memory tiles on their rug, the desks (a regular grid of up to four per
 * row), the boss, the worker, and the layers boxes and bubbles are drawn on.
 * It answers "where is X" (`spotOf`, `tilePos`, `deskPos`) and never changes.
 */
import { Container } from "pixi.js"
import type { OfficeSpec } from "@lambda-factori/contracts/OfficeSpec.ts"
import { beltArt, roomArt, rugArt } from "./roomArt.ts"
import { bossArt, deskArt, workerArt, type WorkerArt } from "./peopleArt.ts"
import { BELT_TOP, FLOOR, IN_SPOT, IN_X, OUT_SPOT, OUT_X, type Pt, ROOM_H, ROOM_W, WORKER_SCALE } from "./layout.ts"

export type Belt = ReturnType<typeof beltArt>
export type Desk = ReturnType<typeof deskArt>

export class Room {
  readonly root = new Container()
  readonly inBelt: Belt
  readonly outBelt: Belt
  readonly tilePos = new Map<string, Pt>()
  readonly deskPos = new Map<string, Pt>()
  readonly deskViews = new Map<string, Desk>()
  readonly boss: Container
  readonly worker: WorkerArt
  /** Boxes resting on belts and tiles. */
  readonly items = new Container()
  /** Boxes in flight, bubbles, signs. */
  readonly fx = new Container()
  /** Where the worker stands when the program hasn't sent them anywhere yet. */
  readonly home: Pt

  constructor(spec: OfficeSpec) {
    const tiles = spec.tiles ?? []
    const desks = spec.desks ?? []
    this.root.addChild(roomArt({ w: ROOM_W, h: ROOM_H, ...FLOOR, fh: ROOM_H - FLOOR.fy }, spec.night))

    this.inBelt = beltArt("in", 600)
    this.inBelt.root.position.set(IN_X, BELT_TOP - 50)
    this.inBelt.sign.position.set(78, 640)
    this.outBelt = beltArt("out", 600)
    this.outBelt.root.position.set(OUT_X, BELT_TOP - 50)
    this.outBelt.sign.position.set(ROOM_W - 78, 640)
    this.inBelt.drawRollers(0)
    this.outBelt.drawRollers(0)
    this.root.addChild(this.inBelt.root, this.outBelt.root, this.inBelt.sign, this.outBelt.sign)

    // Memory tiles on a rug, HRM-style, numbered or labelled.
    const cols = Math.min(5, Math.max(1, tiles.length))
    const rows = Math.max(1, Math.ceil(tiles.length / cols))
    const cell = 116
    const rugX = FLOOR.fx + FLOOR.fw / 2 - (cols * cell) / 2
    const rugY = desks.length > 4 ? 860 : desks.length ? 730 : 600
    tiles.forEach((t, i) => this.tilePos.set(t.id, { x: rugX + (i % cols) * cell + cell / 2, y: rugY + Math.floor(i / cols) * cell + cell / 2 }))
    if (tiles.length) {
      const rug = rugArt(cols, rows, cell, new Map(tiles.map((t, i) => [i, t.label ?? t.id])))
      rug.position.set(rugX, rugY)
      this.root.addChild(rug)
    }

    // Desks: the modules a request travels through, in rows of up to four, centred.
    const perRow = Math.min(4, desks.length)
    desks.forEach((d, i) => {
      const row = Math.floor(i / perRow)
      const inRow = Math.min(perRow, desks.length - row * perRow)
      const x = d.x ?? FLOOR.fx + FLOOR.fw / 2 + (i % perRow - (inRow - 1) / 2) * 200
      const y = d.y ?? (desks.length > 4 ? 470 + row * 290 : 450)
      const art = deskArt(d.label ?? d.id, d.color ? Number.parseInt(d.color.replace("#", ""), 16) : 0x6d4a36, i)
      art.root.position.set(x, y)
      art.root.scale.set(0.9)
      this.root.addChild(art.root)
      this.deskPos.set(d.id, { x, y })
      this.deskViews.set(d.id, art)
    })

    this.boss = bossArt()
    this.boss.position.set(FLOOR.fx + FLOOR.fw / 2 + 200, 262)
    this.boss.scale.set(0.85)
    this.root.addChild(this.boss)

    const workerLayer = new Container()
    this.root.addChild(this.items, workerLayer, this.fx)
    this.worker = workerArt(spec.worker?.style ?? 0)
    this.worker.root.scale.set(WORKER_SCALE)
    workerLayer.addChild(this.worker.root)
    this.home = { x: FLOOR.fx + FLOOR.fw / 2 - 150, y: desks.length ? 660 : 520 }
  }

  /** Where the worker stands to use a place: a belt, in front of a tile, or at a desk. */
  spotOf(where: string | undefined, fallback: Pt): Pt {
    if (!where) return fallback
    if (where === "inbox") return IN_SPOT
    if (where === "outbox") return OUT_SPOT
    const t = this.tilePos.get(where)
    if (t) return { x: t.x, y: t.y + 96 }
    const d = this.deskPos.get(where)
    if (d) return { x: d.x, y: d.y + 205 }
    return fallback
  }
}

/**
 * Editing the factory floor with the pointer:
 * - drag a machine card from the tray onto the floor (a quick tap explains it instead);
 * - drag a placed machine to move it;
 * - drag from an output port to an input port to wire them;
 * - right-click a machine or wire to delete it; Escape cancels a drag.
 * Every change becomes a new pure `Board` passed to `commit`; the editor never
 * mutates one.
 */
import type { Container, FederatedPointerEvent } from "pixi.js"
import * as B from "@lambda-factori/core/Board.ts"
import type { BoardView } from "./BoardView.ts"
import { H, machineArt, W } from "./factoryArt.ts"
import { center, dashed, polyline, portDot } from "./floorGeometry.ts"
import { BOARD_W, CELL, palette } from "./theme.ts"

type Drag =
  | { readonly _tag: "place"; readonly kind: "source" | "apply"; readonly atom: string | undefined; readonly ghost: Container; readonly start: { x: number; y: number } }
  | { readonly _tag: "move"; readonly id: number; readonly ghost: Container; readonly dx: number; readonly dy: number }
  | { readonly _tag: "wire"; readonly from: number }

export interface BoardEditorHost {
  readonly floor: BoardView
  board(): B.Board
  /** Adopt an edited board; `after` runs once it's drawn. */
  commit(next: B.Board, after?: () => void): void
  /** Called as soon as a drag starts, so a running simulation stops. */
  beginEdit(): void
  /** True while a modal (theater, level-complete panel) should swallow floor input. */
  blocked(): boolean
  explainMachine(kind: "source" | "apply", atom: string | undefined): void
}

export class BoardEditor {
  private drag: Drag | undefined
  private pointer = { x: 0, y: 0 }
  private readonly host: BoardEditorHost

  constructor(host: BoardEditorHost, scene: Container) {
    this.host = host
    host.floor.root.on("pointerdown", (e) => this.onFloorDown(e))
    scene.eventMode = "static"
    scene.on("globalpointermove", (e) => this.onMove(e))
    scene.on("pointerup", (e) => this.onUp(e))
    scene.on("pointerupoutside", (e) => this.onUp(e))
  }

  /** Start dragging a new machine from the tray. */
  grab(kind: "source" | "apply", atom: string | undefined, e: FederatedPointerEvent) {
    this.host.beginEdit()
    const ghost = this.ghost(kind, atom)
    this.drag = { _tag: "place", kind, atom, ghost, start: { x: e.global.x, y: e.global.y } }
    this.onMove(e)
  }

  /** Escape: drop whatever is being dragged. Returns whether there was a drag. */
  cancel(): boolean {
    const d = this.drag
    if (!d) return false
    this.drag = undefined
    this.host.floor.previewLayer.clear()
    if (d._tag !== "wire") d.ghost.destroy({ children: true })
    if (d._tag === "move") this.host.floor.views.get(d.id)!.root.alpha = 1
    return true
  }

  private get board() {
    return this.host.board()
  }

  private local(e: FederatedPointerEvent) {
    return this.host.floor.root.toLocal(e.global)
  }

  private ghost(kind: "source" | "apply", atom: string | undefined) {
    const ghost = machineArt(kind, atom).root
    ghost.alpha = 0.7
    this.host.floor.fxLayer.addChild(ghost)
    return ghost
  }

  private ghostCell(x: number, y: number, dx = W / 2, dy = H / 2) {
    return { col: Math.round((x - dx) / CELL), row: Math.round((y - dy) / CELL) }
  }

  private nearestPort(x: number, y: number, want: "out" | "in") {
    let best: { building: B.Building; port: B.PortName; d: number } | undefined
    for (const b of this.board.buildings) {
      for (const port of B.portsOf(b)) {
        if ((port === "out") !== (want === "out")) continue
        const p = portDot(b, port)
        const d = Math.hypot(p.x - x, p.y - y)
        if (d < 26 && (!best || d < best.d)) best = { building: b, port, d }
      }
    }
    return best
  }

  private onFloorDown(e: FederatedPointerEvent) {
    if (this.host.blocked()) return
    const p = this.local(e)
    const cell = { col: Math.floor(p.x / CELL), row: Math.floor(p.y / CELL) }
    if (e.button === 2) {
      const b = B.buildingAt(this.board, cell)
      if (b && b.kind !== "bin") return this.host.commit(B.remove(this.board, b.id), () => this.host.floor.poof(b))
      const w = B.wireAt(this.board, cell)
      if (w) this.host.commit(B.removeWire(this.board, w.id))
      return
    }
    const out = this.nearestPort(p.x, p.y, "out")
    if (out) {
      this.host.beginEdit()
      this.drag = { _tag: "wire", from: out.building.id }
      return
    }
    const b = B.buildingAt(this.board, cell)
    if (b && b.kind !== "bin") {
      this.host.beginEdit()
      const ghost = this.ghost(b.kind, b.atom)
      this.host.floor.views.get(b.id)!.root.alpha = 0.25
      this.drag = { _tag: "move", id: b.id, ghost, dx: p.x - b.col * CELL, dy: p.y - b.row * CELL }
      this.onMove(e)
    }
  }

  private onMove(e: FederatedPointerEvent) {
    const p = this.local(e)
    this.pointer = { x: p.x, y: p.y }
    const d = this.drag
    if (!d) return
    if (d._tag === "wire") return this.drawWirePreview(d.from)
    const c = d._tag === "move" ? this.ghostCell(p.x, p.y, d.dx, d.dy) : this.ghostCell(p.x, p.y)
    const kind = d._tag === "place" ? d.kind : this.board.buildings.find((b) => b.id === d.id)!.kind
    const ok = B.canPlace(this.board, kind, c.col, c.row, d._tag === "move" ? d.id : undefined)
    d.ghost.position.set(c.col * CELL, c.row * CELL)
    d.ghost.alpha = ok ? 0.75 : 0.3
    d.ghost.visible = p.x < BOARD_W
  }

  /** While wiring: a routed path to the nearest input port, or a dashed line to the pointer. */
  private drawWirePreview(from: number) {
    const src = this.board.buildings.find((b) => b.id === from)!
    const g = this.host.floor.previewLayer.clear()
    const target = this.nearestPort(this.pointer.x, this.pointer.y, "in")
    const start = portDot(src, "out")
    if (target && target.building.id !== from) {
      const path = B.routePorts(this.board, B.portCell(src, "out"), B.portCell(target.building, target.port))
      if (path) {
        const dot = portDot(target.building, target.port)
        polyline(g, [start, ...path.map(center), dot])
        g.stroke({ width: 5, color: palette.wire, alpha: 0.8, cap: "round", join: "round" })
        g.circle(dot.x, dot.y, 13).stroke({ width: 3, color: palette.portIn })
        return
      }
    }
    dashed(g, start, this.pointer)
    g.stroke({ width: 4, color: palette.wireShade, alpha: 0.7, cap: "round" })
  }

  private onUp(e: FederatedPointerEvent) {
    const d = this.drag
    if (!d) return
    this.drag = undefined
    const p = this.local(e)
    if (d._tag === "wire") {
      this.host.floor.previewLayer.clear()
      const target = this.nearestPort(p.x, p.y, "in")
      if (!target) return
      const next = B.connect(this.board, d.from, { building: target.building.id, port: target.port })
      if (next === this.board) return
      const created = next.wires.at(-1)!
      return this.host.commit(next, () => this.host.floor.animateWire(created.id))
    }
    d.ghost.destroy({ children: true })
    if (d._tag === "place") {
      if (Math.hypot(e.global.x - d.start.x, e.global.y - d.start.y) < 8) return this.host.explainMachine(d.kind, d.atom)
      if (p.x >= BOARD_W) return
      const c = this.ghostCell(p.x, p.y)
      return this.host.commit(B.place(this.board, d.kind, c.col, c.row, d.atom))
    }
    this.host.floor.views.get(d.id)!.root.alpha = 1
    const c = this.ghostCell(p.x, p.y, d.dx, d.dy)
    this.host.commit(B.move(this.board, d.id, c.col, c.row))
  }
}

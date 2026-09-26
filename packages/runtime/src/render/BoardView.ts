/**
 * The drawn factory floor for a `Board`: graph paper and skyline, one view per
 * building (machines drop in with a squash-and-stretch landing; bins open the
 * goal theater on tap), the links between bins, and the wires. It keeps the
 * drawing in step with whatever board it's given (`sync`), and exposes the
 * layers the editor and the simulation animator draw on.
 */
import { Container, Graphics, Rectangle } from "pixi.js"
import * as B from "@lambda-factori/core/Board.ts"
import { DEFAULT_QUOTA, type Level } from "@lambda-factori/core/Level.ts"
import { paperArt, skylineArt } from "./backdrop.ts"
import { Smoke } from "./effects.ts"
import { binArt, type BinArt, binLink, type FactoryArt, H, machineArt, W } from "./factoryArt.ts"
import { center, partial, polyline, portDot } from "./floorGeometry.ts"
import { relabel } from "./label.ts"
import { BOARD_W, CELL, DESIGN_H, palette } from "./theme.ts"
import { ease, lerp, type Tweens } from "../kernel/tween.ts"

export interface BuildingView {
  readonly building: B.Building
  readonly root: Container
  readonly art: FactoryArt | undefined
  readonly bin: BinArt | undefined
  /** The term a machine just produced, floating above it until it's emitted. */
  preview: Container | undefined
  /** Clock for the idle icon bob. */
  idle: number
}

export class BoardView {
  /** Hit-testable floor container; everything below is drawn inside it. */
  readonly root = new Container()
  readonly previewLayer = new Graphics()
  readonly tokenLayer = new Container()
  readonly fxLayer = new Container()
  readonly smoke = new Smoke()
  readonly views = new Map<number, BuildingView>()
  private readonly wireLayer = new Graphics()
  private readonly buildingLayer = new Container()
  private links: Container | undefined
  /** A wire drawing itself in (0…1), after it's connected. */
  private wireAnim: { id: number; progress: number } | undefined
  private board: B.Board
  private readonly level: Level
  private readonly tweens: Tweens
  private readonly onBinTap: (target: number) => void

  constructor(o: { level: Level; board: B.Board; tweens: Tweens; onBinTap: (target: number) => void }) {
    this.level = o.level
    this.board = o.board
    this.tweens = o.tweens
    this.onBinTap = o.onBinTap
    this.root.addChild(paperArt(BOARD_W, DESIGN_H), skylineArt(BOARD_W, DESIGN_H - 14))
    this.root.addChild(this.wireLayer, this.previewLayer, this.buildingLayer, this.smoke, this.tokenLayer, this.fxLayer)
    this.root.eventMode = "static"
    this.root.hitArea = { contains: (x: number, y: number) => x >= 0 && x < BOARD_W && y >= 0 && y < DESIGN_H }
    this.sync(o.board)
  }

  /** Redraw for `board`: add, move and drop building views, then links and wires. */
  sync(board: B.Board) {
    this.board = board
    const alive = new Set(board.buildings.map((b) => b.id))
    for (const [id, v] of this.views) {
      if (alive.has(id)) continue
      v.root.destroy({ children: true })
      this.views.delete(id)
    }
    for (const b of board.buildings) {
      const existing = this.views.get(b.id)
      if (existing && existing.building.col === b.col && existing.building.row === b.row) continue
      existing?.root.destroy({ children: true })
      this.views.delete(b.id)
      this.views.set(b.id, this.createView(b, existing === undefined))
    }
    this.drawLinks()
    this.drawWires()
  }

  /** Animate a freshly connected wire drawing itself from its source. */
  animateWire(id: number) {
    this.wireAnim = { id, progress: 0 }
    this.tweens.add({
      duration: 320,
      update: (k) => {
        this.wireAnim = { id, progress: k }
        this.drawWires()
      },
      done: () => {
        this.wireAnim = undefined
        this.drawWires()
      }
    })
  }

  /** A puff of smoke where a building used to be. */
  poof(b: B.Building) {
    for (let i = 0; i < 6; i++) this.smoke.puff(b.col * CELL + 10 + i * 20, b.row * CELL + 30 + (i % 2) * 30, palette.skyline, 14)
  }

  /** Reset every bin's counter and tick (a new run starts from zero). */
  resetBins() {
    for (const v of this.views.values()) {
      if (!v.bin) continue
      const t = this.level.targets[v.building.target!]!
      relabel(v.bin.counter, `0/${t.quota ?? DEFAULT_QUOTA}`)
      v.bin.check.scale.set(0)
    }
  }

  private createView(b: B.Building, animateIn: boolean): BuildingView {
    const root = new Container()
    root.position.set(b.col * CELL, b.row * CELL)
    let art: FactoryArt | undefined
    let bin: BinArt | undefined
    if (b.kind === "bin") {
      const t = this.level.targets[b.target!]!
      bin = binArt(t.label, t.quota ?? DEFAULT_QUOTA)
      root.addChild(bin.root)
      root.eventMode = "static"
      root.cursor = "help"
      root.hitArea = new Rectangle(0, -16, W, H + 16)
      root.interactiveChildren = false
      root.on("pointerup", () => this.onBinTap(b.target!))
    } else {
      art = machineArt(b.kind, b.atom)
      root.addChild(art.root)
      root.eventMode = "static"
      root.cursor = "grab"
    }
    this.buildingLayer.addChild(root)
    if (animateIn && art) {
      const body = art.body
      this.tweens.add({ duration: 420, ease: ease.outElastic, update: (k) => body.scale.set(lerp(1.25, 1, k), lerp(0.6, 1, k)) })
      for (let i = 0; i < 3; i++) this.smoke.puff(root.x + 20 + i * 40, root.y + H, palette.skyline, 10)
    }
    return { building: b, root, art, bin, preview: undefined, idle: Math.random() * 1000 }
  }

  /** The ⊸ bars chaining neighbouring bins, as in Word Factori's word row. */
  private drawLinks() {
    this.links?.destroy({ children: true })
    this.links = new Container()
    const bins = this.board.buildings.filter((b) => b.kind === "bin").sort((a, b) => a.col - b.col)
    for (let i = 0; i + 1 < bins.length; i++) {
      const l = binLink(CELL + 24)
      l.position.set((bins[i]!.col + 3) * CELL - 12, (bins[i]!.row + 1) * CELL + 4)
      this.links.addChild(l)
    }
    this.buildingLayer.addChildAt(this.links, 0)
  }

  private drawWires() {
    const g = this.wireLayer.clear()
    for (const w of this.board.wires) {
      const src = this.board.buildings.find((b) => b.id === w.from)!
      const dst = this.board.buildings.find((b) => b.id === w.to.building)!
      let pts = [portDot(src, "out"), ...w.path.map(center), portDot(dst, w.to.port)]
      if (this.wireAnim?.id === w.id) pts = partial(pts, this.wireAnim.progress)
      polyline(g, pts)
      g.stroke({ width: 7, color: palette.wireShade, cap: "round", join: "round" })
      polyline(g, pts)
      g.stroke({ width: 4, color: palette.wire, cap: "round", join: "round" })
    }
  }
}

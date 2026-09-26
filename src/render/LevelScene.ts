import { Container, type FederatedPointerEvent, Graphics, Rectangle, type Text } from "pixi.js"
import * as B from "../core/Board.ts"
import { byName, colorOf } from "../core/Catalogue.ts"
import { DEFAULT_QUOTA, type Level } from "../core/Level.ts"
import { labelFor, Sim, type SimEvent, type Stats, type Token } from "../core/Sim.ts"
import { app, apply, atom, type Term, variable } from "../core/Term.ts"
import type { GameEvent } from "../game/Events.ts"
import {
  applyArt,
  binArt,
  type BinArt,
  binLink,
  type FactoryArt,
  H,
  archiveArt,
  usageArt,
  label,
  paperArt,
  relabel,
  skylineArt,
  sourceArt,
  stickerArt,
  tokenArt,
  W
} from "./art.ts"
import type { GameContext, Scene } from "./Scene.ts"
import { StickerPile } from "./StickerPile.ts"
import { combinatorSpec, goalSpec, termSpec, Theater, type TheaterSpec } from "./Theater.ts"
import { BOARD_W, CELL, DESIGN_H, DESIGN_W, FAST_FACTOR, palette, TICK_MS, TRAY_X } from "./theme.ts"
import { ease, lerp } from "./tween.ts"
import { Button, icons, ring, Smoke, Toasts } from "./ui.ts"

type Mode = "stopped" | "running" | "paused"

interface BuildingView {
  readonly building: B.Building
  readonly root: Container
  readonly art: FactoryArt | undefined
  readonly bin: BinArt | undefined
  preview: Container | undefined
  idle: number
}

type Drag =
  | {
    readonly _tag: "place"
    readonly kind: "source" | "apply"
    readonly atom: string | undefined
    readonly ghost: Container
    readonly start: { x: number; y: number }
  }
  | { readonly _tag: "move"; readonly id: number; readonly ghost: Container; readonly dx: number; readonly dy: number }
  | { readonly _tag: "wire"; readonly from: number }

const center = (c: B.Cell) => ({ x: c.col * CELL + CELL / 2, y: c.row * CELL + CELL / 2 })

/** Where a port's dot sits on the building edge, in floor coordinates. */
const portDot = (b: B.Building, port: B.PortName) => {
  const c = center(B.portCell(b, port))
  return { x: c.x, y: port === "out" ? c.y + CELL / 2 : c.y - CELL / 2 }
}

export class LevelScene implements Scene {
  readonly view = new Container()
  private readonly floor = new Container()
  private readonly wireLayer = new Graphics()
  private readonly previewLayer = new Graphics()
  private readonly buildingLayer = new Container()
  private readonly tokenLayer = new Container()
  private readonly fxLayer = new Container()
  private readonly smoke = new Smoke()
  private readonly ui = new Container()
  private readonly toasts: Toasts
  private readonly pile: StickerPile
  private readonly cycleText: Text
  private readonly buttons: Record<"play" | "fast" | "pause" | "stop", Button>

  private board: B.Board
  private sim: Sim | undefined
  private mode: Mode = "stopped"
  private speed = 1
  private acc = 0
  private readonly views = new Map<number, BuildingView>()
  private readonly tokenViews = new Map<number, Container>()
  private readonly absorbing = new Set<number>()
  private drag: Drag | undefined
  private pointer = { x: 0, y: 0 }
  private wireAnim: { id: number; progress: number } | undefined
  private panel: Container | undefined
  /** Best stats before this run, captured up front because progress updates asynchronously. */
  private prevBest: Stats | undefined
  private theater: Theater | undefined

  private readonly ctx: GameContext
  private readonly level: Level

  constructor(ctx: GameContext, level: Level) {
    this.ctx = ctx
    this.level = level
    const saved = ctx.progress().boards[level.id]
    const fresh = B.emptyBoard(level.targets.length)
    this.board = saved && saved.buildings.filter((b) => b.kind === "bin").length === level.targets.length
      ? (saved as B.Board)
      : fresh

    // Floor -----------------------------------------------------------------
    const paper = paperArt(BOARD_W, DESIGN_H)
    this.floor.addChild(paper, skylineArt(BOARD_W, DESIGN_H - 14))
    this.floor.addChild(this.wireLayer, this.previewLayer, this.buildingLayer, this.smoke, this.tokenLayer, this.fxLayer)
    this.floor.eventMode = "static"
    this.floor.hitArea = { contains: (x: number, y: number) => x >= 0 && x < BOARD_W && y >= 0 && y < DESIGN_H }
    this.floor.on("pointerdown", (e) => this.onFloorDown(e))
    this.view.addChild(this.floor)

    // Tray ------------------------------------------------------------------
    const tray = new Container()
    tray.x = TRAY_X
    tray.addChild(new Graphics().rect(0, 0, DESIGN_W - TRAY_X, DESIGN_H).fill(palette.tray).rect(0, 0, 6, DESIGN_H).fill(palette.trayShade))
    const world = ctx.pack.worlds.find((w) => w.id === level.world)
    const worldText = label(`${world?.title ?? level.world}`.toLowerCase(), 20, palette.inkSoft, "600", "left")
    worldText.position.set(28, 36)
    const title = label(level.title, 34, palette.ink, "700", "left")
    title.position.set(26, 72)
    const blurb = label(level.blurb, 19, palette.inkSoft, "500")
    blurb.style.wordWrap = true
    blurb.style.wordWrapWidth = 270
    blurb.anchor.set(0, 0)
    blurb.position.set(28, 100)
    tray.addChild(worldText, title, blurb)

    const machinesY = 124 + blurb.height
    const header = label("machines", 20, palette.inkSoft, "600", "left")
    header.position.set(28, machinesY)
    tray.addChild(header)
    const cards: Array<{ kind: "source" | "apply"; atom: string | undefined }> = [
      ...level.sources.map((a) => ({ kind: "source" as const, atom: a })),
      { kind: "apply", atom: undefined }
    ]
    cards.forEach((card, i) => {
      const c = this.paletteCard(card.kind, card.atom)
      c.position.set(28 + (i % 2) * 138, machinesY + 24 + Math.floor(i / 2) * 142)
      tray.addChild(c)
    })
    this.pile = new StickerPile(260, DESIGN_H - 24)
    this.pile.x = 30
    tray.addChild(this.pile)
    for (const s of ctx.progress().stickers) this.pile.drop(s, colorOf(s).color, 130, 0, true)
    this.ui.addChild(tray)

    // Controls ----------------------------------------------------------------
    const mk = (icon: (g: Graphics) => void, color: number, shade: number, onTap: () => void) =>
      new Button({ width: 64, height: 58, color, shade, icon, onTap }, ctx.tweens)
    this.buttons = {
      play: mk(icons.play, palette.blue, 0x1f4c85, () => this.setMode("running", 1)),
      fast: mk(icons.fast, palette.blue, 0x1f4c85, () => this.setMode("running", FAST_FACTOR)),
      pause: mk(icons.pause, palette.yellow, 0xc8902c, () => this.setMode("paused")),
      stop: mk(icons.stop, palette.red, palette.redShade, () => this.setMode("stopped"))
    }
    ;[this.buttons.play, this.buttons.fast, this.buttons.pause, this.buttons.stop].forEach((b, i) => {
      b.position.set(56 + i * 80, DESIGN_H - 56)
      this.ui.addChild(b)
    })
    this.cycleText = label("", 22, palette.inkSoft, "600", "left")
    this.cycleText.position.set(56 + 4 * 80 - 20, DESIGN_H - 58)
    this.ui.addChild(this.cycleText)

    const menu = new Button({ width: 64, height: 58, color: palette.token, shade: palette.binShade, icon: icons.menu, onTap: () => ctx.menu() }, ctx.tweens)
    menu.position.set(56, 50)
    const hint = new Button({ width: 64, height: 58, color: palette.token, shade: palette.binShade, icon: icons.hint, onTap: () => this.toasts.show(level.hint ? `hint · ${level.hint}` : "no hint — you've got this", palette.inkSoft) }, ctx.tweens)
    hint.position.set(56, 126)
    const goal = new Button({ width: 64, height: 58, color: palette.green, shade: palette.greenShade, icon: icons.eye, onTap: () => this.explainGoal(0) }, ctx.tweens)
    goal.position.set(56, 202)
    this.ui.addChild(menu, hint, goal)

    this.toasts = new Toasts(ctx.tweens)
    this.toasts.position.set(BOARD_W / 2, 196)
    this.ui.addChild(this.toasts)
    this.view.addChild(this.ui)

    // Global drag handling --------------------------------------------------
    this.view.eventMode = "static"
    this.view.on("globalpointermove", (e) => this.onMove(e))
    this.view.on("pointerup", (e) => this.onUp(e))
    this.view.on("pointerupoutside", (e) => this.onUp(e))

    this.rebuild()
    this.updateButtons()
    // First visit: show what the goal combinator does before building anything.
    if (!ctx.progress().completed[level.id]) ctx.tweens.after(450, () => this.explainGoal(0))
    this.toasts.show(level.targets.length > 1 ? `spell ${level.targets.map((t) => t.label).join(" ")}` : `build ${level.targets[0].label}`)
  }

  // -------------------------------------------------------------------------
  // Building views
  // -------------------------------------------------------------------------

  private makeArt(kind: "source" | "apply", atom: string | undefined): FactoryArt {
    if (kind === "apply") return applyArt()
    const { color, shade } = colorOf(atom ?? "?")
    return sourceArt(atom ?? "?", color, shade)
  }

  private paletteCard(kind: "source" | "apply", atom: string | undefined) {
    const c = new Container()
    c.addChild(new Graphics().roundRect(0, 0, 124, 128, 14).fill(palette.cream).roundRect(0, 120, 124, 8, 4).fill(palette.trayShade))
    const art = this.makeArt(kind, atom)
    art.root.scale.set(0.62)
    art.root.position.set(62 - (W * 0.62) / 2, 30)
    const name = kind === "apply" ? "apply" : byName.get(atom!)?.bird.toLowerCase() ?? atom!
    const t = label(name, 16, palette.inkSoft, "600")
    t.position.set(62, 94)
    const known = atom ? byName.get(atom) : undefined
    const rule = label(kind === "apply" ? "f, x → f x" : known ? known.rule : "primitive", 13, palette.inkSoft, "500")
    rule.position.set(62, 112)
    c.addChild(art.root, t, rule)
    c.eventMode = "static"
    c.cursor = "grab"
    c.on("pointerdown", (e) => {
      e.stopPropagation()
      this.stopForEdit()
      const ghost = this.makeArt(kind, atom).root
      ghost.alpha = 0.7
      this.fxLayer.addChild(ghost)
      this.drag = { _tag: "place", kind, atom, ghost, start: { x: e.global.x, y: e.global.y } }
      this.onMove(e)
    })
    return c
  }

  private rebuild() {
    const alive = new Set(this.board.buildings.map((b) => b.id))
    for (const [id, v] of this.views) {
      if (!alive.has(id)) {
        v.root.destroy({ children: true })
        this.views.delete(id)
      }
    }
    for (const b of this.board.buildings) {
      const existing = this.views.get(b.id)
      if (existing && existing.building.col === b.col && existing.building.row === b.row) continue
      existing?.root.destroy({ children: true })
      this.views.delete(b.id)
      this.views.set(b.id, this.createView(b, existing === undefined))
    }
    this.drawLinks()
    this.drawWires()
    this.ctx.saveBoard(this.level.id, this.board)
  }

  private links: Container | undefined

  private drawLinks() {
    this.links?.destroy({ children: true })
    this.links = new Container()
    const bins = this.board.buildings.filter((b) => b.kind === "bin").sort((a, b) => a.col - b.col)
    for (let i = 0; i + 1 < bins.length; i++) {
      const a = bins[i]!
      const l = binLink(CELL + 24)
      l.position.set((a.col + 3) * CELL - 12, (a.row + 1) * CELL + 4)
      this.links.addChild(l)
    }
    this.buildingLayer.addChildAt(this.links, 0)
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
      root.on("pointerup", () => this.explainGoal(b.target!))
    } else {
      art = this.makeArt(b.kind, b.atom)
      root.addChild(art.root)
      root.eventMode = "static"
      root.cursor = "grab"
    }
    this.buildingLayer.addChild(root)
    if (animateIn && art) {
      // Drop in with a squash-and-stretch landing.
      this.ctx.tweens.add({
        duration: 420,
        ease: ease.outElastic,
        update: (k) => {
          art.body.scale.set(lerp(1.25, 1, k), lerp(0.6, 1, k))
        }
      })
      for (let i = 0; i < 3; i++) this.smoke.puff(root.x + 20 + i * 40, root.y + H, palette.skyline, 10)
    }
    return { building: b, root, art, bin, preview: undefined, idle: Math.random() * 1000 }
  }

  // -------------------------------------------------------------------------
  // Wires
  // -------------------------------------------------------------------------

  private wirePoints(w: B.Wire) {
    const src = this.board.buildings.find((b) => b.id === w.from)!
    const dst = this.board.buildings.find((b) => b.id === w.to.building)!
    return [portDot(src, "out"), ...w.path.map(center), portDot(dst, w.to.port)]
  }

  private drawWires() {
    const g = this.wireLayer.clear()
    for (const w of this.board.wires) {
      let pts = this.wirePoints(w)
      if (this.wireAnim?.id === w.id) pts = partial(pts, this.wireAnim.progress)
      polyline(g, pts)
      g.stroke({ width: 7, color: palette.wireShade, cap: "round", join: "round" })
      polyline(g, pts)
      g.stroke({ width: 4, color: palette.wire, cap: "round", join: "round" })
    }
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private local(e: FederatedPointerEvent) {
    return this.floor.toLocal(e.global)
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
    if (this.panel || this.theater) return
    const p = this.local(e)
    const cell = { col: Math.floor(p.x / CELL), row: Math.floor(p.y / CELL) }
    if (e.button === 2) {
      const b = B.buildingAt(this.board, cell)
      if (b && b.kind !== "bin") return this.edit(B.remove(this.board, b.id), () => this.poof(b))
      const w = B.wireAt(this.board, cell)
      if (w) return this.edit(B.removeWire(this.board, w.id))
      return
    }
    const out = this.nearestPort(p.x, p.y, "out")
    if (out) {
      this.stopForEdit()
      this.drag = { _tag: "wire", from: out.building.id }
      return
    }
    const b = B.buildingAt(this.board, cell)
    if (b && b.kind !== "bin") {
      this.stopForEdit()
      const ghost = this.makeArt(b.kind, b.atom).root
      ghost.alpha = 0.7
      this.fxLayer.addChild(ghost)
      this.views.get(b.id)!.root.alpha = 0.25
      this.drag = { _tag: "move", id: b.id, ghost, dx: p.x - b.col * CELL, dy: p.y - b.row * CELL }
      this.onMove(e)
    }
  }

  private ghostCell(x: number, y: number, dx = W / 2, dy = H / 2) {
    return { col: Math.round((x - dx) / CELL), row: Math.round((y - dy) / CELL) }
  }

  private onMove(e: FederatedPointerEvent) {
    const p = this.local(e)
    this.pointer = { x: p.x, y: p.y }
    const d = this.drag
    if (!d) return
    if (d._tag === "place" || d._tag === "move") {
      const c = d._tag === "move" ? this.ghostCell(p.x, p.y, d.dx, d.dy) : this.ghostCell(p.x, p.y)
      const kind = d._tag === "place" ? d.kind : this.board.buildings.find((b) => b.id === d.id)!.kind
      const ok = B.canPlace(this.board, kind, c.col, c.row, d._tag === "move" ? d.id : undefined)
      d.ghost.position.set(c.col * CELL, c.row * CELL)
      d.ghost.alpha = ok ? 0.75 : 0.3
      d.ghost.visible = p.x < BOARD_W
    }
    if (d._tag === "wire") this.drawWirePreview(d.from)
  }

  private drawWirePreview(from: number) {
    const src = this.board.buildings.find((b) => b.id === from)!
    const g = this.previewLayer.clear()
    const target = this.nearestPort(this.pointer.x, this.pointer.y, "in")
    const start = portDot(src, "out")
    if (target && target.building.id !== from) {
      const path = B.routePorts(this.board, B.portCell(src, "out"), B.portCell(target.building, target.port))
      if (path) {
        polyline(g, [start, ...path.map(center), portDot(target.building, target.port)])
        g.stroke({ width: 5, color: palette.wire, alpha: 0.8, cap: "round", join: "round" })
        const dot = portDot(target.building, target.port)
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
      this.previewLayer.clear()
      const target = this.nearestPort(p.x, p.y, "in")
      if (!target) return
      const next = B.connect(this.board, d.from, { building: target.building.id, port: target.port })
      if (next === this.board) return
      const created = next.wires.at(-1)!
      this.edit(next, () => this.animateWire(created.id))
      return
    }
    d.ghost.destroy({ children: true })
    if (d._tag === "place") {
      if (Math.hypot(e.global.x - d.start.x, e.global.y - d.start.y) < 8) return this.explainMachine(d.kind, d.atom)
      if (p.x >= BOARD_W) return
      const c = this.ghostCell(p.x, p.y)
      this.edit(B.place(this.board, d.kind, c.col, c.row, d.atom))
    } else {
      this.views.get(d.id)!.root.alpha = 1
      const c = this.ghostCell(p.x, p.y, d.dx, d.dy)
      this.edit(B.move(this.board, d.id, c.col, c.row))
    }
  }

  private edit(next: B.Board, after?: () => void) {
    if (next === this.board) return
    this.stopForEdit()
    this.board = next
    this.rebuild()
    after?.()
  }

  private animateWire(id: number) {
    this.wireAnim = { id, progress: 0 }
    this.ctx.tweens.add({
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

  private poof(b: B.Building) {
    for (let i = 0; i < 6; i++) this.smoke.puff(b.col * CELL + 10 + i * 20, b.row * CELL + 30 + (i % 2) * 30, palette.skyline, 14)
  }

  onKey(e: KeyboardEvent) {
    if (this.theater) return this.theater.onKey(e)
    if (e.code === "Space") {
      e.preventDefault()
      this.setMode(this.mode === "running" ? "paused" : "running", this.speed)
    } else if (e.code === "Escape" && this.drag) {
      const d = this.drag
      this.drag = undefined
      this.previewLayer.clear()
      if (d._tag !== "wire") d.ghost.destroy({ children: true })
      if (d._tag === "move") this.views.get(d.id)!.root.alpha = 1
    }
  }

  // -------------------------------------------------------------------------
  // Simulation control
  // -------------------------------------------------------------------------

  private stopForEdit() {
    if (this.mode !== "stopped") this.setMode("stopped")
  }

  private setMode(mode: Mode, speed = 1) {
    if (this.panel) return
    if (mode === "running" && !this.sim) {
      this.prevBest = this.ctx.progress().completed[this.level.id]
      this.sim = new Sim(this.board, this.level)
      this.acc = 0
    }
    if (mode === "stopped") this.resetSim()
    this.mode = mode
    this.speed = speed
    this.updateButtons()
  }

  private resetSim() {
    this.sim = undefined
    for (const v of this.tokenViews.values()) v.destroy({ children: true })
    this.tokenViews.clear()
    this.absorbing.clear()
    for (const v of this.views.values()) {
      v.preview?.destroy({ children: true })
      v.preview = undefined
      if (v.bin) {
        const t = this.level.targets[v.building.target!]!
        relabel(v.bin.counter, `0/${t.quota ?? DEFAULT_QUOTA}`)
        v.bin.check.scale.set(0)
      }
    }
    relabel(this.cycleText, "", "left")
  }

  private updateButtons() {
    const running = this.mode === "running"
    this.buttons.play.highlight(running && this.speed === 1)
    this.buttons.fast.highlight(running && this.speed > 1)
    this.buttons.pause.highlight(this.mode === "paused")
    this.buttons.pause.enabled = this.mode !== "stopped"
    this.buttons.stop.enabled = this.mode !== "stopped"
  }

  tick(dt: number) {
    this.smoke.tick(dt)
    this.pile.tick(dt)
    const tickMs = TICK_MS / this.speed
    if (this.mode === "running" && this.sim) {
      this.acc += dt
      // Never simulate more than a handful of ticks per frame, even after a stall.
      let n = 0
      while (this.acc >= tickMs && n++ < 8) {
        this.acc -= tickMs
        const events = this.sim.step()
        for (const e of events) this.onSim(e, tickMs)
      }
      this.acc = Math.min(this.acc, tickMs)
      relabel(this.cycleText, `cycle ${this.sim.tick}`, "left")
    }
    this.syncTokens(this.mode === "running" ? this.acc / tickMs : 1)
    this.idle(dt)
  }

  private idle(dt: number) {
    for (const v of this.views.values()) {
      if (!v.art) continue
      v.idle += dt
      // Icons bob gently; running machines puff smoke now and then.
      v.art.icon.y = v.art.iconY + Math.sin(v.idle / 420) * 2
      if (this.mode === "running" && Math.random() < dt / 1800) {
        const c = v.art.chimney
        this.smoke.puff(v.root.x + c.x, v.root.y + c.y, this.smokeColor(v), 7)
      }
    }
  }

  private smokeColor(v: BuildingView) {
    return v.building.kind === "apply" ? 0xd9707b : colorOf(v.building.atom ?? "").color
  }

  private syncTokens(alpha: number) {
    const sim = this.sim
    const seen = new Set<number>()
    if (sim) {
      for (const { wire, token } of sim.tokens()) {
        seen.add(token.id)
        let v = this.tokenViews.get(token.id)
        if (!v) {
          v = tokenArt(token.label, token.color)
          v.scale.set(0.4)
          v.eventMode = "static"
          v.cursor = "help"
          const term = token.term
          // Tokens move every frame, so a tap (down + up on the same spot) is
          // unreliable; open on press instead.
          v.on("pointerdown", (ev) => {
            ev.stopPropagation()
            this.explainTerm(term)
          })
          this.tokenLayer.addChild(v)
          this.tokenViews.set(token.id, v)
          const view = v
          this.ctx.tweens.add({ target: view, duration: 260, ease: ease.outBack, update: (k) => view.scale.set(lerp(0.4, 1, k)) })
        }
        const pts = wire.path.map(center)
        const src = this.board.buildings.find((b) => b.id === wire.from)!
        const a = token.prevIdx < 0 ? portDot(src, "out") : pts[token.prevIdx]!
        const b = pts[token.idx]!
        v.position.set(lerp(a.x, b.x, alpha), lerp(a.y, b.y, alpha))
      }
    }
    for (const [id, v] of this.tokenViews) {
      if (!seen.has(id) && !this.absorbing.has(id)) {
        v.destroy({ children: true })
        this.tokenViews.delete(id)
      }
    }
  }

  private onSim(e: SimEvent, tickMs: number) {
    this.ctx.publish({ _tag: "Sim", level: this.level.id, event: e })
    const v = "building" in e ? this.views.get(e.building) : undefined
    switch (e._tag) {
      case "Emit": {
        if (!v?.art) return
        const dot = portDot(v.building, "out")
        ring(this.fxLayer, this.ctx.tweens, dot.x, dot.y, palette.portOut, 10)
        if (v.building.kind === "source") {
          // The stamp slams down, then springs back up.
          const stamp = v.art.icon.children.slice(1)
          this.ctx.tweens.add({
            duration: Math.min(360, tickMs * 1.4),
            ease: ease.linear,
            update: (k) => {
              const push = k < 0.3 ? ease.inCubic(k / 0.3) : 1 - ease.outBack((k - 0.3) / 0.7)
              for (const c of stamp) c.y = push * 12
            }
          })
          this.smoke.puff(v.root.x + v.art.chimney.x, v.root.y + v.art.chimney.y, this.smokeColor(v), 8)
        }
        if (v.preview) {
          const p = v.preview
          v.preview = undefined
          this.ctx.tweens.add({ target: p, duration: 200, update: (k) => { p.alpha = 1 - k; p.scale.set(0.8 * (1 - k)) }, done: () => p.destroy({ children: true }) })
        }
        return
      }
      case "Absorb": {
        this.absorbInto(e.token, e.building, e.port, tickMs)
        return
      }
      case "ApplyStart": {
        if (!v?.art) return
        const art = v.art
        const left = art.icon.getChildByLabel("left")!
        const right = art.icon.getChildByLabel("right")!
        this.ctx.tweens.add({
          duration: Math.max(200, tickMs * 1.8),
          ease: ease.linear,
          update: (k) => {
            const s = ease.bump(k)
            left.x = -8 + s * 6
            right.x = 8 - s * 6
            art.body.scale.set(1 + s * 0.06, 1 - s * 0.08)
          }
        })
        this.smoke.puff(v.root.x + art.chimney.x, v.root.y + art.chimney.y, 0xd9707b, 9)
        return
      }
      case "Produced": {
        if (!v?.art) return
        const { label: text, color } = labelFor(e.term)
        const p = tokenArt(text, color)
        p.position.set(v.root.x + 20, v.root.y - 16)
        p.scale.set(0)
        this.fxLayer.addChild(p)
        v.preview?.destroy({ children: true })
        v.preview = p
        this.ctx.tweens.add({ target: p, duration: 300, ease: ease.outBack, update: (k) => p.scale.set(0.8 * k) })
        return
      }
      case "Accepted": {
        if (!v?.bin) return
        const bin = v.bin
        relabel(bin.counter, `${Math.min(e.count, e.quota)}/${e.quota}`)
        this.ctx.tweens.add({ duration: 320, ease: ease.linear, update: (k) => {
          bin.bubble.scale.set(1 + ease.bump(k) * 0.35)
          bin.box.scale.set(1 + ease.bump(k) * 0.06)
        } })
        ring(this.fxLayer, this.ctx.tweens, v.root.x + W / 2, v.root.y + H / 2, palette.bin, 40)
        if (e.count === e.quota) this.ctx.tweens.add({ duration: 420, ease: ease.outBack, update: (k) => bin.check.scale.set(k) })
        return
      }
      case "Rejected": {
        if (!v?.bin) return
        const bin = v.bin
        this.ctx.tweens.add({ duration: 360, ease: ease.linear, update: (k) => (bin.box.x = W / 2 + Math.sin(k * Math.PI * 6) * 8 * (1 - k)) })
        ring(this.fxLayer, this.ctx.tweens, v.root.x + W / 2, v.root.y + H / 2, palette.bad, 30)
        const x = label("✗", 30, palette.bad, "700")
        x.position.set(v.root.x + W / 2, v.root.y + H + 10)
        this.fxLayer.addChild(x)
        this.ctx.tweens.add({ duration: 700, update: (k) => { x.y = v.root.y + H + 10 - k * 30; x.alpha = 1 - k }, done: () => x.destroy() })
        return
      }
      case "Complete": {
        this.ctx.tweens.after(500, () => this.showComplete(e.stats))
        return
      }
    }
  }

  private absorbInto(token: Token, building: number, port: B.PortName, tickMs: number) {
    const v = this.tokenViews.get(token.id)
    const b = this.views.get(building)
    if (!v || !b) return
    this.absorbing.add(token.id)
    const from = { x: v.x, y: v.y }
    const to = portDot(b.building, port)
    this.ctx.tweens.add({
      target: v,
      duration: tickMs * 0.9,
      ease: ease.inCubic,
      update: (k) => {
        v.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k))
        v.scale.set(1 - k * 0.8)
      },
      done: () => {
        this.absorbing.delete(token.id)
        ring(this.fxLayer, this.ctx.tweens, to.x, to.y, palette.portIn, 9)
      }
    })
  }

  // -------------------------------------------------------------------------
  // Level complete
  // -------------------------------------------------------------------------

  private showComplete(stats: Stats) {
    this.setMode("paused")
    const best = this.prevBest
    const panel = new Container()
    const dim = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: palette.ink, alpha: 0.35 })
    dim.eventMode = "static"
    panel.addChild(dim)
    const paper = this.ctx.pack.papers.find((p) => p.id === this.level.paper)
    const card = new Container()
    const hasRight = paper !== undefined || (this.level.features ?? [this.level.sticker ?? ""]).some((f) => this.ctx.pack.usage?.[f])
    const cardX = hasRight ? DESIGN_W / 2 - 290 : BOARD_W / 2
    card.position.set(cardX, DESIGN_H / 2)
    card.addChild(new Graphics().roundRect(-330, -250, 660, 500, 28).fill(palette.cream).roundRect(-330, 236, 660, 14, 7).fill(palette.trayShade))
    const title = label("level complete!", 46, palette.red, "700")
    title.y = -196
    card.addChild(title)

    const sticker = this.level.sticker ? byName.get(this.level.sticker) : undefined
    const glyph = sticker
      ? stickerArt(sticker.name, sticker.bird, sticker.color, 120)
      : stickerArt(this.level.targets.map((t) => t.label).join(""), undefined, palette.bin, 120)
    glyph.position.set(0, -70)
    card.addChild(glyph)
    if (sticker) {
      const rule = label(sticker.rule, 24, palette.inkSoft, "600")
      rule.y = 22
      card.addChild(rule)
    }

    const stat = (name: string, value: number, prev: number | undefined, x: number) => {
      const n = label(name, 20, palette.inkSoft, "600")
      n.position.set(x, 64)
      const v = label(`${value}`, 40, palette.ink, "700")
      v.position.set(x, 100)
      const p = label(prev === undefined ? "first clear" : `best ${Math.min(prev, value)}`, 16, palette.inkSoft, "500")
      p.position.set(x, 132)
      card.addChild(n, v, p)
    }
    stat("machines", stats.machines, best?.machines, -200)
    stat("cycles", stats.cycles, best?.cycles, 0)
    stat("term size", stats.size, best?.size, 200)

    const next = this.ctx.pack.levels[this.ctx.pack.levels.findIndex((l) => l.id === this.level.id) + 1]
    const nextBtn = new Button({ width: 240, height: 64, color: palette.red, shade: palette.redShade, text: next ? "next level" : "menu", fontSize: 26, onTap: () => (next ? this.ctx.play(next.id) : this.ctx.menu()) }, this.ctx.tweens)
    nextBtn.position.set(130, 184)
    const keep = new Button({ width: 240, height: 64, color: palette.token, shade: palette.binShade, text: "keep building", fontSize: 26, onTap: () => this.closePanel() }, this.ctx.tweens)
    keep.position.set(-130, 184)
    card.addChild(nextBtn, keep)
    panel.addChild(card)
    this.view.addChild(panel)
    this.panel = panel

    card.scale.set(0.6)
    panel.alpha = 0
    this.ctx.tweens.add({ duration: 480, ease: ease.outBack, update: (k) => {
      panel.alpha = Math.min(1, k * 2)
      card.scale.set(lerp(0.6, 1, k))
      card.y = DESIGN_H / 2 + (1 - k) * 60
    } })
    this.ctx.tweens.add({ delay: 200, duration: 700, ease: ease.outElastic, update: (k) => {
      glyph.rotation = (1 - k) * -0.6
      glyph.scale.set(k)
    } })

    // Right column: the paper that introduced these combinators, and where
    // they show up in real software.
    const features = this.level.features ?? (this.level.sticker ? [this.level.sticker] : this.level.targets.map((t) => t.label))
    const snippets = features.flatMap((f) => this.ctx.pack.usage?.[f] ?? []).slice(0, 2)
    const right: Array<{ view: Container; h: number }> = []
    if (paper) right.push({ view: archiveArt(paper, 480, snippets.length ? 400 : 470), h: snippets.length ? 400 : 470 })
    if (snippets.length) {
      const u = usageArt(snippets, 480)
      right.push({ view: u.root, h: u.height })
    }
    const total = right.reduce((a, r) => a + r.h, 0) + (right.length - 1) * 40
    let y = DESIGN_H / 2 - total / 2
    right.forEach((r, i) => {
      const px = DESIGN_W / 2 + 340
      const py = y + r.h / 2
      y += r.h + 40
      r.view.position.set(px + 520, py)
      r.view.rotation = 0.22
      panel.addChild(r.view)
      this.ctx.tweens.add({ target: r.view, delay: 450 + i * 180, duration: 650, ease: ease.outBack, update: (k) => {
        r.view.x = lerp(px + 520, px, k)
        r.view.rotation = lerp(0.22, i % 2 === 0 ? 0.025 : -0.02, k)
      } })
    })
  }

  private closePanel() {
    this.panel?.destroy({ children: true })
    this.panel = undefined
    this.setMode("running", this.speed)
  }

  onEvent(e: GameEvent) {
    if (e._tag === "RecipeDiscovered") {
      const c = byName.get(e.name)
      const text = e.first ? `discovered ${e.name}${c ? ` — the ${c.bird.toLowerCase()}` : ""} · ${e.recipe}` : `new "${e.name}" recipe · ${e.recipe}`
      this.toasts.show(text, c?.shade ?? palette.ink)
    } else if (e._tag === "StickerEarned") {
      this.ctx.tweens.after(900, () => this.pile.drop(e.name, colorOf(e.name).color, 130, -60))
      this.toasts.show(`sticker earned · ${byName.get(e.name)?.bird.toLowerCase() ?? e.name}`, palette.greenShade)
    }
  }

  // -------------------------------------------------------------------------
  // Reduction theater
  // -------------------------------------------------------------------------

  private openTheater(spec: TheaterSpec) {
    if (this.theater || this.panel || this.view.destroyed) return
    if (this.mode === "running") this.setMode("paused")
    this.theater = new Theater(this.ctx.tweens, this.ctx.app.ticker, spec, () => (this.theater = undefined))
    this.view.addChild(this.theater)
  }

  private explainGoal(index: number) {
    const t = this.level.targets[index]
    if (!t) return
    const others = this.level.targets.length > 1 ? `  (bin ${index + 1} of ${this.level.targets.length})` : ""
    this.openTheater(goalSpec(t, this.level.blurb + others))
  }

  private explainMachine(kind: "source" | "apply", name: string | undefined) {
    if (kind === "apply") {
      return this.openTheater({
        title: "apply · the red factory",
        subtitle: "Function in the left port (f), argument in the right port (x).",
        term: app(variable("f"), variable("x")),
        rules: new Map(),
        note: "apply just glues f to x. The rewriting happens when a combinator has all of its arguments."
      })
    }
    const spec = name ? combinatorSpec(name) : undefined
    if (spec) return this.openTheater(spec)
    this.openTheater({
      title: `${name} · APL primitive`,
      subtitle: "An opaque function from the APL world.",
      term: apply(atom(name ?? "?"), [variable("w")]),
      rules: new Map(),
      note: `${name} has no rule here, so it never rewrites. Combinators only move it around.`
    })
  }

  private explainTerm(term: Term) {
    this.openTheater(termSpec(term, this.level.targets.length === 1 ? this.level.targets[0] : undefined))
  }

  destroy() {
    this.view.destroy({ children: true })
  }
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

type Pt = { x: number; y: number }

const polyline = (g: Graphics, pts: ReadonlyArray<Pt>) => {
  if (pts.length === 0) return
  g.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y)
}

const partial = (pts: ReadonlyArray<Pt>, t: number): Array<Pt> => {
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

const dashed = (g: Graphics, a: Pt, b: Pt) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const n = Math.floor(len / 14)
  for (let i = 0; i < n; i += 2) {
    const t0 = i / n
    const t1 = Math.min(1, (i + 1) / n)
    g.moveTo(lerp(a.x, b.x, t0), lerp(a.y, b.y, t0)).lineTo(lerp(a.x, b.x, t1), lerp(a.y, b.y, t1))
  }
}

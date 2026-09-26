/**
 * One level of the combinator game. This scene owns the state and wires
 * together the parts that draw it:
 * - the board (a pure `Board` from core), shown by `BoardView` and changed only through
 *   `BoardEditor` → `commit`;
 * - the run mode (stopped / running / paused, and at what speed): each tick steps the `Sim`,
 *   and `SimAnimator` animates what happened;
 * - the tray (`levelTray`), the controls and toasts;
 * - the level-complete panel;
 * - the reduction theater for goals, machines and tokens.
 */
import { Container, type Graphics, type Text } from "pixi.js"
import * as B from "@lambda-factori/core/Board.ts"
import { byName, colorOf } from "@lambda-factori/core/Catalogue.ts"
import type { Level } from "@lambda-factori/core/Level.ts"
import { Sim, type Stats } from "@lambda-factori/core/Sim.ts"
import type { Term } from "@lambda-factori/core/Term.ts"
import type { GameEvent } from "../game/Events.ts"
import { BoardEditor } from "./BoardEditor.ts"
import { BoardView } from "./BoardView.ts"
import { Button } from "./Button.ts"
import { icons } from "./icons.ts"
import { label, relabel } from "./label.ts"
import { levelCompletePanel } from "./LevelComplete.ts"
import { levelTray } from "./LevelTray.ts"
import type { GameContext } from "../plugins/combinators/GameContext.ts"
import type { Scene } from "../kernel/Scene.ts"
import { SimAnimator } from "./SimAnimator.ts"
import type { StickerPile } from "./StickerPile.ts"
import { Theater } from "./Theater.ts"
import { goalSpec, machineSpec, termSpec, type TheaterSpec } from "./TheaterSpec.ts"
import { BOARD_W, DESIGN_H, FAST_FACTOR, palette, TICK_MS } from "./theme.ts"
import { Toasts } from "./Toasts.ts"

type Mode = "stopped" | "running" | "paused"

export class LevelScene implements Scene {
  readonly view = new Container()
  private readonly floor: BoardView
  private readonly editor: BoardEditor
  private readonly animator: SimAnimator
  private readonly toasts: Toasts
  private readonly pile: StickerPile
  private readonly cycleText: Text
  private readonly buttons: Record<"play" | "fast" | "pause" | "stop", Button>

  private board: B.Board
  private sim: Sim | undefined
  private mode: Mode = "stopped"
  private speed = 1
  /** Milliseconds banked towards the next simulation tick. */
  private acc = 0
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
    this.board = saved && saved.buildings.filter((b) => b.kind === "bin").length === level.targets.length
      ? (saved as B.Board)
      : B.emptyBoard(level.targets.length)

    this.floor = new BoardView({ level, board: this.board, tweens: ctx.tweens, onBinTap: (i) => this.explainGoal(i) })
    this.view.addChild(this.floor.root)
    this.editor = new BoardEditor({
      floor: this.floor,
      board: () => this.board,
      commit: (next, after) => this.commit(next, after),
      beginEdit: () => this.stopForEdit(),
      blocked: () => this.panel !== undefined || this.theater !== undefined,
      explainMachine: (kind, atom) => this.openTheater(machineSpec(kind, atom))
    }, this.view)
    this.animator = new SimAnimator({ floor: this.floor, tweens: ctx.tweens, board: () => this.board, onTokenTap: (t) => this.explainTerm(t) })

    const ui = new Container()
    const tray = levelTray({ level, pack: ctx.pack, stickers: ctx.progress().stickers, onGrab: (kind, atom, e) => this.editor.grab(kind, atom, e) })
    this.pile = tray.pile
    ui.addChild(tray.root)

    const button = (icon: (g: Graphics) => void, color: number, shade: number, x: number, y: number, onTap: () => void) => {
      const b = new Button({ width: 64, height: 58, color, shade, icon, onTap }, ctx.tweens)
      b.position.set(x, y)
      ui.addChild(b)
      return b
    }
    const row = DESIGN_H - 56
    this.buttons = {
      play: button(icons.play, palette.blue, 0x1f4c85, 56, row, () => this.setMode("running", 1)),
      fast: button(icons.fast, palette.blue, 0x1f4c85, 136, row, () => this.setMode("running", FAST_FACTOR)),
      pause: button(icons.pause, palette.yellow, 0xc8902c, 216, row, () => this.setMode("paused")),
      stop: button(icons.stop, palette.red, palette.redShade, 296, row, () => this.setMode("stopped"))
    }
    this.cycleText = label("", 22, palette.inkSoft, "600", "left")
    this.cycleText.position.set(356, DESIGN_H - 58)
    ui.addChild(this.cycleText)
    button(icons.menu, palette.token, palette.binShade, 56, 50, () => ctx.menu())
    button(icons.hint, palette.token, palette.binShade, 56, 126, () => this.toasts.show(level.hint ? `hint · ${level.hint}` : "no hint — you've got this", palette.inkSoft))
    button(icons.eye, palette.green, palette.greenShade, 56, 202, () => this.explainGoal(0))

    this.toasts = new Toasts(ctx.tweens)
    this.toasts.position.set(BOARD_W / 2, 196)
    ui.addChild(this.toasts)
    this.view.addChild(ui)

    this.updateButtons()
    // First visit: show what the goal combinator does before building anything.
    if (!ctx.progress().completed[level.id]) ctx.tweens.after(450, () => this.explainGoal(0))
    this.toasts.show(level.targets.length > 1 ? `spell ${level.targets.map((t) => t.label).join(" ")}` : `build ${level.targets[0].label}`)
  }

  // -------------------------------------------------------------------------
  // Board and run mode
  // -------------------------------------------------------------------------

  private commit(next: B.Board, after?: () => void) {
    if (next === this.board) return
    this.stopForEdit()
    this.board = next
    this.floor.sync(next)
    this.ctx.saveBoard(this.level.id, next)
    after?.()
  }

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
    if (mode === "stopped") {
      this.sim = undefined
      this.animator.reset()
      relabel(this.cycleText, "", "left")
    }
    this.mode = mode
    this.speed = speed
    this.updateButtons()
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
    this.floor.smoke.tick(dt)
    this.pile.tick(dt)
    const tickMs = TICK_MS / this.speed
    if (this.mode === "running" && this.sim) {
      this.acc += dt
      // Never simulate more than a handful of ticks per frame, even after a stall.
      let n = 0
      while (this.acc >= tickMs && n++ < 8) {
        this.acc -= tickMs
        for (const e of this.sim.step()) {
          this.ctx.publish({ _tag: "Sim", level: this.level.id, event: e })
          if (e._tag === "Complete") this.ctx.tweens.after(500, () => this.showComplete(e.stats))
          else this.animator.event(e, tickMs)
        }
      }
      this.acc = Math.min(this.acc, tickMs)
      relabel(this.cycleText, `cycle ${this.sim.tick}`, "left")
    }
    this.animator.syncTokens(this.sim, this.mode === "running" ? this.acc / tickMs : 1)
    this.animator.idle(dt, this.mode === "running")
  }

  onKey(e: KeyboardEvent) {
    if (this.theater) return this.theater.onKey(e)
    if (e.code === "Space") {
      e.preventDefault()
      this.setMode(this.mode === "running" ? "paused" : "running", this.speed)
    } else if (e.code === "Escape") this.editor.cancel()
  }

  // -------------------------------------------------------------------------
  // Level complete, progress toasts
  // -------------------------------------------------------------------------

  private showComplete(stats: Stats) {
    this.setMode("paused")
    this.panel = levelCompletePanel({
      level: this.level,
      pack: this.ctx.pack,
      stats,
      best: this.prevBest,
      tweens: this.ctx.tweens,
      onNext: (id) => (id ? this.ctx.play(id) : this.ctx.menu()),
      onKeep: () => this.closePanel()
    })
    this.view.addChild(this.panel)
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

  private explainTerm(term: Term) {
    this.openTheater(termSpec(term, this.level.targets.length === 1 ? this.level.targets[0] : undefined))
  }

  destroy() {
    this.view.destroy({ children: true })
  }
}

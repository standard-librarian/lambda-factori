/**
 * The program strip on the right of an office room, as in Human Resource
 * Machine: a title card, one command block per line (numbered, with notes
 * as handwritten rows), curved jump arrows in lanes, and a green pointer plus
 * a glow on the line being run.
 */
import { Container, Graphics, Text } from "pixi.js"
import type { OfficeSpec } from "@lambda-factori/contracts/OfficeSpec.ts"
import { label } from "../../render/label.ts"
import { FONT } from "../../render/theme.ts"
import { lerp, type Tweens } from "../../kernel/tween.ts"
import { commandArt } from "./commandArt.ts"
import { office } from "./officePalette.ts"
import { PANEL_X, ROOM_H } from "./layout.ts"
import type { Line, Op } from "./program.ts"

const ROW_H = 48

/** What a command block says: its verb, and its argument if any. */
const blockText = (o: Op): [string, string | undefined] => {
  switch (o.op) {
    case "copyfrom":
    case "copyto":
    case "add":
    case "sub":
    case "bump+":
    case "bump-":
      return [o.op, o.indirect ? `[${o.tile}]` : o.tile]
    case "jump":
      return ["jump", undefined]
    case "jumpz":
      return ["jump if zero", undefined]
    case "jumpn":
      return ["jump if neg", undefined]
    case "label":
      return ["", undefined]
    case "say":
    case "think":
    case "boss":
      return [o.op === "boss" ? "boss:" : o.op, `“${o.text}”`]
    case "note":
      return ["", o.text]
    case "clerk":
      return [`${o.desk}:`, `“${o.text}”`]
    case "visit":
    case "pass":
    case "work":
      return [o.op, o.desk]
    case "hold":
      return ["hold", String(o.value)]
    default:
      return [o.op === "inbox" ? "→ inbox" : o.op === "outbox" ? "outbox →" : o.op, undefined]
  }
}

export class ProgramStrip {
  /** The panel itself (placed at `PANEL_X`). */
  readonly root = new Container()
  /** The green arrow; it sits on the room's edge, so the owner adds it to the stage. */
  readonly pointer = new Graphics().poly([0, -20, 26, 0, 0, 20]).fill(0x7fcf3f).stroke({ width: 3, color: 0x3f6f1f })
  private readonly glow = new Graphics()
  private readonly rowY = new Map<number, number>()
  private readonly visible: ReadonlyArray<Line>
  private readonly listTop: number
  private readonly listScale: number
  private readonly hidden: boolean
  private readonly tweens: Tweens

  constructor(spec: OfficeSpec, program: ReadonlyArray<Line>, tweens: Tweens) {
    this.tweens = tweens
    this.hidden = spec.hideProgram === true
    this.visible = this.hidden ? [] : program
    this.root.position.set(PANEL_X, 0)
    this.root.addChild(new Graphics().rect(0, 0, 1920 - PANEL_X, ROOM_H).fill(office.paper).rect(0, 0, 44, ROOM_H).fill(office.gutter).rect(-8, 0, 8, ROOM_H).fill({ color: 0x000000, alpha: 0.25 }))

    // The title card: slide title and caption.
    const head = new Container()
    const headT = new Text({ text: spec.title ?? "", style: { fontFamily: FONT, fontSize: 34, fontWeight: "700", fill: 0x6b5847, wordWrap: true, wordWrapWidth: 420, lineHeight: 38 } })
    headT.position.set(20, 18)
    const cap = new Text({ text: spec.caption ?? "", style: { fontFamily: FONT, fontSize: 20, fontWeight: "600", fill: 0x3b2e25, wordWrap: true, wordWrapWidth: 420, lineHeight: 25 } })
    cap.position.set(20, headT.height + 30)
    const headH = headT.height + (spec.caption ? cap.height + 24 : 0) + 44
    head.addChild(new Graphics().roundRect(0, 0, 460, headH, 10).fill(office.paperLight), headT, cap)
    head.position.set(30, 22)
    this.root.addChild(head)

    // The command list, scaled down to fit if the program is long.
    this.listTop = head.y + headH + 26
    const list = new Container()
    list.position.set(0, this.listTop)
    this.root.addChild(list)
    this.listScale = Math.min(1, (ROOM_H - this.listTop - 30) / Math.max(1, this.visible.length * ROW_H))
    list.scale.set(this.listScale)
    this.visible.forEach((l, i) => {
      const y = i * ROW_H
      this.rowY.set(i, y)
      const row = new Container()
      row.position.set(0, y)
      if (l.number !== undefined) {
        const n = label(String(l.number).padStart(2, "0"), 20, office.lineNo, "700", "right")
        n.position.set(38, 19)
        row.addChild(n)
      }
      const [name, arg] = blockText(l.op)
      if (l.op.op === "note") {
        const t = new Text({ text: arg ?? "", style: { fontFamily: FONT, fontSize: 19, fontStyle: "italic", fill: 0x5b4a3c, wordWrap: true, wordWrapWidth: 360 } })
        t.position.set(60, 10)
        row.addChild(new Graphics().roundRect(52, 4, Math.min(380, t.width + 18), 38, 6).fill({ color: 0xffffff, alpha: 0.35 }), t)
      } else {
        const block = commandArt(name, l.op.op, arg, 390)
        block.position.set(52, 4)
        row.addChild(block)
      }
      list.addChild(row)
    })
    list.addChildAt(this.jumpArrows(), 0)
    list.addChildAt(this.glow, 0)
    this.pointer.position.set(PANEL_X - 18, this.listTop + 24 * this.listScale)
    this.pointer.visible = false
  }

  /** Point at program line `pc`, gliding there if `animate`. */
  pointAt(pc: number, animate: boolean) {
    const y = this.rowY.get(Math.min(pc, this.visible.length - 1))
    this.pointer.visible = y !== undefined && !this.hidden
    if (y === undefined) return
    const ty = this.listTop + (y + 24) * this.listScale
    this.glow.clear().roundRect(48, y + 1, 400, 44, 8).fill({ color: 0xfff6c8, alpha: 0.55 })
    if (!animate) this.pointer.y = ty
    else {
      const from = this.pointer.y
      this.tweens.add({ target: this.pointer, duration: 140, update: (k) => (this.pointer.y = lerp(from, ty, k)) })
    }
  }

  showPointer(on: boolean) {
    this.pointer.visible = on && !this.hidden
  }

  /** Curves from each jump to its label, in lanes on the right. */
  private jumpArrows() {
    const arrows = new Graphics()
    let lane = 0
    this.visible.forEach((l, i) => {
      if (l.op.op !== "jump" && l.op.op !== "jumpz" && l.op.op !== "jumpn") return
      const target = l.op.label
      const j = this.visible.findIndex((x) => x.op.op === "label" && x.op.label === target)
      if (j < 0) return
      const y1 = this.rowY.get(i)! + 24
      const y2 = this.rowY.get(j)! + 24
      const x1 = l.op.op === "jump" ? 132 : 210
      const xr = 440 + (lane++ % 4) * 12
      arrows.moveTo(x1, y1).bezierCurveTo(xr, y1, xr, y2, 130, y2)
      arrows.stroke({ width: 5, color: office.arrow, alpha: 0.9, cap: "round" })
      arrows.poly([126, y2, 142, y2 - 9, 142, y2 + 9]).fill(office.arrow)
    })
    return arrows
  }
}

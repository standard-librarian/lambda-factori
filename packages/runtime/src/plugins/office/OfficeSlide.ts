import { Container, Graphics, Text } from "pixi.js"
import { label } from "../../render/art.ts"
import { FONT } from "../../render/theme.ts"
import { ease, lerp } from "../../render/tween.ts"
import { Button } from "../../render/ui.ts"
import type { SlideContext, SlideView } from "../deck/slides/common.ts"
import {
  BOX,
  beltArt,
  bossArt,
  boxArt,
  bubbleArt,
  commandArt,
  deskArt,
  office,
  roomArt,
  rugArt,
  workerArt,
  CARRY_Y,
  type WorkerArt
} from "./art.ts"
import type { OfficeSpec } from "@lambda-factori/contracts/OfficeSpec.ts"
import { type Action, check, type Line, parseProgram, run, type State, type Trace, type Value } from "./vm.ts"

const W = 1400
const H = 1080
const PANEL_X = 1400
const FLOOR = { fx: 150, fy: 170, fw: 1100 }
const IN_X = 228
const OUT_X = 1172
const BELT_TOP = 400
const SLOT = 74
const IN_SPOT = { x: 322, y: 470 }
const OUT_SPOT = { x: 1078, y: 470 }
const SCALE = 1.25

type Pt = { x: number; y: number }

/** Promise-returning tween so action scripts read top to bottom. */
const tweenP = (ctx: SlideContext, target: Container, ms: number, update: (k: number) => void, e = ease.inOutSine) =>
  new Promise<void>((resolve) => ctx.tweens.add({ target, duration: ms, ease: e, update, done: resolve }))

export const officeSlide = (spec: OfficeSpec, ctx: SlideContext): SlideView => {
  const v = new Container()
  const program: ReadonlyArray<Line> = parseProgram(spec.program)
  const tiles = spec.tiles ?? []
  const desks = spec.desks ?? []
  const world = {
    inbox: spec.inbox ?? [],
    tiles: new Map<string, Value | undefined>(tiles.map((t) => [t.id, t.value])),
    desks: new Map(desks.map((d) => [d.id, { id: d.id, work: d.work, gives: d.gives }]))
  }
  const trace: Trace = run(program, world)
  const result = check(trace, spec.expect)

  // --- Room ------------------------------------------------------------------
  v.addChild(roomArt({ w: W, h: H, ...FLOOR, fh: H - FLOOR.fy }, spec.night))
  const inBelt = beltArt("in", 600)
  inBelt.root.position.set(IN_X, BELT_TOP - 50)
  inBelt.sign.position.set(78, 640)
  const outBelt = beltArt("out", 600)
  outBelt.root.position.set(OUT_X, BELT_TOP - 50)
  outBelt.sign.position.set(W - 78, 640)
  inBelt.drawRollers(0)
  outBelt.drawRollers(0)
  v.addChild(inBelt.root, outBelt.root, inBelt.sign, outBelt.sign)

  // Memory tiles on a rug, HRM-style, numbered or labelled.
  const cols = Math.min(5, Math.max(1, tiles.length))
  const rows = Math.max(1, Math.ceil(tiles.length / cols))
  const cell = 116
  const rugX = FLOOR.fx + FLOOR.fw / 2 - (cols * cell) / 2
  const rugY = desks.length > 4 ? 860 : desks.length ? 730 : 600
  const tilePos = new Map<string, Pt>()
  tiles.forEach((t, i) => tilePos.set(t.id, { x: rugX + (i % cols) * cell + cell / 2, y: rugY + Math.floor(i / cols) * cell + cell / 2 }))
  if (tiles.length) {
    const rug = rugArt(cols, rows, cell, new Map(tiles.map((t, i) => [i, t.label ?? t.id])))
    rug.position.set(rugX, rugY)
    v.addChild(rug)
  }

  // Desks: the modules a request travels through.
  const deskPos = new Map<string, Pt>()
  const deskViews = new Map<string, ReturnType<typeof deskArt>>()
  desks.forEach((d, i) => {
    // A regular grid: up to four desks per row, rows centred.
    const perRow = Math.min(4, desks.length)
    const row = Math.floor(i / perRow)
    const inRow = Math.min(perRow, desks.length - row * perRow)
    const pitch = 200
    const x = d.x ?? FLOOR.fx + FLOOR.fw / 2 + (i % perRow - (inRow - 1) / 2) * pitch
    const y = d.y ?? (desks.length > 4 ? 470 + row * 290 : 450)
    const art = deskArt(d.label ?? d.id, d.color ? Number.parseInt(d.color.replace("#", ""), 16) : 0x6d4a36, i)
    art.root.position.set(x, y)
    art.root.scale.set(0.9)

    v.addChild(art.root)
    deskPos.set(d.id, { x, y })
    deskViews.set(d.id, art)
  })

  const boss = bossArt()
  boss.position.set(FLOOR.fx + FLOOR.fw / 2 + 200, 262)
  boss.scale.set(0.85)
  v.addChild(boss)

  const items = new Container()
  const workerLayer = new Container()
  const fx = new Container()
  v.addChild(items, workerLayer, fx)

  const worker: WorkerArt = workerArt(spec.worker?.style ?? 0)
  worker.root.scale.set(SCALE)
  workerLayer.addChild(worker.root)

  // --- Program strip -----------------------------------------------------------
  const panel = new Container()
  panel.position.set(PANEL_X, 0)
  v.addChild(panel)
  panel.addChild(new Graphics().rect(0, 0, 1920 - PANEL_X, H).fill(office.paper).rect(0, 0, 44, H).fill(office.gutter).rect(-8, 0, 8, H).fill({ color: 0x000000, alpha: 0.25 }))
  const head = new Container()
  const headT = new Text({ text: spec.title ?? "", style: { fontFamily: FONT, fontSize: 34, fontWeight: "700", fill: 0x6b5847, wordWrap: true, wordWrapWidth: 420, lineHeight: 38 } })
  headT.position.set(20, 18)
  const cap = new Text({ text: spec.caption ?? "", style: { fontFamily: FONT, fontSize: 20, fontWeight: "600", fill: 0x3b2e25, wordWrap: true, wordWrapWidth: 420, lineHeight: 25 } })
  cap.position.set(20, headT.height + 30)
  const headH = headT.height + (spec.caption ? cap.height + 24 : 0) + 44
  head.addChild(new Graphics().roundRect(0, 0, 460, headH, 10).fill(office.paperLight), headT, cap)
  head.position.set(30, 22)
  panel.addChild(head)
  const listTop = head.y + headH + 26
  const listAvail = H - listTop - 30
  const list = new Container()
  list.position.set(0, listTop)
  panel.addChild(list)
  const visible = spec.hideProgram ? [] : program
  const rowH = 48
  const listScale = Math.min(1, listAvail / Math.max(1, visible.length * rowH))
  list.scale.set(listScale)
  const rowY = new Map<number, number>()
  const blocks: Array<{ at: number; view: Container }> = []
  visible.forEach((l, i) => {
    const y = i * rowH
    rowY.set(i, y)
    const row = new Container()
    row.position.set(0, y)
    if (l.number !== undefined) {
      const n = label(String(l.number).padStart(2, "0"), 20, office.lineNo, "700", "right")
      n.position.set(38, 19)
      row.addChild(n)
    }
    const o = l.op
    const [name, arg] = (() => {
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
    })()
    if (o.op === "note") {
      const t = new Text({ text: arg ?? "", style: { fontFamily: FONT, fontSize: 19, fontStyle: "italic", fill: 0x5b4a3c, wordWrap: true, wordWrapWidth: 360 } })
      t.position.set(60, 10)
      row.addChild(new Graphics().roundRect(52, 4, Math.min(380, t.width + 18), 38, 6).fill({ color: 0xffffff, alpha: 0.35 }), t)
    } else {
      const block = commandArt(name, o.op, arg, 390)
      block.position.set(52, 4)
      row.addChild(block)
      blocks.push({ at: i, view: block })
    }
    list.addChild(row)
  })
  // Jump arrows: curves from each jump to its label, in lanes on the right.
  const arrows = new Graphics()
  let lane = 0
  visible.forEach((l, i) => {
    if (l.op.op !== "jump" && l.op.op !== "jumpz" && l.op.op !== "jumpn") return
    const target = l.op.label
    const j = visible.findIndex((x) => x.op.op === "label" && x.op.label === target)
    if (j < 0) return
    const y1 = rowY.get(i)! + 24
    const y2 = rowY.get(j)! + 24
    const x1 = l.op.op === "jump" ? 132 : 210
    const xr = 440 + (lane++ % 4) * 12
    arrows.moveTo(x1, y1).bezierCurveTo(xr, y1, xr, y2, 130, y2)
    arrows.stroke({ width: 5, color: office.arrow, alpha: 0.9, cap: "round" })
    arrows.poly([126, y2, 142, y2 - 9, 142, y2 + 9]).fill(office.arrow)
  })
  list.addChildAt(arrows, 0)
  const pointer = new Graphics().poly([0, -20, 26, 0, 0, 20]).fill(0x7fcf3f).stroke({ width: 3, color: 0x3f6f1f })
  pointer.position.set(PANEL_X - 18, listTop + 24 * listScale)
  pointer.visible = false
  v.addChild(pointer)
  const glow = new Graphics()
  list.addChildAt(glow, 0)

  // --- Stats and controls ---------------------------------------------------------
  const statsBox = new Container()
  statsBox.position.set(FLOOR.fx + 20, FLOOR.fy + 20)
  v.addChild(statsBox)
  const statKinds = spec.stats ?? ["steps", "size"]
  const statTexts = statKinds.map((k, i) => {
    const t = label("", 22, 0xfff3e3, "700", "left")
    const chip = new Container()
    chip.addChild(new Graphics().roundRect(0, -19, 200, 38, 19).fill({ color: 0x2a1a12, alpha: 0.55 }), t)
    t.position.set(16, 0)
    chip.position.set(i * 214, 0)
    statsBox.addChild(chip)
    return { kind: k, t }
  })
  const size = program.filter((l) => l.number !== undefined).length
  const drawStats = (s: State) => {
    for (const st of statTexts) {
      const value = st.kind === "steps" ? `steps ${s.steps}` : st.kind === "size" ? `size ${size}` : st.kind === "trips" ? `trips ${s.trips}` : `in your head ${[...s.tiles.values()].filter((x) => x !== undefined).length + (s.hand === undefined ? 0 : 1)}`
      st.t.text = value
    }
  }

  // --- Visual state -------------------------------------------------------------
  let inboxViews: Array<Container> = []
  let outboxViews: Array<Container> = []
  const tileViews = new Map<string, Container>()
  let handView: Container | undefined
  let bubble: Container | undefined
  let bossBubble: Container | undefined
  const clerkBubbles = new Map<string, Container>()
  let place: Pt = { x: FLOOR.fx + FLOOR.fw / 2 - 150, y: desks.length ? 660 : 520 }

  const spotOf = (where: string | undefined): Pt => {
    if (!where) return place
    if (where === "inbox") return IN_SPOT
    if (where === "outbox") return OUT_SPOT
    const t = tilePos.get(where)
    if (t) return { x: t.x, y: t.y + 96 }
    const d = deskPos.get(where)
    if (d) return { x: d.x, y: d.y + 205 }
    return place
  }
  const inSlot = (i: number): Pt => ({ x: IN_X, y: BELT_TOP + i * SLOT })
  const outSlot = (i: number): Pt => ({ x: OUT_X, y: BELT_TOP + i * SLOT })

  const setHand = (value: Value | undefined) => {
    handView?.destroy({ children: true })
    handView = undefined
    worker.setArms(value !== undefined)
    if (value === undefined) return
    handView = boxArt(value)
    worker.carry.addChild(handView)
  }

  const snap = (s: State, where: string | undefined) => {
    for (const b of inboxViews) b.destroy({ children: true })
    for (const b of outboxViews) b.destroy({ children: true })
    inboxViews = s.inbox.slice(0, 9).map((val, i) => {
      const b = boxArt(val)
      b.position.copyFrom(inSlot(i))
      items.addChild(b)
      return b
    })
    // Newest outbox item sits at the top of the belt.
    outboxViews = [...s.outbox].reverse().slice(0, 9).map((val, i) => {
      const b = boxArt(val)
      b.position.copyFrom(outSlot(i))
      items.addChild(b)
      return b
    })
    for (const b of tileViews.values()) b.destroy({ children: true })
    tileViews.clear()
    s.tiles.forEach((val, id) => {
      const p = tilePos.get(id)
      if (!p || val === undefined) return
      const b = boxArt(val)
      b.position.copyFrom(p)
      items.addChild(b)
      tileViews.set(id, b)
    })
    setHand(s.hand)
    place = spotOf(where)
    worker.root.position.copyFrom(place)
    drawStats(s)
  }

  const pointAt = (pc: number, animate: boolean) => {
    const y = rowY.get(Math.min(pc, visible.length - 1))
    pointer.visible = y !== undefined && !spec.hideProgram
    if (y === undefined) return
    const ty = listTop + (y + 24) * listScale
    glow.clear().roundRect(48, y + 1, 400, 44, 8).fill({ color: 0xfff6c8, alpha: 0.55 })
    if (!animate) pointer.y = ty
    else {
      const from = pointer.y
      ctx.tweens.add({ target: pointer, duration: 140, update: (k) => (pointer.y = lerp(from, ty, k)) })
    }
  }

  /** One voice at a time, as in HRM: a new line fades out everyone else. */
  const hush = (except?: Container) => {
    const all = [bubble, bossBubble, ...clerkBubbles.values()].filter((b): b is Container => !!b && b !== except && !b.destroyed)
    for (const b of all) ctx.tweens.add({ target: b, duration: 180, update: (k) => (b.alpha = 1 - k), done: () => b.destroy({ children: true }) })
    if (bubble && bubble !== except) bubble = undefined
    if (bossBubble && bossBubble !== except) bossBubble = undefined
    for (const [k, b] of clerkBubbles) if (b !== except) clerkBubbles.delete(k)
  }
  const say = (text: string, tone: "say" | "think" | "error" = "say") => {
    hush()
    bubble = bubbleArt(text, 440, worker.root.x > 900 ? "right" : "left", tone)
    bubble.position.set(worker.root.x + (worker.root.x > 900 ? -10 : 10), worker.root.y - 205 * SCALE)
    bubble.scale.set(0.6)
    fx.addChild(bubble)
    const b = bubble
    ctx.tweens.add({ target: b, duration: 260, ease: ease.outBack, update: (k) => b.scale.set(lerp(0.6, 1, k)) })
  }
  const bossSays = (text: string, tone: "say" | "error" = "say") => {
    hush()
    bossBubble = bubbleArt(text, 480, "right", tone)
    bossBubble.position.set(boss.x - 60, boss.y - 90)
    bossBubble.scale.set(0.6)
    fx.addChild(bossBubble)
    const b = bossBubble
    ctx.tweens.add({ target: b, duration: 260, ease: ease.outBack, update: (k) => b.scale.set(lerp(0.6, 1, k)) })
  }
  const clerkSays = (desk: string, text: string) => {
    const d = deskPos.get(desk)
    if (!d) return
    hush()
    const q = bubbleArt(text, 520, d.x > 700 ? "right" : "left", "say")
    q.position.set(d.x + (d.x > 700 ? -20 : 20), d.y - 70)
    q.scale.set(0.6)
    fx.addChild(q)
    clerkBubbles.set(desk, q)
    ctx.tweens.add({ target: q, duration: 260, ease: ease.outBack, update: (k) => q.scale.set(lerp(0.6, 1, k)) })
  }
  const clearBubbles = () => {
    for (const b of clerkBubbles.values()) b.destroy({ children: true })
    clerkBubbles.clear()
    bubble?.destroy({ children: true })
    bubble = undefined
    bossBubble?.destroy({ children: true })
    bossBubble = undefined
  }

  // --- Animations -----------------------------------------------------------------
  let speed = spec.speed ?? 1
  let gen = 0
  const ms = (t: number) => t / speed

  let moving = false
  const walk = async (to: Pt, g: number) => {
    const from = { x: worker.root.x, y: worker.root.y }
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    if (dist < 4) return
    const dur = ms(Math.max(220, dist / 0.95))
    const strides = Math.max(2, Math.round(dist / 70))
    worker.look(Math.sign(to.x - from.x) * 0.8, Math.sign(to.y - from.y) * 0.5)
    const carrying = handView !== undefined
    moving = true
    await tweenP(ctx, worker.root, dur, (k) => {
      if (g !== gen) return
      worker.root.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k))
      // A quick shuffle: two bounces per stride, a side-to-side waddle, the head lagging a little.
      const phase = Math.sin(k * Math.PI * strides)
      const bounce = Math.abs(phase)
      worker.body.y = -bounce * 6
      worker.head.y = -bounce * 9
      worker.carry.y = CARRY_Y - bounce * 9
      worker.root.rotation = phase * 0.07
      worker.head.rotation = -phase * 0.04
      worker.legs[0].rotation = phase * 0.55
      worker.legs[1].rotation = -phase * 0.55
      if (!carrying) worker.setArms(false, phase)
    }, ease.linear)
    worker.body.y = 0
    worker.head.y = 0
    worker.head.rotation = 0
    worker.carry.y = CARRY_Y
    worker.root.rotation = 0
    worker.legs[0].rotation = 0
    worker.legs[1].rotation = 0
    if (!carrying) worker.setArms(false)
    worker.look(0, 0)
    moving = false
  }

  /** Squash down, stretch up: the stomp every tile command does. */
  const stomp = (g: number) =>
    tweenP(ctx, worker.root, ms(260), (k) => {
      if (g !== gen) return
      const s = ease.bump(k)
      worker.root.scale.set(SCALE * (1 + s * 0.12), SCALE * (1 - s * 0.14))
    }, ease.linear).then(() => worker.root.scale.set(SCALE))

  const hop = (g: number) =>
    tweenP(ctx, worker.root, ms(300), (k) => {
      if (g !== gen) return
      worker.body.y = -ease.bump(k) * 26
      worker.head.y = -ease.bump(k) * 30
      worker.carry.y = CARRY_Y - ease.bump(k) * 30
    }, ease.linear)

  const fly = async (box: Container, to: Pt, dur: number, arc = 60) => {
    const from = { x: box.x, y: box.y }
    await tweenP(ctx, box, ms(dur), (k) => {
      box.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k) - Math.sin(Math.PI * k) * arc)
    })
  }

  const poof = (box: Container) => {
    ctx.tweens.add({ target: box, duration: ms(220), update: (k) => {
      box.scale.set(1 + k * 0.4)
      box.alpha = 1 - k
    }, done: () => box.destroy({ children: true }) })
  }

  const handWorld = (): Pt => ({ x: worker.root.x, y: worker.root.y + CARRY_Y * SCALE })

  const shiftBelt = (views: Array<Container>, slot: (i: number) => Pt, belt: typeof inBelt, dir: number) => {
    views.forEach((b, i) => {
      const to = slot(i)
      const from = { x: b.x, y: b.y }
      ctx.tweens.add({ target: b, duration: ms(260), update: (k) => b.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k)) })
    })
    let off = 0
    ctx.tweens.add({ target: belt.rollers, duration: ms(260), update: (k) => belt.drawRollers((off = k * SLOT * dir)) })
    void off
  }

  const animate = async (a: Action, g: number) => {
    const o = a.op
    pointAt(a.at, true)
    if (o.op !== "say" && o.op !== "think" && o.op !== "boss") bubble && ctx.tweens.add({ target: bubble, duration: 200, update: (k) => bubble && (bubble.alpha = 1 - k) })
    if (a.place) await walk(spotOf(a.place), g)
    if (g !== gen) return
    switch (o.op) {
      case "inbox": {
        const b = inboxViews.shift()
        if (b) {
          await fly(b, handWorld(), 260, 40)
          b.destroy({ children: true })
        }
        setHand(a.to.hand)
        // Refill the visible queue and slide it up.
        const shown = a.to.inbox.slice(0, 9)
        while (inboxViews.length < shown.length) {
          const nb = boxArt(shown[inboxViews.length]!)
          nb.position.copyFrom(inSlot(inboxViews.length + 1))
          items.addChild(nb)
          inboxViews.push(nb)
        }
        shiftBelt(inboxViews, inSlot, inBelt, -1)
        break
      }
      case "outbox": {
        const val = a.from.hand!
        setHand(undefined)
        const b = boxArt(val)
        b.position.copyFrom(handWorld())
        items.addChild(b)
        outboxViews.unshift(b)
        shiftBelt(outboxViews.slice(1), (i) => outSlot(i + 1), outBelt, 1)
        await fly(b, outSlot(0), 260, 40)
        if (outboxViews.length > 9) outboxViews.pop()?.destroy({ children: true })
        break
      }
      case "copyfrom": {
        await stomp(g)
        const src = tileViews.get(a.place!)
        const copy = boxArt(a.to.hand!)
        copy.position.copyFrom(src?.position ?? handWorld())
        fx.addChild(copy)
        await fly(copy, handWorld(), 260, 30)
        copy.destroy({ children: true })
        setHand(a.to.hand)
        break
      }
      case "copyto": {
        await stomp(g)
        const old = tileViews.get(a.place!)
        const copy = boxArt(a.from.hand!)
        copy.position.copyFrom(handWorld())
        items.addChild(copy)
        await fly(copy, tilePos.get(a.place!)!, 240, 10)
        if (old) poof(old)
        tileViews.set(a.place!, copy)
        break
      }
      case "add":
      case "sub": {
        await stomp(g)
        const src = tileViews.get(a.place!)
        const ghost = boxArt(a.to.tiles.get(a.place!) ?? 0)
        ghost.position.copyFrom(src?.position ?? handWorld())
        fx.addChild(ghost)
        const sign = label(o.op === "add" ? "+" : "−", 44, 0xffffff, "700")
        sign.position.set(worker.root.x + 50, worker.root.y - 200)
        fx.addChild(sign)
        await fly(ghost, handWorld(), 260, 20)
        ghost.destroy({ children: true })
        sign.destroy()
        setHand(a.to.hand)
        if (handView) {
          const hv = handView
          ctx.tweens.add({ target: hv, duration: ms(260), ease: ease.linear, update: (k) => hv.scale.set(1 + ease.bump(k) * 0.3) })
        }
        break
      }
      case "bump+":
      case "bump-": {
        await stomp(g)
        const old = tileViews.get(a.place!)
        if (old) old.destroy({ children: true })
        const nb = boxArt(a.to.tiles.get(a.place!)!)
        nb.position.copyFrom(tilePos.get(a.place!)!)
        items.addChild(nb)
        tileViews.set(a.place!, nb)
        ctx.tweens.add({ target: nb, duration: ms(260), ease: ease.linear, update: (k) => nb.scale.set(1 + ease.bump(k) * 0.35) })
        setHand(a.to.hand)
        break
      }
      case "visit":
      case "pass":
      case "work": {
        const d = deskPos.get(o.desk)!
        const art = deskViews.get(o.desk)!
        const onDesk = { x: d.x - 40, y: d.y - 26 }
        const quip = desks.find((x) => x.id === o.desk)?.says
        if (quip) {
          const q = bubbleArt(quip, 300, "left", "say")
          q.scale.set(0.8)
          q.position.set(d.x + 10, d.y - 70)
          fx.addChild(q)
          ctx.tweens.add({ target: q, delay: ms(1300), duration: ms(300), update: (k) => (q.alpha = 1 - k), done: () => q.destroy({ children: true }) })
        }
        const clerkNod = () =>
          tweenP(ctx, art.clerk, ms(360), (k) => {
            art.clerk.rotation = Math.sin(k * Math.PI * 2) * 0.12
            art.clerk.y = -ease.bump(k) * 10
          }, ease.linear)
        if (o.op === "visit" && a.to.hand !== a.from.hand) {
          // Whatever the worker held is replaced by what the clerk hands over.
          if (handView) {
            const old = handView
            handView = undefined
            worker.carry.removeChild(old)
            old.position.copyFrom(handWorld())
            fx.addChild(old)
            poof(old)
          }
          await clerkNod()
          const gift = boxArt(a.to.hand!)
          gift.position.copyFrom(onDesk)
          fx.addChild(gift)
          await fly(gift, handWorld(), 300, 50)
          gift.destroy({ children: true })
          setHand(a.to.hand)
        } else if (a.from.hand !== undefined) {
          // Hand the box over, wait while the clerk looks at it, take it back.
          const b = boxArt(a.from.hand)
          b.position.copyFrom(handWorld())
          fx.addChild(b)
          setHand(undefined)
          await fly(b, onDesk, 260, 40)
          await clerkNod()
          if (o.op === "work" && a.to.hand !== a.from.hand) {
            b.destroy({ children: true })
            const nb = boxArt(a.to.hand!)
            nb.position.copyFrom(onDesk)
            fx.addChild(nb)
            await tweenP(ctx, nb, ms(260), (k) => nb.scale.set(1 + ease.bump(k) * 0.4), ease.linear)
            await fly(nb, handWorld(), 260, 40)
            nb.destroy({ children: true })
          } else {
            await fly(b, handWorld(), 260, 40)
            b.destroy({ children: true })
          }
          setHand(a.to.hand)
        } else {
          await clerkNod()
        }
        break
      }
      case "say":
        say(o.text)
        await tweenP(ctx, worker.root, ms(900), () => {})
        break
      case "think":
        say(o.text, "think")
        await tweenP(ctx, worker.root, ms(900), () => {})
        break
      case "boss":
        bossSays(o.text)
        await tweenP(ctx, boss, ms(1000), () => {})
        break
      case "clerk": {
        const art = deskViews.get(o.desk)!
        clerkSays(o.desk, o.text)
        await tweenP(ctx, art.clerk, ms(1100), (k) => (art.clerk.y = -Math.abs(Math.sin(k * Math.PI * 4)) * 5), ease.linear)
        break
      }
      case "hold":
        setHand(a.to.hand)
        if (handView) {
          const hv = handView
          await tweenP(ctx, hv, ms(260), (k) => hv.scale.set(lerp(0.3, 1, k)), ease.outBack)
        }
        break
      case "drop":
        if (handView) {
          const hv = handView
          handView = undefined
          worker.carry.removeChild(hv)
          hv.position.copyFrom(handWorld())
          fx.addChild(hv)
          poof(hv)
        }
        worker.setArms(false)
        break
      case "jump":
      case "jumpz":
      case "jumpn":
        await tweenP(ctx, pointer, ms(160), () => {})
        break
      case "pause":
        // A beat: hold so the room (and the audience) can take it in.
        await tweenP(ctx, pointer, ms(autoplay ? 1700 : 0), () => {})
        break
      default:
        break
    }
    // Tiles changed behind the worker's back (a hidden side effect) swap silently.
    if (!a.error) {
      a.to.tiles.forEach((val, id) => {
        const shown = tileViews.get(id)
        const p = tilePos.get(id)
        if (!p || (shown as Container & { lfValue?: Value } | undefined)?.lfValue === val) return
        if (val === undefined) return
        if (shown && a.from.tiles.get(id) === val) return
        shown?.destroy({ children: true })
        const b = boxArt(val) as Container & { lfValue?: Value }
        b.lfValue = val
        b.position.copyFrom(p)
        items.addChild(b)
        tileViews.set(id, b)
      })
    }
    if (a.error) {
      // The worker shakes their head; management is not pleased.
      await tweenP(ctx, worker.root, ms(500), (k) => (worker.head.rotation = Math.sin(k * Math.PI * 6) * 0.15 * (1 - k)), ease.linear)
      bossSays(a.error, "error")
    }
    drawStats(a.error ? a.from : a.to)
  }

  // --- Beats ----------------------------------------------------------------------
  // Each deck step runs up to the next PAUSE (or to the end).
  const cuts: Array<number> = [0]
  trace.actions.forEach((a, i) => a.pause && cuts.push(i + 1))
  if (cuts.at(-1) !== trace.actions.length) cuts.push(trace.actions.length)
  const steps = cuts.length - 1
  const autoplay = spec.autoplay !== false
  let at = 0
  let beat = 0
  let playing: Promise<void> | undefined

  const stateAt = (i: number): { s: State; where: string | undefined } => {
    if (i === 0) return { s: trace.actions[0]?.from ?? trace.final, where: undefined }
    const a = trace.actions[i - 1]!
    let where: string | undefined
    for (let k = i - 1; k >= 0 && !where; k--) where = trace.actions[k]!.place
    return { s: a.error ? a.from : a.to, where }
  }

  const finish = () => {
    if (at < trace.actions.length) return
    if (trace.error) return
    if (spec.expect && !result.ok) bossSays(result.message, "error")
    else if (spec.boss?.success) bossSays(spec.boss.success)
    if (spec.expect && result.ok) void hop(gen).then(() => hop(gen))
  }

  /** After jumping, show the latest line each speaker said in the current beat. */
  const restoreTalk = (i: number) => {
    let start = 0
    for (const c of cuts) if (c < i) start = c
    const said = new Map<string, Action>()
    for (let k = start; k < i; k++) {
      const a = trace.actions[k]!
      const o = a.op
      if (o.op === "say" || o.op === "think") said.set("worker", a)
      else if (o.op === "boss") said.set("boss", a)
      else if (o.op === "clerk") said.set(`clerk:${o.desk}`, a)
    }
    for (const a of said.values()) {
      const o = a.op
      if (o.op === "say") say(o.text)
      else if (o.op === "think") say(o.text, "think")
      else if (o.op === "boss") bossSays(o.text)
      else if (o.op === "clerk") clerkSays(o.desk, o.text)
    }
  }

  const jumpTo = (i: number) => {
    gen++
    clearBubbles()
    at = i
    const { s, where } = stateAt(i)
    snap(s, where)
    pointAt(i < trace.actions.length ? trace.actions[i]!.at : trace.actions.at(-1)?.at ?? 0, false)
    pointer.visible = i > 0 && !spec.hideProgram
    restoreTalk(i)
    const last = trace.actions[i - 1]
    if (last?.error) bossSays(last.error, "error")
    if (i === trace.actions.length && i > 0) finish()
  }

  const playTo = async (end: number) => {
    const g = ++gen
    pointer.visible = !spec.hideProgram
    while (at < end && g === gen) {
      const a = trace.actions[at]!
      await animate(a, g)
      if (g !== gen) return
      at++
      if (a.error) break
    }
    if (g === gen && at === trace.actions.length) finish()
  }

  snap(stateAt(0).s, undefined)
  if (spec.boss?.intro) bossSays(spec.boss.intro)

  // HRM-style controls: reset, step, play, fast.
  const controls = new Container()
  controls.position.set(FLOOR.fx + 60, H - 130)
  v.addChild(controls)
  const ctrl = (x: number, fill: number, shade: number, draw: (g: Graphics) => void, onTap: () => void) => {
    const b = new Button({ width: 70, height: 60, color: fill, shade, icon: draw, onTap }, ctx.tweens)
    b.position.set(x, 0)
    controls.addChild(b)
  }
  ctrl(0, 0xb5483d, 0x7a2a22, (g) => g.roundRect(-12, -12, 24, 24, 4).fill(0xffffff), () => {
    beat = 0
    jumpTo(0)
    if (spec.boss?.intro) bossSays(spec.boss.intro)
  })
  ctrl(86, 0x85a051, 0x55702c, (g) => g.poly([-10, -12, 6, 0, -10, 12]).fill(0xffffff).rect(8, -12, 5, 24).fill(0xffffff), () => {
    if (at < trace.actions.length) void playTo(at + 1)
  })
  ctrl(172, 0x85a051, 0x55702c, (g) => g.poly([-10, -14, 14, 0, -10, 14]).fill(0xffffff), () => {
    speed = spec.speed ?? 1
    void playTo(trace.actions.length)
  })
  ctrl(258, 0x85a051, 0x55702c, (g) => g.poly([-16, -12, 0, 0, -16, 12]).poly([0, -12, 16, 0, 0, 12]).fill(0xffffff), () => {
    speed = (spec.speed ?? 1) * 4
    void playTo(trace.actions.length)
  })

  // Idle life: blink, breathe.
  let clock = Math.random() * 3000
  let blinkAt = 2500
  let glanceAt = 3500
  return {
    view: v,
    steps: autoplay ? 0 : steps,
    setStep: (step, animateIt) => {
      if (autoplay) {
        // The room plays itself; PAUSE lines become short holds. One → press moves on.
        jumpTo(0)
        if (spec.boss?.intro) bossSays(spec.boss.intro)
        const g = gen
        ctx.tweens.add({ target: v, delay: 700, duration: 1, update: () => {}, done: () => {
          if (g === gen) void playTo(trace.actions.length)
        } })
        return
      }
      if (animateIt && step === beat + 1) {
        // Catch up if the previous beat is still playing, then play this one.
        if (at < cuts[beat]!) jumpTo(cuts[beat]!)
        beat = step
        speed = spec.speed ?? 1
        playing = playTo(cuts[step]!)
        void playing
        return
      }
      beat = step
      jumpTo(cuts[step]!)
      if (step === 0 && spec.boss?.intro) bossSays(spec.boss.intro)
    },
    tick: (dt) => {
      clock += dt
      const breath = Math.sin(clock / 600) * 0.012
      worker.body.scale.set(1, 1 + breath)
      if (clock > glanceAt && !moving) {
        // Idle glances: look left, right, then back at the camera.
        const k = (clock - glanceAt) / 900
        worker.look(k < 1 ? Math.sin(k * Math.PI * 2) * 0.9 : 0, 0)
        if (k >= 1) glanceAt = clock + 3000 + Math.random() * 4000
      }
      if (clock > blinkAt) {
        const k = (clock - blinkAt) / 140
        worker.blink(k < 1 ? k : k < 2 ? 2 - k : 0)
        if (k >= 2) blinkAt = clock + 2200 + Math.random() * 2600
      }
    },
    destroy: () => {
      gen++
      v.destroy({ children: true })
    }
  }
}

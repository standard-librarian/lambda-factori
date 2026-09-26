import { Container, Graphics } from "pixi.js"
import { label, relabel } from "../../../render/label.ts"
import { sourceArt, W as MACHINE_W, H as MACHINE_H } from "../../../render/factoryArt.ts"
import { DESIGN_W, palette } from "../../../render/theme.ts"
import { ease, lerp } from "../../../render/tween.ts"
import { PlaybackBar } from "../../../render/PlaybackBar.ts"
import type { SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { color, CONTENT_TOP, para, shade, type SlideContext, type SlideView } from "./common.ts"
import { buildTimeline, Playhead, segmentAt } from "./lineTimeline.ts"

const MACHINE_COLORS = [0x4f56b8, 0x2fa7a0, 0xee8d56, 0x9b5fc0, 0x306db5, 0xe0485a]
const BELT_Y = CONTENT_TOP + 430
const SCALE = 1.5

/** A cargo chip riding the belt: rounded card, one or more lines of text. */
const chip = (text: string) => {
  const c = new Container()
  const t = para(text, 24, palette.ink, 300, "700", "center")
  const w = Math.max(70, t.width + 32)
  const h = t.height + 20
  const g = new Graphics()
    .roundRect(-w / 2, -h + 6, w, h, 14).fill(shade(palette.cream, 0.8))
    .roundRect(-w / 2, -h, w, h, 14).fill(palette.white)
  t.position.set(0, -h + 10)
  c.addChild(g, t)
  return c
}

/**
 * An assembly line: items ride a belt through machines. A machine may keep
 * hidden state (a padlocked gauge above it) that changes what comes out; the
 * x-ray run opens the gauges. Each step sends one item down the line, and
 * the tray at the end keeps every in → out pair, so the same input giving a
 * different output is plain to see. The clock lives in `lineTimeline.ts`; this
 * module only draws what the playhead says.
 */
export const lineSlide = (s: SlideOf<"line">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const n = s.machines.length
  const left = 250
  const right = DESIGN_W - 330
  const gap = (right - left) / n
  const xs = s.machines.map((_, i) => left + gap * (i + 0.5))
  const trayX = DESIGN_W - 190

  // The belt, with chevrons that crawl along it.
  const belt = new Graphics()
    .roundRect(90, BELT_Y + 2, trayX - 60, 40, 20).fill(palette.wireShade)
    .roundRect(90, BELT_Y - 4, trayX - 60, 40, 20).fill(palette.wire)
  const chevrons = new Graphics()
  const chevronMask = new Graphics().roundRect(90, BELT_Y - 4, trayX - 60, 40, 20).fill(0xffffff)
  chevrons.mask = chevronMask
  v.addChild(belt, chevrons, chevronMask)
  const drawChevrons = (offset: number) => {
    chevrons.clear()
    for (let x = 90 - 60 + (offset % 60); x < trayX + 30; x += 60)
      chevrons.moveTo(x, BELT_Y + 4).lineTo(x + 12, BELT_Y + 16).lineTo(x, BELT_Y + 28)
    chevrons.stroke({ width: 5, color: palette.white, alpha: 0.55, cap: "round", join: "round" })
  }
  drawChevrons(0)

  // The inbox crate on the left.
  const inbox = new Graphics()
    .roundRect(40, BELT_Y - 100, 130, 110, 18).fill(shade(palette.token, 0.8))
    .roundRect(40, BELT_Y - 108, 130, 110, 18).fill(palette.token)
  const inLabel = label("in", 28, palette.white, "700")
  inLabel.position.set(105, BELT_Y - 54)
  v.addChild(inbox, inLabel)

  // Machines, with name plates and (optionally) a hidden-state gauge.
  const machines = s.machines.map((m, i) => {
    const fill = color(m.color, MACHINE_COLORS[i % MACHINE_COLORS.length]!)
    const art = sourceArt(m.icon ?? m.name.slice(0, 1), fill, shade(fill))
    art.root.scale.set(SCALE)
    art.root.position.set(xs[i]! - (MACHINE_W * SCALE) / 2, BELT_Y - MACHINE_H * SCALE + 8)
    const name = para(m.name, 28, palette.ink, gap - 30, "700", "center")
    name.position.set(xs[i]!, BELT_Y + 60)
    v.addChild(art.root, name)
    let gauge: { box: Graphics; text: ReturnType<typeof label>; lock: Container } | undefined
    if (m.state !== undefined) {
      const box = new Graphics()
      const text = label("", 24, palette.white, "700")
      text.position.set(xs[i]!, BELT_Y - MACHINE_H * SCALE - 90)
      const lock = new Container()
      lock.addChild(
        new Graphics()
          .roundRect(-16, -8, 32, 26, 6).fill(palette.ink)
          .arc(0, -8, 10, Math.PI, 0).stroke({ width: 5, color: palette.ink }),
        (() => { const q = label("?", 18, palette.white, "700"); q.y = 5; return q })()
      )
      lock.position.set(xs[i]!, BELT_Y - MACHINE_H * SCALE - 140)
      const stalk = new Graphics().rect(xs[i]! - 3, BELT_Y - MACHINE_H * SCALE - 66, 6, 40).fill(shade(fill, 0.6))
      v.addChild(stalk, box, text, lock)
      gauge = { box, text, lock }
    }
    return { art, fill, gauge, state: m.state ?? "" }
  })

  const setGauge = (i: number, state: string, open: boolean) => {
    const m = machines[i]!
    if (!m.gauge) return
    m.state = state
    relabel(m.gauge.text, open ? state : "hidden state")
    m.gauge.text.alpha = open ? 1 : 0.8
    const w = Math.max(170, m.gauge.text.width + 40)
    m.gauge.box.clear()
      .roundRect(xs[i]! - w / 2, m.gauge.text.y - 26, w, 52, 16).fill(open ? shade(m.fill, 0.75) : palette.inkSoft)
    m.gauge.lock.visible = !open
  }

  machines.forEach((m, i) => setGauge(i, m.state, false))

  // The outbox tray: every run's in → out.
  const tray = new Graphics()
    .roundRect(trayX - 80, BELT_Y - 100, 160, 110, 18).fill(palette.binDark)
    .roundRect(trayX - 76, BELT_Y - 108, 152, 110, 16).fill(palette.bin)
  const outLabel = label("out", 28, palette.white, "700")
  outLabel.position.set(trayX, BELT_Y - 54)
  v.addChild(tray, outLabel)
  const history = new Container()
  history.position.set(trayX, BELT_Y + 70)
  v.addChild(history)
  const showHistory = (upto: number, flash: boolean) => {
    history.removeChildren().forEach((c) => c.destroy({ children: true }))
    let y = 0
    for (let r = 0; r < upto; r++) {
      const run = s.runs[r]!
      const out = run.outputs?.at(-1) ?? run.input
      // Multi-line cargo (a list) reads better stacked under its input.
      const text = out.includes("\n") ? `${run.input} →\n${out}` : `${run.input} → ${out}`
      const row = para(text, 22, palette.ink, 300, "600", "center")
      row.y = y
      if (flash && r === upto - 1) row.style.fill = palette.red
      history.addChild(row)
      y += row.height + 6
    }
  }

  const caption = para("", 30, palette.ink, DESIGN_W - 300, "600", "center")
  caption.position.set(DESIGN_W / 2, 905)
  v.addChild(caption)

  // Everything below is drawn from the playhead (run, time).
  const onBelt = BELT_Y - 6
  const timeline = buildTimeline({ inbox: { x: 105, y: BELT_Y - 110 }, belt: onBelt, machines: xs, tray: trayX })
  const head = new Playhead(timeline, s.runs.length)

  const opened = (r: number) => s.runs.slice(0, r).some((run) => run.xray === true)
  const stateBefore = (r: number, i: number) => {
    let st = s.machines[i]!.state ?? ""
    for (const run of s.runs.slice(0, r)) {
      const next = run.states?.[i]
      if (next !== undefined && next !== "") st = next
    }
    return st
  }

  let cargo: Container | undefined
  let cargoText = ""
  const setCargo = (text: string | undefined) => {
    if (text === undefined) {
      cargo?.destroy({ children: true })
      cargo = undefined
      cargoText = ""
      return
    }
    if (cargo && cargoText === text) return
    const at = cargo ? { x: cargo.x, y: cargo.y } : undefined
    cargo?.destroy({ children: true })
    cargo = chip(text)
    cargoText = text
    if (at) cargo.position.set(at.x, at.y)
    v.addChild(cargo)
  }

  let lastHistory = -1
  const render = () => {
    const { run, time } = head
    const done = head.finished
    const finished = run === 0 ? 0 : done ? run : run - 1
    if (finished !== lastHistory) {
      showHistory(finished, run > 0 && done)
      lastHistory = finished
    }
    const current = run > 0 ? s.runs[run - 1]! : undefined
    relabel(caption, current?.caption ?? s.caption ?? "")
    const open = opened(run)
    machines.forEach((m, i) => {
      let st = stateBefore(Math.max(0, run - 1), i)
      const next = current?.states?.[i]
      if (next !== undefined && next !== "" && time >= timeline.revealAt[i]!) st = next
      if (st !== m.state || m.gauge?.lock.visible === open) setGauge(i, st, open)
      m.art.body.scale.set(1)
    })
    if (!current || done) return setCargo(undefined)

    // What the item says by now: the output of the last machine that has worked on it.
    let text = current.input
    timeline.revealAt.forEach((at, i) => {
      if (time >= at) text = current.outputs?.[i] ?? text
    })
    setCargo(text)
    const item = cargo!
    item.visible = true
    item.alpha = 1
    item.scale.set(1)
    const { segment: seg, local } = segmentAt(timeline, time)
    switch (seg.kind) {
      case "travel":
        item.position.set(lerp(seg.from, seg.to, ease.inOutSine(local)), lerp(seg.fromY, onBelt, Math.min(1, local * 2)) - Math.sin(local * Math.PI) * 10)
        break
      case "work": {
        // The machine swallows the item, works (squash and stretch), and lets it out.
        item.visible = false
        machines[seg.machine]!.art.body.scale.set(1 + Math.sin(local * Math.PI * 2) * 0.05, 1 - Math.sin(local * Math.PI) * 0.12)
        break
      }
      case "hold":
        item.position.set(seg.x, onBelt - Math.sin(Math.min(1, local * 3) * Math.PI) * 14)
        break
      case "drop":
        item.position.set(trayX, onBelt)
        item.alpha = 1 - local
        item.scale.set(1 - 0.4 * local)
        break
    }
  }

  // Tapping the bar may change which item is on the line; tell the deck, so → continues from there.
  let syncedRun = 0
  const refresh = () => {
    if (head.run !== syncedRun) ctx.syncStep?.((syncedRun = head.run))
    render()
    bar.show({
      playing: head.playing,
      canBack: head.canBack,
      canForward: head.canForward,
      progress: head.run === 0 ? 0 : head.time / timeline.total,
      notches: timeline.stops.map((st) => ({ at: st / timeline.total, reached: head.run > 0 && head.time >= st })),
      status: head.run === 0 ? "press ▶ or → to send the first item"
        : `item ${head.run} of ${s.runs.length} · ${head.time >= timeline.total ? "done" : head.playing ? "playing" : "paused"}`,
      speed: head.speed
    })
  }
  const bar = new PlaybackBar(ctx.tweens, {
    restart: () => head.restart(),
    back: () => head.back(),
    playPause: () => head.togglePlay(),
    forward: () => head.forward(),
    speed: () => head.cycleSpeed()
  }, refresh)
  bar.position.set(DESIGN_W / 2, 790)
  v.addChild(bar)

  let clock = 0
  return {
    view: v,
    steps: s.runs.length,
    setStep: (step, animate) => {
      head.jump(step, animate)
      syncedRun = step
      refresh()
    },
    animating: () => head.playing,
    tick: (dt) => {
      if (!head.playing) return
      head.advance(dt)
      // The belt only moves while an item rides it.
      if (segmentAt(timeline, head.time).segment.kind === "travel") drawChevrons((clock += dt * head.speed) / 16)
      refresh()
    },
    destroy: () => v.destroy({ children: true })
  }
}

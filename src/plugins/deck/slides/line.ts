import { Container, Graphics } from "pixi.js"
import { label, relabel, sourceArt, W as MACHINE_W, H as MACHINE_H } from "../../../render/art.ts"
import { DESIGN_W, palette } from "../../../render/theme.ts"
import { ease, lerp } from "../../../render/tween.ts"
import { Button, icons } from "../../../render/ui.ts"
import type { SlideOf } from "../Deck.ts"
import { color, CONTENT_TOP, para, shade, type SlideContext, type SlideView } from "./common.ts"

const MACHINE_COLORS = [0x4f56b8, 0x2fa7a0, 0xee8d56, 0x9b5fc0, 0x306db5, 0xe0485a]
/** Pace, unhurried so the audience can read each output: px/ms on the belt, ms per stage. */
const TRAVEL_SPEED = 0.42
const WORK_MS = 1100
const HOLD_MS = 900
const DROP_MS = 450
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
 * different output is plain to see.
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

  // ---------------------------------------------------------------------------
  // The timeline. Each run is a sequence of segments (travel, work, hold, drop);
  // everything on screen is a pure function of (run, time), so pausing, stepping
  // back and changing speed are exact.
  // ---------------------------------------------------------------------------
  type Segment =
    | { readonly kind: "travel"; readonly from: number; readonly to: number; readonly fromY: number; readonly d: number }
    | { readonly kind: "work"; readonly machine: number; readonly d: number }
    | { readonly kind: "hold"; readonly x: number; readonly d: number }
    | { readonly kind: "drop"; readonly d: number }
  const INBOX_X = 105
  const ENTRY = 72 // the item disappears into the machine this far left of its centre…
  const onBelt = BELT_Y - 6
  const segments: Array<Segment> = []
  {
    let x = INBOX_X
    let y = BELT_Y - 110
    const travel = (to: number) => {
      segments.push({ kind: "travel", from: x, to, fromY: y, d: Math.max(500, Math.abs(to - x) / TRAVEL_SPEED) })
      x = to
      y = onBelt
    }
    xs.forEach((mx, i) => {
      travel(mx - ENTRY)
      segments.push({ kind: "work", machine: i, d: WORK_MS })
      x = mx + ENTRY // …and comes out this far right of it
      segments.push({ kind: "hold", x, d: HOLD_MS })
    })
    travel(trayX)
    segments.push({ kind: "drop", d: DROP_MS })
  }
  const starts: Array<number> = []
  let total = 0
  for (const seg of segments) {
    starts.push(total)
    total += seg.d
  }
  // Stops: where "back" and "forward" land. The start, after each machine has worked, the end.
  const stops = [0, ...segments.flatMap((seg, k) => (seg.kind === "work" ? [starts[k]! + seg.d] : [])), total]

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

  let run = 0 // the run on the line (1-based; 0 = none yet)
  let time = 0
  let lastHistory = -1

  const render = () => {
    const done = run === 0 || time >= total
    // History: every finished run.
    const finished = run === 0 ? 0 : done ? run : run - 1
    if (finished !== lastHistory) {
      showHistory(finished, run > 0 && done)
      lastHistory = finished
    }
    const current = run > 0 ? s.runs[run - 1]! : undefined
    relabel(caption, current?.caption ?? s.caption ?? "")
    const open = opened(run)
    machines.forEach((m, i) => {
      let st = stateBefore(run - 1 < 0 ? 0 : run - 1, i)
      if (current) {
        const k = segments.findIndex((seg) => seg.kind === "work" && seg.machine === i)
        const next = current.states?.[i]
        if (next !== undefined && next !== "" && time >= starts[k]! + segments[k]!.d / 2) st = next
      }
      if (st !== m.state || m.gauge?.lock.visible === open) setGauge(i, st, open)
      m.art.body.scale.set(1)
    })
    if (!current || done) return setCargo(undefined)

    // Which segment are we in, and what does the item say by now?
    let k = segments.length - 1
    while (k > 0 && starts[k]! > time) k--
    const seg = segments[k]!
    const local = Math.min(1, (time - starts[k]!) / seg.d)
    let text = current.input
    segments.forEach((sg, j) => {
      if (sg.kind === "work" && time >= starts[j]! + sg.d / 2) text = current.outputs?.[sg.machine] ?? text
    })
    setCargo(text)
    const item = cargo!
    item.visible = true
    item.alpha = 1
    item.scale.set(1)
    switch (seg.kind) {
      case "travel": {
        const e = ease.inOutSine(local)
        item.position.set(lerp(seg.from, seg.to, e), lerp(seg.fromY, onBelt, Math.min(1, local * 2)) - Math.sin(local * Math.PI) * 10)
        break
      }
      case "work": {
        // The machine swallows the item, works (squash and stretch), and lets it out.
        item.visible = false
        const m = machines[seg.machine]!
        m.art.body.scale.set(1 + Math.sin(local * Math.PI * 2) * 0.05, 1 - Math.sin(local * Math.PI) * 0.12)
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

  // ---------------------------------------------------------------------------
  // Playback controls: restart · back · play/pause · forward · speed.
  // ---------------------------------------------------------------------------
  let playing = false
  let until = Number.POSITIVE_INFINITY // pause when time reaches this (stepping to a stop)
  let speed = 1
  const SPEEDS = [0.5, 1, 2]

  const bar = new Container()
  bar.position.set(DESIGN_W / 2, 790)
  v.addChild(bar)
  const button = (x: number, icon: ((g: Graphics) => void) | undefined, text: string | undefined, onTap: () => void, w = 76) => {
    const tap = () => {
      onTap()
      render()
      drawControls()
    }
    const b = new Button({ width: w, height: 60, color: palette.blue, shade: 0x1f4c85, fontSize: 24, onTap: tap, ...(icon ? { icon } : {}), ...(text ? { text } : {}) }, ctx.tweens)
    b.position.set(x, 0)
    bar.addChild(b)
    return b
  }
  const progress = new Graphics()
  const status = label("", 22, palette.inkSoft, "600")
  status.position.set(0, 52)
  bar.addChild(progress, status)

  const sync = () => ctx.syncStep?.(run)
  const startRun = (r: number, to: number) => {
    run = r
    time = 0
    until = to
    playing = true
    sync()
  }
  button(-250, icons.restart, undefined, () => {
    if (run === 0) return startRun(1, Number.POSITIVE_INFINITY)
    time = 0
    until = Number.POSITIVE_INFINITY
    playing = true
  })
  const backB = button(-160, icons.back, undefined, () => {
    playing = false
    if (run === 0) return
    // Just past a stop counts as being on it, so back goes to the stop before.
    const prev = [...stops].reverse().find((st) => st < time - 400)
    if (prev !== undefined) time = prev
    else if (run > 1) {
      run--
      time = total
      sync()
    } else {
      run = 0
      time = 0
      sync()
    }
  })
  const playB = button(-40, icons.play, undefined, () => {
    if (playing) return void (playing = false)
    if (run === 0 || (time >= total && run < s.runs.length)) return startRun(run + 1, Number.POSITIVE_INFINITY)
    if (time >= total) time = 0
    until = Number.POSITIVE_INFINITY
    playing = true
  }, 96)
  const forwardB = button(80, icons.forward, undefined, () => {
    if (run === 0 || (time >= total && run < s.runs.length)) return startRun(run + 1, stops[1]!)
    if (time >= total) return
    until = stops.find((st) => st > time + 1) ?? total
    playing = true
  })
  const speedB = button(190, undefined, "1×", () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!
    if (speedB.text) relabel(speedB.text, `${speed}×`)
  }, 96)

  const drawControls = () => {
    playB.setIcon(playing ? icons.pause : icons.play)
    backB.enabled = run > 0
    forwardB.enabled = !(run === s.runs.length && time >= total)
    // A progress bar with a notch at every stop.
    const w = 540
    const x0 = -w / 2 - 40
    progress.clear()
      .roundRect(x0, 36, w, 8, 4).fill({ color: palette.ink, alpha: 0.12 })
      .roundRect(x0, 36, Math.max(8, w * (run === 0 ? 0 : time / total)), 8, 4).fill(palette.blue)
    for (const st of stops) progress.circle(x0 + (w * st) / total, 40, 5).fill(run > 0 && time >= st ? palette.blue : 0xc9cbe0)
    const stage = run === 0 ? "press ▶ or → to send the first item"
      : time >= total ? `item ${run} of ${s.runs.length} · done`
      : `item ${run} of ${s.runs.length} · ${playing ? "playing" : "paused"}`
    relabel(status, stage)
    status.x = -40
  }

  let clock = 0
  return {
    view: v,
    steps: s.runs.length,
    setStep: (step, animate) => {
      run = step
      if (animate && step > 0) {
        time = 0
        until = Number.POSITIVE_INFINITY
        playing = true
      } else {
        time = total
        playing = false
      }
      render()
      drawControls()
    },
    animating: () => playing,
    tick: (dt) => {
      if (!playing) return
      time = Math.min(total, until, time + dt * speed)
      if (time >= until || time >= total) playing = false
      // The belt only moves while an item rides it.
      let k = segments.length - 1
      while (k > 0 && starts[k]! > time) k--
      if (segments[k]!.kind === "travel") {
        clock += dt * speed
        drawChevrons(clock / 16)
      }
      render()
      drawControls()
    },
    destroy: () => v.destroy({ children: true })
  }
}

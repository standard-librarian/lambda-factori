import { Container, Graphics } from "pixi.js"
import { label, relabel, sourceArt, W as MACHINE_W, H as MACHINE_H } from "../../../render/art.ts"
import { DESIGN_W, palette } from "../../../render/theme.ts"
import { ease, lerp } from "../../../render/tween.ts"
import type { SlideOf } from "../Deck.ts"
import { color, CONTENT_TOP, para, shade, type SlideContext, type SlideView } from "./common.ts"

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
  caption.position.set(DESIGN_W / 2, 930)
  v.addChild(caption)

  // State as of the end of run `r` (0 = before any run).
  const settle = (r: number) => {
    const open = s.runs.slice(0, r).some((run) => run.xray === true)
    machines.forEach((m, i) => {
      let st = s.machines[i]!.state ?? ""
      for (const run of s.runs.slice(0, r)) {
        const next = run.states?.[i]
        if (next !== undefined && next !== "") st = next
      }
      setGauge(i, st, open)
      m.art.body.scale.set(1)
    })
    showHistory(r, false)
    relabel(caption, r > 0 ? s.runs[r - 1]!.caption ?? s.caption ?? "" : s.caption ?? "")
  }

  const runner = {}
  let cargo: Container | undefined
  const play = (r: number) => {
    const run = s.runs[r - 1]!
    settle(r - 1)
    relabel(caption, run.caption ?? s.caption ?? "")
    const open = run.xray === true || s.runs.slice(0, r - 1).some((x) => x.xray === true)
    machines.forEach((m, i) => setGauge(i, m.state, open))
    cargo?.destroy({ children: true })
    let item = chip(run.input)
    item.position.set(105, BELT_Y - 110)
    v.addChild(item)
    cargo = item
    const hop = (from: number, to: number, delay: number, done: () => void) =>
      ctx.tweens.add({ owner: runner, target: item, delay, duration: 520, ease: ease.inOutSine, update: (k) => {
        item.x = lerp(from, to, k)
        item.y = BELT_Y - 6 - Math.sin(k * Math.PI) * 10
      }, done })
    const visit = (i: number) => {
      if (i === n) {
        hop(item.x, trayX, 0, () => {
          ctx.tweens.add({ owner: runner, target: item, duration: 260, update: (k) => {
            item.alpha = 1 - k
            item.scale.set(1 - 0.4 * k)
          }, done: () => {
            item.destroy({ children: true })
            cargo = undefined
            showHistory(r, true)
          } })
        })
        return
      }
      hop(item.x, xs[i]!, 0, () => {
        const m = machines[i]!
        // The machine swallows the item, works (squash), and emits the output.
        item.visible = false
        ctx.tweens.add({ owner: runner, target: m.art.root, duration: 420, ease: ease.linear, update: (k) => {
          m.art.body.scale.set(1 + Math.sin(k * Math.PI * 2) * 0.05, 1 - Math.sin(k * Math.PI) * 0.12)
        }, done: () => {
          m.art.body.scale.set(1)
          const next = run.states?.[i]
          if (next !== undefined && next !== "") {
            setGauge(i, next, open)
            if (m.gauge) {
              const g = m.gauge.box
              ctx.tweens.add({ owner: runner, target: g, duration: 360, ease: ease.outBack, update: (k) => g.alpha = 0.4 + 0.6 * k })
            }
          }
          const out = run.outputs?.[i]
          if (out !== undefined) {
            const replaced = chip(out)
            replaced.position.copyFrom(item.position)
            item.destroy({ children: true })
            item = replaced
            cargo = item
            v.addChild(item)
          }
          item.visible = true
          visit(i + 1)
        } })
      })
    }
    visit(0)
  }

  let clock = 0
  return {
    view: v,
    steps: s.runs.length,
    setStep: (step, animate) => {
      ctx.tweens.cancel(runner)
      cargo?.destroy({ children: true })
      cargo = undefined
      if (animate && step > 0) play(step)
      else settle(step)
    },
    tick: (dt) => {
      clock += dt
      drawChevrons(clock / 16)
    },
    destroy: () => {
      ctx.tweens.cancel(runner)
      v.destroy({ children: true })
    }
  }
}

/**
 * The reduction theater: a modal that steps through a term's reduction (see
 * `TermRow` for the animation, `TheaterSpec` for what it shows), with a
 * definition line, play/step controls, input variants and a goal verdict.
 */
import { Container, Graphics, type Text, type Ticker } from "pixi.js"
import { defaultRules, normalize } from "@lambda-factori/core/Reduce.ts"
import { apply, atom, equals, variable } from "@lambda-factori/core/Term.ts"
import { describeStep, type Step, trace, type Trace } from "@lambda-factori/core/Trace.ts"
import { label, relabel } from "./label.ts"
import { DESIGN_H, DESIGN_W, palette } from "./theme.ts"
import { ease, lerp, type Tweens } from "../kernel/tween.ts"
import type { TheaterSpec } from "./TheaterSpec.ts"
import { Button } from "./Button.ts"
import { icons } from "./icons.ts"
import { TermRow } from "./TermRow.ts"

const stepCaption = (s: Step) => `${s.redex}  ⟶  ${s.result}   ·   ${describeStep(s)}`

export class Theater extends Container {
  private readonly row: TermRow
  private tr: Trace
  private variant = 0
  private readonly variantButtons: Array<Button> = []
  private index = 0
  private playing = false
  private busy = false
  private wait = 0
  private readonly caption: Text
  private readonly counter: Text
  private readonly verdict: Text
  private readonly playBtn: Button
  private readonly spec: TheaterSpec
  private readonly tweens: Tweens
  private readonly ticker: Ticker
  private readonly onTick = (t: Ticker) => this.tick(Math.min(t.deltaMS, 100))
  private readonly onClose: () => void

  constructor(tweens: Tweens, ticker: Ticker, spec: TheaterSpec, onClose: () => void) {
    super()
    this.tweens = tweens
    this.ticker = ticker
    this.spec = spec
    this.onClose = onClose
    this.tr = trace(spec.variants?.[0]?.term ?? spec.term, spec.rules ?? defaultRules)

    const dim = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: palette.ink, alpha: 0.4 })
    dim.eventMode = "static"
    dim.on("pointertap", () => this.close())
    this.addChild(dim)

    const card = new Container()
    card.position.set(DESIGN_W / 2, DESIGN_H / 2)
    const cw = 1480
    const ch = 720
    const bg = new Graphics()
      .roundRect(-cw / 2, -ch / 2 + 10, cw, ch, 36).fill(palette.trayShade)
      .roundRect(-cw / 2, -ch / 2, cw, ch, 36).fill(palette.cream)
      .roundRect(-cw / 2 + 40, -120, cw - 80, 250, 28).fill({ color: palette.paper })
    bg.eventMode = "static"
    card.addChild(bg)
    // Graph paper inside the stage.
    const grid = new Graphics()
    for (let x = -cw / 2 + 40; x <= cw / 2 - 40; x += 40) grid.moveTo(x, -120).lineTo(x, 130)
    for (let y = -120; y <= 130; y += 40) grid.moveTo(-cw / 2 + 40, y).lineTo(cw / 2 - 40, y)
    grid.stroke({ width: 1, color: palette.grid })
    card.addChild(grid)

    const title = label(spec.title, 46, palette.ink, "700")
    title.y = -ch / 2 + 58
    card.addChild(title)
    if (spec.subtitle) {
      const sub = label(spec.subtitle, 22, palette.inkSoft, "500")
      sub.style.wordWrap = true
      sub.style.wordWrapWidth = cw - 200
      sub.style.align = "center"
      sub.y = -ch / 2 + 108
      card.addChild(sub)
    }

    // Without a definition of its own, show the goal it is being compared against.
    const definition = spec.definition ??
      (spec.goal ? { lhs: apply(atom(spec.goal.label), spec.goal.params.map(variable)), rhs: spec.goal.body } : undefined)
    if (definition) {
      const def = new Container()
      const lhs = new TermRow(tweens, 420)
      lhs.show(trace(definition.lhs, new Map()).terms[0]!)
      const rhs = new TermRow(tweens, 520)
      rhs.show(trace(definition.rhs, new Map()).terms[0]!)
      lhs.scale.set(lhs.scale.x * 0.62)
      rhs.scale.set(rhs.scale.x * 0.62)
      const arrow = label("⟶", 40, palette.inkSoft, "700")
      const lw = lhs.width
      const rw = rhs.width
      lhs.x = -(lw + rw + 90) / 2 + lw / 2
      arrow.x = lhs.x + lw / 2 + 45
      rhs.x = arrow.x + 45 + rw / 2
      def.addChild(lhs, arrow, rhs)
      if (!spec.definition) {
        const tag = label("goal", 20, palette.inkSoft, "600")
        tag.x = lhs.x - lw / 2 - 50
        def.addChild(tag)
      }
      def.y = -178
      card.addChild(def)
    }

    this.row = new TermRow(tweens, cw - 200)
    this.row.y = 8
    card.addChild(this.row)

    this.caption = label("", 28, palette.ink, "600")
    this.caption.y = 166
    this.counter = label("", 20, palette.inkSoft, "500")
    this.counter.y = 200
    this.verdict = label("", 26, palette.greenShade, "700")
    this.verdict.y = 234
    card.addChild(this.caption, this.counter, this.verdict)

    const mk = (icon: (g: Graphics) => void, x: number, onTap: () => void, color: number = palette.token, shade: number = palette.binShade) => {
      const b = new Button({ width: 76, height: 64, color, shade, icon, onTap }, tweens)
      b.position.set(x, ch / 2 - 62)
      card.addChild(b)
      return b
    }
    mk(icons.restart, -180, () => this.restart())
    mk(icons.back, -90, () => this.prev())
    this.playBtn = mk(icons.play, 0, () => this.togglePlay(), palette.blue, 0x1f4c85)
    mk(icons.forward, 90, () => this.next())
    mk(icons.close, cw / 2 - 64, () => this.close(), palette.red, palette.redShade).y = -ch / 2 + 58

    // Truth-table rows (or other variants) as pills along the bottom of the stage.
    const variants = spec.variants ?? []
    const vw = Math.min(200, (cw - 120) / Math.max(1, variants.length) - 12)
    variants.forEach((v, i) => {
      const b = new Button({
        width: vw,
        height: 44,
        color: palette.cream,
        shade: palette.trayShade,
        text: v.label,
        fontSize: variants.length > 6 ? 16 : 20,
        textColor: palette.ink,
        onTap: () => this.selectVariant(i)
      }, tweens)
      b.position.set((i - (variants.length - 1) / 2) * (vw + 12), 96)
      card.addChild(b)
      this.variantButtons.push(b)
    })
    this.variantButtons[0]?.highlight(true)

    this.addChild(card)
    card.scale.set(0.85)
    this.alpha = 0
    tweens.add({ duration: 320, ease: ease.outBack, update: (k) => { this.alpha = Math.min(1, k * 2); card.scale.set(lerp(0.85, 1, k)) } })

    this.row.show(this.tr.terms[0]!)
    this.refresh()
    ticker.add(this.onTick)
    this.playing = this.tr.steps.length > 0
    this.wait = 700
  }

  private refresh() {
    const n = this.tr.steps.length
    const atEnd = this.index >= n
    if (n === 0) {
      relabel(this.caption, this.spec.note ?? "nothing to reduce — no combinator at the head has enough arguments")
      relabel(this.counter, "")
    } else if (atEnd) {
      relabel(this.caption, this.tr.normal ? "normal form — nothing left to reduce" : "still reducing… (stopped after 40 steps)")
      relabel(this.counter, `${n} step${n === 1 ? "" : "s"}`)
    } else {
      const s = this.tr.steps[this.index]!
      relabel(this.caption, stepCaption(s))
      relabel(this.counter, `step ${this.index + 1} of ${n}`)
    }
    const goal = this.spec.goal
    const variant = this.spec.variants?.[this.variant]
    const expect = variant?.expect ?? goal?.body
    if (goal && expect && atEnd) {
      const lhs = normalize(variant?.term ?? this.spec.term, this.spec.rules ?? defaultRules)
      const rhs = normalize(expect)
      const ok = lhs !== undefined && rhs !== undefined && equals(lhs.term, rhs.term)
      relabel(this.verdict, ok ? `✓ behaves like ${goal.label}` : `✗ doesn't behave like ${goal.label} yet`)
      this.verdict.style.fill = ok ? palette.greenShade : palette.bad
    } else {
      relabel(this.verdict, "")
    }
    this.playBtn.setIcon(this.playing ? icons.pause : icons.play)
  }

  private tick(dt: number) {
    if (!this.playing || this.busy) return
    this.wait -= dt
    if (this.wait <= 0) {
      if (this.index >= this.tr.steps.length) {
        this.playing = false
        this.refresh()
      } else {
        this.next()
      }
    }
  }

  private selectVariant(i: number) {
    const v = this.spec.variants?.[i]
    if (!v || this.busy) return
    this.variantButtons.forEach((b, k) => b.highlight(k === i))
    this.variant = i
    this.tr = trace(v.term, this.spec.rules ?? defaultRules)
    this.restart()
  }

  next() {
    if (this.busy || this.index >= this.tr.steps.length) return
    this.busy = true
    const step = this.tr.steps[this.index]!
    relabel(this.caption, stepCaption(step))
    relabel(this.counter, `step ${this.index + 1} of ${this.tr.steps.length}`)
    this.playBtn.setIcon(this.playing ? icons.pause : icons.play)
    this.row.animate(this.tr.terms[this.index + 1]!, step, () => {
      this.index++
      this.busy = false
      this.wait = 650
      this.refresh()
    })
  }

  prev() {
    if (this.busy || this.index === 0) return
    this.playing = false
    this.index--
    this.row.show(this.tr.terms[this.index]!)
    this.refresh()
  }

  restart() {
    if (this.busy) return
    this.index = 0
    this.row.show(this.tr.terms[0]!)
    this.playing = this.tr.steps.length > 0
    this.wait = 500
    this.refresh()
  }

  togglePlay() {
    if (this.index >= this.tr.steps.length) return this.restart()
    this.playing = !this.playing
    this.wait = 0
    this.refresh()
  }

  onKey(e: KeyboardEvent) {
    if (e.code === "Escape") this.close()
    else if (e.code === "ArrowRight") this.next()
    else if (e.code === "ArrowLeft") this.prev()
    else if (e.code === "Space") {
      e.preventDefault()
      this.togglePlay()
    }
  }

  close() {
    if (this.closing) return
    this.closing = true
    this.ticker.remove(this.onTick)
    this.tweens.add({ target: this, duration: 180, update: (k) => (this.alpha = 1 - k), done: () => this.destroy({ children: true }) })
    this.onClose()
  }

  private closing = false

  override destroy(options?: Parameters<Container["destroy"]>[0]) {
    this.ticker.remove(this.onTick)
    super.destroy(options)
  }
}

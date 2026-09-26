/**
 * The reduction theater: a modal that shows a term as a row of tokens and
 * animates each rewrite. The head combinator fires, its arguments are tagged
 * with the parameter names, then everything flies to its new place: copied
 * arguments split off, dropped ones fall away, brackets re-form.
 */
import { Container, Graphics, type Text, type Ticker } from "pixi.js"
import { byName, colorOf } from "../core/Catalogue.ts"
import type { Rules } from "../core/Reduce.ts"
import { goalOf, rowTerm, type Target, truthRows, truthRule } from "../core/Level.ts"
import { defaultRules, normalize, recognize } from "../core/Reduce.ts"
import { apply, atom, equals, parse, show, type Term, variable } from "../core/Term.ts"
import { baseId, describeStep, type LTerm, spineL, type Step, trace, type Trace } from "../core/Trace.ts"
import { label, relabel } from "./art.ts"
import { DESIGN_H, DESIGN_W, palette } from "./theme.ts"
import { ease, lerp, type Tweens } from "./tween.ts"
import { Button, icons } from "./ui.ts"

const R = 30
const GAP = 10
const PAD = 16

export const VAR_COLORS: Record<string, number> = {
  x: 0xf76a7a,
  y: 0x2fa7a0,
  z: 0xf2a93b,
  w: 0x9b5fc0,
  v: 0x4cc887,
  u: 0x5b8def,
  a: 0xf76a7a,
  b: 0x2fa7a0,
  f: 0x9b5fc0,
  g: 0x5b8def,
  h: 0xf2a93b
}

const varColor = (name: string) => VAR_COLORS[name] ?? 0x8a8fb0

interface Layout {
  readonly tokens: ReadonlyArray<{ id: string; name: string; kind: "Atom" | "Var"; x: number }>
  readonly groups: ReadonlyArray<{ id: string; x0: number; x1: number; level: number }>
  readonly spans: ReadonlyMap<string, { x0: number; x1: number }>
  readonly width: number
}

const layout = (t: LTerm): Layout => {
  let x = 0
  const tokens: Array<Layout["tokens"][number]> = []
  const groups: Array<Layout["groups"][number]> = []
  const spans = new Map<string, { x0: number; x1: number }>()
  const token = (n: LTerm & { name: string }) => {
    tokens.push({ id: n.id, name: n.name, kind: n._tag === "Var" ? "Var" : "Atom", x: x + R })
    spans.set(n.id, { x0: x, x1: x + 2 * R })
    x += 2 * R + GAP
  }
  const emit = (n: LTerm, top: boolean): number => {
    if (n._tag !== "App") {
      token(n)
      return 0
    }
    const start = x
    if (!top) x += PAD
    const { head, args } = spineL(n)
    let level = 0
    if (head._tag !== "App") token(head)
    for (const a of args) level = Math.max(level, emit(a, false))
    if (top) {
      spans.set(n.id, { x0: start, x1: x - GAP })
      return level
    }
    x = x - GAP + PAD
    groups.push({ id: n.id, x0: start, x1: x, level: level + 1 })
    spans.set(n.id, { x0: start, x1: x })
    x += GAP
    return level + 1
  }
  emit(t, true)
  return { tokens, groups, spans, width: Math.max(0, x - GAP) }
}

const tokenView = (name: string, kind: "Atom" | "Var") => {
  const c = new Container()
  const color = kind === "Var" ? varColor(name) : colorOf(name).color
  const g = new Graphics().circle(0, 0, R).fill(color).stroke({ width: 4, color: palette.white })
  if (kind === "Var") g.circle(0, 0, R - 8).stroke({ width: 2, color: palette.white, alpha: 0.35 })
  const t = label(name, [...name].length > 2 ? 18 : [...name].length > 1 ? 24 : 30, palette.white, "700")
  c.addChild(g, t)
  return c
}

const drawGroups = (g: Graphics, l: Layout, offset: number) => {
  for (const grp of [...l.groups].sort((a, b) => b.level - a.level)) {
    const h = 2 * R + 14 + grp.level * 12
    g.roundRect(offset + grp.x0, -h / 2, grp.x1 - grp.x0, h, h / 2)
      .fill({ color: palette.token, alpha: 0.12 })
      .stroke({ width: 2.5, color: palette.token, alpha: 0.55 })
  }
}

/** A term rendered as tokens and bracket capsules, able to animate one rewrite at a time. */
export class TermRow extends Container {
  private readonly views = new Map<string, Container>()
  private groupLayer = new Graphics()
  private readonly tagLayer = new Container()
  private current: Layout | undefined
  private readonly maxWidth: number
  private readonly tweens: Tweens

  constructor(tweens: Tweens, maxWidth: number) {
    super()
    this.tweens = tweens
    this.maxWidth = maxWidth
    this.addChild(this.groupLayer, this.tagLayer)
  }

  private fit(l: Layout) {
    return Math.min(1, this.maxWidth / Math.max(1, l.width))
  }

  /** Jump straight to a term without animation. */
  show(t: LTerm) {
    for (const v of this.views.values()) v.destroy({ children: true })
    this.views.clear()
    this.tagLayer.removeChildren().forEach((c) => c.destroy({ children: true }))
    const l = layout(t)
    this.current = l
    this.groupLayer.clear()
    drawGroups(this.groupLayer, l, -l.width / 2)
    for (const tok of l.tokens) {
      const v = tokenView(tok.name, tok.kind)
      v.x = tok.x - l.width / 2
      this.addChild(v)
      this.views.set(tok.id, v)
    }
    this.scale.set(this.fit(l))
  }

  /** Animate `step` turning the current term into `next`. Calls `done` when settled. */
  animate(next: LTerm, step: Step, done: () => void) {
    const from = this.current
    if (!from) return this.show(next)
    const to = layout(next)
    const fromOff = -from.width / 2
    const toOff = -to.width / 2

    // Phase 1: the head fires and its arguments get parameter tags.
    const head = this.views.get(step.head)
    if (head) {
      this.tweens.add({ target: head, duration: 420, ease: ease.linear, update: (k) => head.scale.set(1 + ease.bump(k) * 0.25) })
      const ringG = new Graphics().circle(0, 0, R + 6).stroke({ width: 5, color: palette.red })
      ringG.position.copyFrom(head.position)
      this.tagLayer.addChild(ringG)
      this.tweens.add({ target: ringG, duration: 420, update: (k) => { ringG.scale.set(1 + k * 0.4); ringG.alpha = 1 - k } })
    }
    step.args.forEach((id, i) => {
      const span = from.spans.get(id)
      const p = step.params[i]
      if (!span || !p) return
      const cx = fromOff + (span.x0 + span.x1) / 2
      const tag = new Container()
      const w = Math.max(44, span.x1 - span.x0)
      tag.addChild(
        new Graphics().roundRect(-w / 2, -6, w, 8, 4).fill(varColor(p)),
        Object.assign(label(`as ${p}`, 20, varColor(p), "700"), { y: -22 })
      )
      tag.position.set(cx, -R - 22)
      tag.alpha = 0
      this.tagLayer.addChild(tag)
      this.tweens.add({ target: tag, duration: 260, delay: i * 70, ease: ease.outBack, update: (k) => { tag.alpha = k; tag.y = -R - 22 + (1 - k) * 12 } })
    })

    this.tweens.add({ target: this, delay: 950, duration: 1, update: () => {}, done: () => {
      // Phase 2: rewrite. Tags fade, tokens travel to their new homes.
      for (const c of this.tagLayer.children) {
        const tag = c
        this.tweens.add({ target: tag, duration: 200, update: (k) => (tag.alpha = 1 - k) })
      }
      const oldGroups = this.groupLayer
      this.tweens.add({ target: oldGroups, duration: 250, update: (k) => (oldGroups.alpha = 1 - k), done: () => oldGroups.destroy() })
      this.groupLayer = new Graphics()
      drawGroups(this.groupLayer, to, toOff)
      this.groupLayer.alpha = 0
      this.addChildAt(this.groupLayer, 0)
      const groups = this.groupLayer
      this.tweens.add({ target: groups, delay: 350, duration: 350, update: (k) => (groups.alpha = k) })

      const nextViews = new Map<string, Container>()
      const fromPos = new Map(from.tokens.map((t) => [t.id, t.x + fromOff] as const))
      for (const tok of to.tokens) {
        const tx = tok.x + toOff
        let v = this.views.get(tok.id)
        if (v) {
          const sx = v.x
          const view = v
          this.tweens.add({ target: view, duration: 650, ease: ease.inOutSine, update: (k) => {
            view.x = lerp(sx, tx, k)
            view.y = -Math.sin(Math.PI * k) * (Math.abs(tx - sx) > 4 ? 26 : 0)
          } })
        } else {
          // A copy splits off its original and arcs over to its slot.
          const sx = fromPos.get(baseId(tok.id)) ?? tx
          v = tokenView(tok.name, tok.kind)
          v.position.set(sx, 0)
          v.scale.set(0.5)
          this.addChild(v)
          const view = v
          this.tweens.add({ target: view, duration: 750, ease: ease.inOutSine, update: (k) => {
            view.x = lerp(sx, tx, k)
            view.y = -Math.sin(Math.PI * k) * 70
            view.scale.set(lerp(0.5, 1, Math.min(1, k * 1.6)))
          } })
        }
        nextViews.set(tok.id, v)
      }
      for (const [id, v] of this.views) {
        if (nextViews.has(id)) continue
        const view = v
        if (id === step.head) {
          this.tweens.add({ target: view, duration: 360, update: (k) => { view.scale.set(1 + k * 0.7); view.alpha = 1 - k }, done: () => view.destroy({ children: true }) })
        } else {
          // Dropped: tumble off the stage.
          const spin = (Math.random() - 0.5) * 2
          this.tweens.add({ target: view, duration: 700, ease: ease.inCubic, update: (k) => {
            view.y = k * 140
            view.rotation = spin * k
            view.alpha = 1 - k
          }, done: () => view.destroy({ children: true }) })
        }
      }
      this.views.clear()
      for (const [id, v] of nextViews) this.views.set(id, v)
      this.current = to
      const s0 = this.scale.x
      const s1 = this.fit(to)
      this.tweens.add({ target: this, duration: 650, ease: ease.inOutSine, update: (k) => this.scale.set(lerp(s0, s1, k)) })
      this.tweens.add({ target: this, delay: 780, duration: 1, update: () => {}, done: () => {
        this.tagLayer.removeChildren().forEach((c) => c.destroy({ children: true }))
        done()
      } })
    } })
  }
}

const stepCaption = (s: Step) => `${s.redex}  ⟶  ${s.result}   ·   ${describeStep(s)}`

export interface TheaterSpec {
  readonly title: string
  readonly subtitle?: string
  readonly term: Term
  readonly rules?: Rules
  /** Definition line shown at the top: lhs → rhs. */
  readonly definition?: { readonly lhs: Term; readonly rhs: Term }
  /**
   * Optional behaviour to check the normal form against. `term` must already be
   * applied to variables named like the goal's params.
   */
  readonly goal?: { readonly label: string; readonly params: ReadonlyArray<string>; readonly body: Term }
  /**
   * Alternative inputs to try (e.g. the rows of a truth table). Each variant
   * replaces `term` and may carry its own expected normal form.
   */
  readonly variants?: ReadonlyArray<{ readonly label: string; readonly term: Term; readonly expect?: Term }>
  readonly note?: string
}

/** Build the spec that explains a catalogue combinator by applying it to variables. */
export const combinatorSpec = (name: string): TheaterSpec | undefined => {
  const c = byName.get(name)
  if (!c) return undefined
  const lhs = apply(atom(c.name), c.params.map(variable))
  return {
    title: `${c.name} · the ${c.bird.toLowerCase()}`,
    subtitle: `${c.blurb}${c.apl ? `  APL: ${c.apl}` : ""}`,
    term: lhs,
    definition: { lhs, rhs: c.body }
  }
}

const atomsOf = (t: Term): Array<string> =>
  t._tag === "App" ? [...atomsOf(t.fn), ...atomsOf(t.arg)] : t._tag === "Atom" ? [t.name] : []

const rowLabel = (bits: ReadonlyArray<boolean>, out: string) =>
  `${bits.length ? bits.map((b) => (b ? "⊤" : "⊥")).join(" ") : "·"} → ${out}`

/**
 * Build the spec that explains a level goal. If the label is itself a term over
 * known combinators (`KI` is K applied to I), animate the real reduction.
 * Truth-table goals get one variant per row, run through a decision-tree rule.
 * Anything else is treated as a one-step rule.
 */
export const goalSpec = (t: Target, blurb: string): TheaterSpec => {
  const g = goalOf(t)
  if (g._tag === "Truth") {
    const { params, body } = truthRule(g)
    const rules: Rules = new Map([...defaultRules, [t.label, { params, body }]])
    const variants = truthRows(g).map((r) => ({
      label: rowLabel(r.bits, r.expected),
      term: rowTerm(atom(t.label), r.bits),
      expect: atom(r.expected)
    }))
    const lhs = apply(atom(t.label), params.map(variable))
    return {
      title: `goal · ${t.label}`,
      subtitle: `${blurb}  Inputs are Church booleans (⊤ picks the first option, ⊥ the second); the bin then asks for 1 or 0.`,
      term: variants[0]!.term,
      rules,
      definition: { lhs, rhs: body },
      variants,
      goal: { label: t.label, params, body }
    }
  }
  const { params, body } = g.behaviour
  const vars = params.map(variable)
  const parsed = (() => {
    try {
      const p = parse(t.label)
      return atomsOf(p).every((a) => byName.has(a)) ? p : undefined
    } catch {
      return undefined
    }
  })()
  if (parsed) {
    const lhs = apply(parsed, vars)
    return { title: `goal · ${t.label}`, subtitle: blurb, term: lhs, definition: { lhs, rhs: body }, goal: { label: t.label, params, body } }
  }
  const lhs = apply(atom(t.label), vars)
  const rules: Rules = new Map([...defaultRules, [t.label, { params, body }]])
  return { title: `goal · ${t.label}`, subtitle: blurb, term: lhs, rules, definition: { lhs, rhs: body } }
}

/** Explain a player-built term against a goal: fed variables, or every truth-table row. */
export const termSpec = (term: Term, target: Target | undefined): TheaterSpec => {
  const known = recognize(term)
  const title = known && term._tag === "App" ? `${show(term)}  =  ${known.name}` : show(term)
  const g = target ? goalOf(target) : undefined
  if (g?._tag === "Truth") {
    const variants = truthRows(g).map((r) => ({
      label: rowLabel(r.bits, r.expected),
      term: rowTerm(term, r.bits),
      expect: atom(r.expected)
    }))
    const rule = truthRule(g)
    return {
      title,
      subtitle: `Your token, run on every row of the ${g.label} truth table.`,
      term: variants[0]!.term,
      variants,
      goal: { label: g.label, params: rule.params, body: rule.body }
    }
  }
  const params = known ? [...known.params] : g ? [...g.behaviour.params] : ["x", "y", "z"]
  return {
    title,
    subtitle: `What this token does when you feed it ${params.join(", ")}.`,
    term: apply(term, params.map(variable)),
    ...(g ? { goal: { label: g.label, params: g.behaviour.params, body: g.behaviour.body } } : {})
  }
}

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

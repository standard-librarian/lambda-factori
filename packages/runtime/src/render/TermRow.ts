/**
 * A term drawn as a row of tokens inside bracket capsules, and the animation of
 * one rewrite: the head combinator fires, its arguments are tagged with the
 * parameter names, then everything flies to its new place (copied arguments
 * split off, dropped ones fall away, brackets re-form).
 */
import { Container, Graphics } from "pixi.js"
import { colorOf } from "@lambda-factori/core/Catalogue.ts"
import { baseId, type LTerm, spineL, type Step } from "@lambda-factori/core/Trace.ts"
import { label } from "./label.ts"
import { palette } from "./theme.ts"
import { ease, lerp, type Tweens } from "./tween.ts"

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

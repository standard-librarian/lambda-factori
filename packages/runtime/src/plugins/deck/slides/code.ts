/**
 * The `code` slide: panes of highlighted code whose build steps highlight
 * line ranges, zoom the camera in, and draw call arcs and hidden-state arcs
 * (`analyze.ts` finds them in Java-like code), with metrics chips per pane.
 */
import { Container, Graphics, Text } from "pixi.js"
import { label } from "../../../render/label.ts"
import { DESIGN_W, palette } from "../../../render/theme.ts"
import { ease, lerp } from "../../../kernel/tween.ts"
import { joinLines, type SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { type Analysis, analyze, metricsOf } from "../analyze.ts"
import { cardArt, CONTENT_TOP, MONO } from "./common.ts"
import { para } from "../../../render/text.ts"
import type { SlideContext, SlideView } from "../../../kernel/Slide.ts"
import { TAGS, highlight } from "./highlight.ts"

const parseRanges = (spec: string | undefined): Set<number> | undefined => {
  if (!spec) return undefined
  const out = new Set<number>()
  for (const part of spec.split(",")) {
    const [a, b] = part.split("-").map((x) => Number.parseInt(x.trim(), 10))
    if (a === undefined || Number.isNaN(a)) continue
    for (let i = a; i <= (b ?? a); i++) out.add(i - 1)
  }
  return out
}

interface PaneView {
  readonly root: Container
  readonly camera: Container
  readonly lines: ReadonlyArray<Text>
  readonly lineY: (i: number) => number
  readonly arcs: Graphics
  readonly glow: Graphics
  readonly analysis: Analysis | undefined
  readonly gutterX: number
  readonly contentW: number
  readonly lineH: number
  readonly codeX: number
  /** Viewport (in pane coordinates) the camera shows code in. */
  readonly vp: { x: number; y: number; w: number; h: number }
}

const BASE = 22

export const codeSlide = (s: SlideOf<"code">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const steps = s.steps ?? []
  const hasCaption = steps.some((st) => st.caption)
  const top = CONTENT_TOP - 10
  const bottom = hasCaption ? 890 : 1000
  const gap = 36
  const n = Math.max(1, s.panes.length)
  const paneW = (DESIGN_W - 120 - gap * (n - 1)) / n
  const panes: Array<PaneView> = s.panes.map((p, k) => {
    const src = joinLines(p.code).replace(/\t/g, "    ").split("\n")
    const analysis = p.analyze ? analyze(src) : undefined
    const root = new Container()
    root.position.set(60 + k * (paneW + gap), top)
    const h = bottom - top
    root.addChild(cardArt(paneW, h, 0xfbf8f2, 0xe2d9ca, 20))
    const head = label(p.label, 28, palette.ink, "700", "left")
    head.position.set(28, 34)
    root.addChild(head)
    const metricsH = p.metrics ? 44 : 0
    if (p.metrics && analysis) {
      const m = metricsOf(src, analysis)
      const chips = [
        `${m.lines} lines`,
        `${m.methods} method${m.methods === 1 ? "" : "s"}`,
        `${m.comments} comment lines`,
        m.shared ? `${m.shared} shared mutable field${m.shared === 1 ? "" : "s"}` : "no shared state",
        `call depth ${m.depth}`
      ]
      let x = 28
      for (const c of chips) {
        const t = label(c, 18, palette.white, "700")
        const w = t.width + 24
        const chip = new Container()
        chip.addChild(new Graphics().roundRect(0, -16, w, 32, 16).fill(c.includes("shared mutable") ? palette.red : palette.token), t)
        t.position.set(w / 2, 0)
        chip.position.set(x, 80)
        root.addChild(chip)
        x += w + 10
      }
    }
    const vp = { x: 14, y: 72 + metricsH + 8, w: paneW - 28, h: h - (72 + metricsH + 8) - 16 }
    const mask = new Graphics().rect(vp.x, vp.y, vp.w, vp.h).fill(0xffffff)
    const camera = new Container()
    camera.mask = mask
    root.addChild(camera, mask)
    const gutter = analysis ? 110 : 20
    const lineH = BASE * 1.3
    const glow = new Graphics()
    const arcs = new Graphics()
    camera.addChild(glow, arcs)
    const texts = highlight(src).map((m, i) => {
      const t = new Text({ text: m, style: { fontFamily: MONO, fontSize: BASE, fill: palette.ink, tagStyles: TAGS } })
      t.position.set(gutter + 12, i * lineH)
      camera.addChild(t)
      return t
    })
    const contentW = gutter + 12 + Math.max(...texts.map((t) => t.width), 10) + 20
    v.addChild(root)
    return {
      root,
      camera,
      lines: texts,
      lineY: (i) => i * lineH + lineH / 2,
      arcs,
      glow,
      analysis,
      gutterX: gutter,
      contentW,
      lineH,
      codeX: gutter + 12,
      vp
    }
  })

  /** Frame lines [a, b] (or everything) in the pane's viewport. */
  const frame = (p: PaneView, range: Set<number> | undefined, animate: boolean) => {
    const total = p.lines.length
    const lo = range ? Math.min(...range) : 0
    const hi = range ? Math.max(...range) : total - 1
    // Short snippets zoom up to fill their pane; long listings shrink to fit.
    const fitAll = Math.min(1.6, p.vp.w / p.contentW, p.vp.h / (total * p.lineH))
    const want = range ? Math.min(1.6, p.vp.w / p.contentW, p.vp.h / ((hi - lo + 3) * p.lineH)) : fitAll
    const scale = Math.max(fitAll, want)
    const midY = ((lo + hi + 1) / 2) * p.lineH
    const maxY = total * p.lineH * scale - p.vp.h
    const y = range ? Math.max(0, Math.min(maxY, midY * scale - p.vp.h / 2)) : 0
    const tx = p.vp.x + Math.max(0, (p.vp.w - p.contentW * scale) / 2)
    const ty = p.vp.y - y + (total * p.lineH * scale < p.vp.h ? (p.vp.h - total * p.lineH * scale) / 2 : 0)
    const cam = p.camera
    ctx.tweens.cancel(cam)
    if (!animate) {
      cam.scale.set(scale)
      cam.position.set(tx, ty)
      return
    }
    const from = { s: cam.scale.x, x: cam.x, y: cam.y }
    ctx.tweens.add({ owner: cam, target: cam, duration: 650, ease: ease.inOutSine, update: (k) => {
      cam.scale.set(lerp(from.s, scale, k))
      cam.position.set(lerp(from.x, tx, k), lerp(from.y, ty, k))
    } })
  }

  const caption = para("", 30, palette.ink, DESIGN_W - 200, "600", "center")
  caption.position.set(DESIGN_W / 2, 912)
  v.addChild(caption)

  const drawArcs = (p: PaneView, mode: "none" | "calls" | "state" | "both", k: number) => {
    const g = p.arcs.clear()
    const a = p.analysis
    if (!a || mode === "none") return
    // Greedy lane allocation so overlapping arcs nest instead of overdrawing.
    const lanes: Array<{ lane: number; lo: number; hi: number }> = []
    const laneFor = (y1: number, y2: number) => {
      const lo = Math.min(y1, y2)
      const hi = Math.max(y1, y2)
      let lane = 0
      for (; lane < 7; lane++) if (!lanes.some((l) => l.lane === lane && !(hi < l.lo || lo > l.hi))) break
      lanes.push({ lane, lo, hi })
      return lane
    }
    const arc = (y1: number, y2: number, fill: number, dashed: boolean) => {
      const lane = laneFor(y1, y2)
      const x = p.gutterX - 4
      const bulge = 16 + lane * 12 + Math.min(20, Math.abs(y2 - y1) * 0.05)
      // Sample a cubic bezier and draw only the first k of it (grows in).
      const pts: Array<[number, number]> = []
      for (let i = 0; i <= 24; i++) {
        const t = (i / 24) * k
        const u = 1 - t
        const bx = u ** 3 * x + 3 * u * u * t * (x - bulge) + 3 * u * t * t * (x - bulge) + t ** 3 * x
        const by = u ** 3 * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y2
        pts.push([bx, by])
      }
      for (let i = 1; i < pts.length; i++) {
        if (dashed && i % 2 === 0) continue
        g.moveTo(pts[i - 1]![0], pts[i - 1]![1]).lineTo(pts[i]![0], pts[i]![1])
      }
      g.stroke({ width: 3, color: fill, alpha: 0.9, cap: "round" })
      if (k >= 1) g.poly([x, y2, x - 10, y2 - 6, x - 10, y2 + 6]).fill(fill)
      g.circle(x, y1, 4).fill(fill)
    }
    if (mode === "calls" || mode === "both") for (const c of a.calls) arc(p.lineY(c.from), p.lineY(c.to), palette.blue, false)
    if (mode === "state" || mode === "both") {
      for (const w of a.writes) {
        const decl = a.fields.get(w.field)
        if (decl !== undefined) arc(p.lineY(w.line), p.lineY(decl), palette.red, true)
      }
    }
  }

  const apply = (step: number, animate: boolean) => {
    const st = step > 0 ? steps[step - 1] : undefined
    relabel(caption, st?.caption ?? "")
    panes.forEach((p, k) => {
      const active = st?.pane === undefined || st.pane === k
      const lines = active ? parseRanges(st?.lines) : undefined
      p.glow.clear()
      p.lines.forEach((t, i) => {
        const on = lines === undefined || lines.has(i)
        const target = on ? 1 : 0.28
        if (!animate) t.alpha = target
        else {
          const from = t.alpha
          ctx.tweens.add({ target: t, duration: 260, update: (q) => (t.alpha = lerp(from, target, q)) })
        }
        if (lines?.has(i)) p.glow.rect(p.codeX - 10, p.lineY(i) - p.lineH / 2, p.contentW - p.codeX, p.lineH).fill({ color: palette.yellow, alpha: 0.28 })
      })
      frame(p, active ? lines : undefined, animate)
      const mode = active ? st?.arcs ?? "none" : "none"
      if (!animate) drawArcs(p, mode, 1)
      else ctx.tweens.add({ target: p.arcs, duration: 700, ease: ease.outCubic, update: (q) => drawArcs(p, mode, q) })
    })
  }

  return {
    view: v,
    steps: steps.length,
    setStep: apply,
    destroy: () => v.destroy({ children: true })
  }
}

const relabel = (t: Text, s: string) => {
  t.text = s
}

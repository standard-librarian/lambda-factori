/**
 * The `factory` slide. Modules as factories. Callers (the tokens on top) must feed every port on
 * the interface; the x-ray step reveals how much machinery each hides.
 */
import { Container, Graphics } from "pixi.js"
import { applyArt, sourceArt, tokenArt, W as MACHINE_W } from "../../../ui/factoryArt.ts"
import { label } from "../../../ui/label.ts"
import { DESIGN_W, palette } from "../../../ui/theme.ts"
import { ease, lerp } from "../../../kernel/tween.ts"
import type { SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { color, Reveal, shade } from "./common.ts"
import { para } from "../../../ui/text.ts"
import { CONTENT_TOP, type SlideContext, type SlideView } from "../../../kernel/Slide.ts"

export const factorySlide = (s: SlideOf<"factory">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const reveal = new Reveal(ctx.tweens)
  const n = s.modules.length
  const slotW = (DESIGN_W - 160) / n
  const xrays: Array<{ shell: Graphics; inside: Container }> = []
  const feeders: Array<{ ports: Array<{ x: number }>; tokens: Container; bx: number }> = []
  s.modules.forEach((m, i) => {
    const fill = color(m.color, i === 0 ? palette.red : palette.blue)
    const c = new Container()
    const bw = Math.min(700, slotW - 80)
    const bh = 320
    const bx = 80 + slotW * i + (slotW - bw) / 2
    const by = CONTENT_TOP + 220
    c.position.set(bx, by)
    const ports = m.ports.map((_, k) => ({ x: (bw / (m.ports.length + 1)) * (k + 1) }))
    // Inside: a grid of little machines, visible under the x-ray.
    const inside = new Container()
    const cols = Math.max(1, Math.ceil(Math.sqrt(m.inner * 1.6)))
    const rows = Math.max(1, Math.ceil(m.inner / cols))
    const cellW = (bw - 60) / cols
    const cellH = (bh - 110) / rows
    const scale = Math.min(0.55, (cellW - 10) / MACHINE_W, (cellH - 10) / 90)
    for (let k = 0; k < m.inner; k++) {
      const art = k % 3 === 0 ? sourceArt("·", 0x4f56b8, 0x3a3f8f) : applyArt()
      art.root.scale.set(scale)
      art.root.position.set(30 + (k % cols) * cellW + (cellW - MACHINE_W * scale) / 2, 70 + Math.floor(k / cols) * cellH)
      inside.addChild(art.root)
    }
    const wires = new Graphics()
    for (let k = 1; k < m.inner; k++) {
      const ax = 30 + (k % cols) * cellW + cellW / 2
      const ay = 70 + Math.floor(k / cols) * cellH + 10
      const px = 30 + ((k - 1) % cols) * cellW + cellW / 2
      const py = 70 + Math.floor((k - 1) / cols) * cellH + 80 * scale
      wires.moveTo(px, py).lineTo(px, (py + ay) / 2).lineTo(ax, (py + ay) / 2).lineTo(ax, ay)
    }
    wires.stroke({ width: 3, color: palette.wire, alpha: 0.8 })
    inside.addChildAt(wires, 0)
    inside.alpha = 0
    // The building shell: a big castle in the machine's colour.
    const shell = new Graphics()
      .rect(0, 50, bw, bh - 50).fill(fill)
      .rect(0, bh - 22, bw, 22).fill(shade(fill))
    for (let k = 0; k < 8; k++) shell.rect(k * (bw / 7.5), 30, bw / 15, 22).fill(fill)
    for (let k = 0; k < 5; k++) shell.roundRect(40 + k * ((bw - 80) / 4.4), 120, 36, 70, 18).fill(shade(fill))
    c.addChild(shell, inside)
    // Interface ports and their labels.
    const crowded = m.ports.length > 3 || m.ports.some((name) => name.length * 13 > bw / (m.ports.length + 1))
    ports.forEach((p, k) => {
      const dot = new Graphics().circle(p.x, 50, 13).fill(palette.white).circle(p.x, 50, 9).fill(palette.portIn)
      // Crowded interfaces get their labels slanted up and away from the ports.
      const tl = label(m.ports[k]!, crowded ? 18 : 22, palette.ink, "700", "left")
      if (crowded) {
        tl.anchor.set(0, 0.5)
        tl.rotation = -0.85
        tl.position.set(p.x + 2, 26)
      } else tl.position.set(p.x - tl.width / 2, 16)
      c.addChild(dot, tl)
    })
    const name = label(m.name, 36, palette.ink, "700")
    name.position.set(bw / 2, bh + 50)
    const count = label(m.count ?? `${m.ports.length} thing${m.ports.length === 1 ? "" : "s"} to learn`, 26, fill, "700")
    count.position.set(bw / 2, bh + 92)
    c.addChild(name, count)
    if (m.caption) {
      const cap = para(m.caption, 22, palette.inkSoft, bw, "500", "center")
      cap.position.set(bw / 2, bh + 122)
      c.addChild(cap)
    }
    const tokens = new Container()
    c.addChild(tokens)
    v.addChild(c)
    reveal.add(c, i + 1, { y: 30 })
    xrays.push({ shell, inside })
    feeders.push({ ports, tokens, bx })
  })
  if (s.caption) {
    const cap = para(s.caption, 30, palette.ink, DESIGN_W - 300, "600", "center")
    cap.position.set(DESIGN_W / 2, 975)
    v.addChild(cap)
    reveal.add(cap, n + 1, { y: 16 })
  }
  let step = 0
  let clock = 0
  return {
    view: v,
    steps: n + 1,
    setStep: (st, animate) => {
      step = st
      reveal.set(st, animate)
      const xray = st >= n + 1
      for (const x of xrays) {
        const from = x.inside.alpha
        const to = xray ? 1 : 0
        if (!animate) {
          x.inside.alpha = to
          x.shell.alpha = xray ? 0.25 : 1
        } else {
          ctx.tweens.add({ target: x.shell, duration: 600, update: (k) => {
            x.inside.alpha = lerp(from, to, k)
            x.shell.alpha = lerp(xray ? 1 : 0.25, xray ? 0.25 : 1, k)
          } })
        }
      }
    },
    tick: (dt) => {
      clock += dt
      // Callers drop a token into every port of every visible module.
      if (clock > 900) {
        clock = 0
        feeders.forEach((f, i) => {
          if (step < i + 1) return
          f.ports.forEach((p, k) => {
            const t = tokenArt("·", [palette.token, 0x2fa7a0, 0xee8d56][k % 3]!)
            t.scale.set(0.7)
            t.position.set(p.x, -170)
            f.tokens.addChild(t)
            ctx.tweens.add({ target: t, delay: k * 40, duration: 700, ease: ease.inCubic, update: (q) => {
              t.y = lerp(-170, 44, q)
              t.alpha = q > 0.9 ? (1 - q) * 10 : 1
            }, done: () => t.destroy({ children: true }) })
          })
        })
      }
    },
    destroy: () => v.destroy({ children: true })
  }
}

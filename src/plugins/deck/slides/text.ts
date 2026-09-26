import { Container, Graphics, Rectangle } from "pixi.js"
import { applyArt, label, relabel, skylineArt, sourceArt, W } from "../../../render/art.ts"
import { DESIGN_H, DESIGN_W, palette } from "../../../render/theme.ts"
import { ease, lerp } from "../../../render/tween.ts"
import type { SlideOf } from "../Deck.ts"
import { avatar, cardArt, color, CONTENT_TOP, MARGIN, para, Reveal, SERIF, shade, type SlideContext, type SlideView } from "./common.ts"

const staticSlide = (view: Container, extra: Partial<SlideView> = {}): SlideView => ({
  view,
  steps: 0,
  setStep: () => {},
  destroy: () => view.destroy({ children: true }),
  ...extra
})

// ---------------------------------------------------------------------------

export const titleSlide = (s: SlideOf<"title">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const title = para(s.title ?? "", 104, palette.ink, 1500, "700", "center")
  title.position.set(DESIGN_W / 2, 300)
  v.addChild(title)
  let y = title.y + title.height + 30
  if (s.subtitle) {
    const sub = para(s.subtitle, 40, palette.inkSoft, 1400, "600", "center")
    sub.position.set(DESIGN_W / 2, y)
    v.addChild(sub)
    y += sub.height + 50
  }
  const by = [s.byline, s.date].filter(Boolean).join("  ·  ")
  if (by) {
    const t = label(by, 30, palette.red, "700")
    t.position.set(DESIGN_W / 2, y + 20)
    v.addChild(t)
  }
  // A little factory scene: two sources feeding an apply machine.
  const scene = new Container()
  const sArt = sourceArt("S", 0x4f56b8, 0x3a3f8f)
  const kArt = sourceArt("K", 0xee8d56, 0xc96a38)
  const ap = applyArt()
  sArt.root.position.set(0, 60)
  kArt.root.position.set(W + 60, 60)
  ap.root.position.set((W + 60) / 2, -80)
  scene.addChild(sArt.root, kArt.root, ap.root)
  scene.scale.set(1.25)
  scene.position.set(DESIGN_W / 2 - ((2 * W + 60) * 1.25) / 2, 800)
  v.addChild(skylineArt(DESIGN_W, DESIGN_H - 6, 0xe7dfd1), scene)
  let t = 0
  return staticSlide(v, {
    tick: (dt) => {
      t += dt
      sArt.icon.y = -20 + Math.max(0, Math.sin(t / 380)) * 10
      kArt.icon.y = -20 + Math.max(0, Math.sin(t / 380 + 1.6)) * 10
      ap.icon.scale.set(1 + Math.max(0, Math.sin(t / 380 + 0.8)) * 0.15)
    }
  })
}

export const sectionSlide = (s: SlideOf<"section">): SlideView => {
  const v = new Container()
  const fill = color(s.color, palette.red)
  v.addChild(new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(fill))
  v.addChild(skylineArt(DESIGN_W, DESIGN_H - 6, shade(fill, 0.85)))
  if (s.number) {
    const n = label(s.number, 300, palette.white, "700")
    n.alpha = 0.16
    n.position.set(DESIGN_W / 2, 360)
    v.addChild(n)
  }
  const title = para(s.title ?? "", 110, palette.white, 1500, "700", "center")
  title.position.set(DESIGN_W / 2, 420)
  v.addChild(title)
  if (s.subtitle) {
    const sub = para(s.subtitle, 40, palette.white, 1300, "500", "center")
    sub.alpha = 0.9
    sub.position.set(DESIGN_W / 2, title.y + title.height + 30)
    v.addChild(sub)
  }
  return staticSlide(v)
}

export const bulletsSlide = (s: SlideOf<"bullets">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const reveal = new Reveal(ctx.tweens)
  const build = s.build !== false
  let y = CONTENT_TOP + 20
  const count = s.items.length
  const size = count > 6 ? 34 : count > 4 ? 38 : 44
  s.items.forEach((item, i) => {
    const text = typeof item === "string" ? item : item.text
    const sub = typeof item === "string" ? [] : item.sub ?? []
    const tag = typeof item === "string" ? undefined : item.tag
    const row = new Container()
    row.position.set(MARGIN, y)
    const dot = new Graphics().circle(22, size * 0.62, 12).fill(palette.red)
    const t = para(text, size, palette.ink, DESIGN_W - MARGIN * 2 - 80 - (tag ? 220 : 0), "600")
    t.position.set(60, 0)
    row.addChild(dot, t)
    let h = t.height
    if (tag) {
      const pill = new Container()
      const pl = label(tag, 24, palette.white, "700")
      const pw = pl.width + 36
      pill.addChild(new Graphics().roundRect(-pw / 2, -22, pw, 44, 22).fill(palette.blue), pl)
      pill.position.set(DESIGN_W - MARGIN * 2 - pw / 2, size * 0.62)
      row.addChild(pill)
    }
    for (const line of sub) {
      const st = para(line, size * 0.72, palette.inkSoft, DESIGN_W - MARGIN * 2 - 140, "500")
      st.position.set(96, h + 10)
      row.addChild(new Graphics().circle(76, h + 10 + size * 0.45, 6).fill(palette.inkSoft), st)
      h += st.height + 10
    }
    v.addChild(row)
    reveal.add(row, build ? i + 1 : 0, { x: -40 })
    y += h + (size > 40 ? 38 : 28)
  })
  return {
    view: v,
    steps: build ? count : 0,
    setStep: (step, animate) => reveal.set(step, animate),
    destroy: () => v.destroy({ children: true })
  }
}

export const quoteSlide = (s: SlideOf<"quote">): SlideView => {
  const v = new Container()
  const mark = label("“", 400, palette.red, "700")
  mark.alpha = 0.18
  mark.position.set(260, 330)
  const len = s.quote.length
  const size = len > 260 ? 44 : len > 160 ? 52 : 62
  const q = para(s.quote, size, palette.ink, 1420, "600", "center")
  q.style.fontFamily = SERIF
  q.style.fontStyle = "italic"
  q.position.set(DESIGN_W / 2, (s.title ? CONTENT_TOP + 40 : 260))
  const by = label(`— ${s.by}`, 34, palette.red, "700")
  by.position.set(DESIGN_W / 2, q.y + q.height + 70)
  v.addChild(mark, q, by)
  if (s.source) {
    const src = para(s.source, 26, palette.inkSoft, 1400, "500", "center")
    src.position.set(DESIGN_W / 2, by.y + 36)
    v.addChild(src)
  }
  return staticSlide(v)
}

const defaultSpeakers: Record<string, { name: string; color: number; initials: string }> = {
  john: { name: "John Ousterhout", color: palette.blue, initials: "JO" },
  bob: { name: "Uncle Bob", color: palette.red, initials: "UB" }
}

export const dialogueSlide = (s: SlideOf<"dialogue">, ctx: SlideContext): SlideView => {
  const v = new Container()
  let top = CONTENT_TOP
  if (s.context) {
    // The setup: what they are arguing about, before anyone speaks.
    const t = para(s.context, 26, palette.inkSoft, DESIGN_W - MARGIN * 2 - 80, "500")
    t.style.fontStyle = "italic"
    const card = new Container()
    card.addChild(new Graphics().roundRect(0, 0, DESIGN_W - MARGIN * 2, t.height + 36, 18).fill({ color: palette.white, alpha: 0.55 }).rect(0, 0, 8, t.height + 36).fill(palette.yellow))
    t.position.set(36, 18)
    card.addChild(t)
    card.position.set(MARGIN, CONTENT_TOP - 20)
    v.addChild(card)
    top = CONTENT_TOP + t.height + 36
  }
  const clip = new Graphics().rect(0, top + 2, DESIGN_W, 1010 - top).fill(0xffffff)
  const stream = new Container()
  stream.mask = clip
  v.addChild(stream, clip)
  const speakers = (who: string) => {
    const custom = s.speakers?.[who]
    const base = defaultSpeakers[who] ?? { name: who, color: palette.inkSoft, initials: who.slice(0, 2).toUpperCase() }
    return custom
      ? { name: custom.name, color: color(custom.color, base.color), initials: custom.initials ?? base.initials }
      : base
  }
  const order = [...new Set(s.lines.map((l) => l.who))]
  const bubbles: Array<{ c: Container; bottom: number }> = []
  let y = top + 16
  s.lines.forEach((line) => {
    const sp = speakers(line.who)
    // John always sits on the left and Bob on the right; anyone else alternates.
    const left = line.who === "john" ? true : line.who === "bob" || line.who === "spock" ? false : order.indexOf(line.who) % 2 === 0
    const c = new Container()
    const len = line.text.length
    const size = len > 380 ? 26 : len > 220 ? 29 : 33
    const body = para(line.text, size, palette.ink, 1180, "500")
    const name = label(sp.name, 22, sp.color, "700", left ? "left" : "right")
    const bw = Math.max(body.width, name.width) + 64
    const bh = body.height + 70
    const bx = left ? 150 : DESIGN_W - 150 - bw
    const bubble = new Graphics()
      .roundRect(bx, 6, bw, bh, 26).fill(shade(palette.cream, 0.9))
      .roundRect(bx, 0, bw, bh, 26).fill(palette.white)
      .poly(left ? [bx + 10, 34, bx - 22, 58, bx + 26, 58] : [bx + bw - 10, 34, bx + bw + 22, 58, bx + bw - 26, 58]).fill(palette.white)
    name.position.set(left ? bx + 32 : bx + bw - 32, 30)
    body.position.set(bx + 32, 52)
    const av = avatar(sp.initials, sp.color)
    av.position.set(left ? 90 : DESIGN_W - 90, 40)
    c.addChild(bubble, av, name, body)
    c.y = y
    stream.addChild(c)
    bubbles.push({ c, bottom: y + bh + 20 })
    y += bh + 34
  })
  const reveal = new Reveal(ctx.tweens)
  bubbles.forEach((b, i) => reveal.add(b.c, i + 1, { y: 30, s: 0.96 }))
  const scrollTo = (step: number, animate: boolean) => {
    const last = bubbles[step - 1]
    const target = last ? Math.min(0, 1000 - last.bottom) : 0
    ctx.tweens.cancel(stream)
    if (!animate) return void (stream.y = target)
    const from = stream.y
    ctx.tweens.add({ owner: stream, target: stream, duration: 420, ease: ease.inOutSine, update: (k) => (stream.y = lerp(from, target, k)) })
  }
  return {
    view: v,
    steps: bubbles.length,
    setStep: (step, animate) => {
      reveal.set(step, animate)
      scrollTo(step, animate)
    },
    destroy: () => v.destroy({ children: true })
  }
}

export const versusSlide = (s: SlideOf<"versus">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const reveal = new Reveal(ctx.tweens)
  const colW = 760
  const cols = [
    { side: s.left, x: MARGIN, fallback: palette.blue },
    { side: s.right, x: DESIGN_W - MARGIN - colW, fallback: palette.red }
  ]
  const rows: Array<Array<Container>> = [[], []]
  cols.forEach(({ side, x, fallback }, k) => {
    const fill = color(side.color, fallback)
    const head = new Container()
    head.addChild(cardArt(colW, 84, fill, shade(fill), 24))
    const hl = label(side.name, 38, palette.white, "700")
    hl.position.set(colW / 2, 42)
    head.addChild(hl)
    head.position.set(x, CONTENT_TOP)
    v.addChild(head)
    let y = CONTENT_TOP + 120
    for (const p of side.points) {
      const c = new Container()
      const t = para(p, 30, palette.ink, colW - 80, "500")
      c.addChild(cardArt(colW, t.height + 44, palette.white, shade(palette.cream, 0.88), 18))
      c.addChild(new Graphics().roundRect(0, 0, 10, t.height + 44, 5).fill(fill))
      t.position.set(40, 22)
      c.addChild(t)
      c.position.set(x, y)
      v.addChild(c)
      rows[k]!.push(c)
      y += t.height + 66
    }
  })
  // Interleave: left 1, right 1, left 2, …
  let step = 0
  for (let i = 0; i < Math.max(rows[0]!.length, rows[1]!.length); i++) {
    for (const k of [0, 1]) {
      const c = rows[k]![i]
      if (c) reveal.add(c, ++step, { x: k === 0 ? -40 : 40 })
    }
  }
  if (s.agree?.length) {
    const band = new Container()
    const t = para(`we agree: ${s.agree.join(" · ")}`, 30, palette.white, DESIGN_W - MARGIN * 2 - 80, "600", "center")
    band.addChild(cardArt(DESIGN_W - MARGIN * 2, t.height + 44, palette.green, palette.greenShade, 22))
    t.position.set((DESIGN_W - MARGIN * 2) / 2, 22)
    band.addChild(t)
    band.position.set(MARGIN, 980 - t.height - 44)
    v.addChild(band)
    reveal.add(band, ++step, { y: 30 })
  }
  return { view: v, steps: step, setStep: (i, a) => reveal.set(i, a), destroy: () => v.destroy({ children: true }) }
}

export const measureSlide = (s: SlideOf<"measure">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const reveal = new Reveal(ctx.tweens)
  const x0 = MARGIN
  const nameW = 560
  const barW = (DESIGN_W - MARGIN * 2 - nameW - 60) / 2
  const hdr = (text: string, x: number, fill: number) => {
    const t = label(text, 30, fill, "700", "left")
    t.position.set(x, CONTENT_TOP + 10)
    v.addChild(t)
  }
  hdr(s.before, x0 + nameW, palette.red)
  hdr(s.after, x0 + nameW + barW + 60, palette.greenShade)
  const rowH = Math.min(110, (900 - CONTENT_TOP - 80) / Math.max(1, s.rows.length))
  const animators: Array<(k: number) => void> = []
  s.rows.forEach((r, i) => {
    const row = new Container()
    row.position.set(x0, CONTENT_TOP + 70 + i * rowH)
    const name = para(r.metric, 28, palette.ink, nameW - 30, "600")
    row.addChild(name)
    if (r.note) {
      const n = para(r.note, 20, palette.inkSoft, nameW - 30, "500")
      n.position.set(0, name.height + 2)
      row.addChild(n)
    }
    const max = Math.max(r.before, r.after, 1)
    const bars = new Graphics()
    const bv = label("", 30, palette.white, "700", "left")
    const av = label("", 30, palette.white, "700", "left")
    row.addChild(bars, bv, av)
    const draw = (k: number) => {
      const b = (r.before / max) * barW * k
      const a = (r.after / max) * barW * k
      bars.clear()
        .roundRect(nameW, 4, Math.max(8, barW), 52, 14).fill({ color: palette.red, alpha: 0.1 })
        .roundRect(nameW, 4, Math.max(8, b), 52, 14).fill(palette.red)
        .roundRect(nameW + barW + 60, 4, Math.max(8, barW), 52, 14).fill({ color: palette.green, alpha: 0.12 })
        .roundRect(nameW + barW + 60, 4, Math.max(8, a), 52, 14).fill(palette.green)
      const fmt = (n: number) => (Number.isInteger(n) ? `${Math.round(n * k)}` : (n * k).toFixed(1))
      relabel(bv, fmt(r.before), "left")
      relabel(av, fmt(r.after), "left")
      const inside = (w: number) => w > 90
      bv.style.fill = inside(b) ? palette.white : palette.red
      av.style.fill = inside(a) ? palette.white : palette.greenShade
      bv.position.set(inside(b) ? nameW + 18 : nameW + b + 14, 30)
      av.position.set(inside(a) ? nameW + barW + 78 : nameW + barW + 60 + a + 14, 30)
    }
    draw(0)
    animators.push(draw)
    v.addChild(row)
    reveal.add(row, i + 1, { x: -30 })
  })
  if (s.caption) {
    const c = para(s.caption, 26, palette.inkSoft, DESIGN_W - MARGIN * 2, "600", "center")
    c.position.set(DESIGN_W / 2, 930)
    v.addChild(c)
    reveal.add(c, s.rows.length, { y: 20 })
  }
  let shown = 0
  return {
    view: v,
    steps: s.rows.length,
    setStep: (step, animate) => {
      reveal.set(step, animate)
      animators.forEach((draw, i) => {
        const visible = i < step
        if (!visible) return draw(0)
        if (!animate || i < shown) return draw(1)
        ctx.tweens.add({ target: v, duration: 700, delay: 150, ease: ease.outCubic, update: draw })
      })
      shown = step
    },
    destroy: () => v.destroy({ children: true })
  }
}

export const pollSlide = (s: SlideOf<"poll">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const q = para(s.question, 56, palette.ink, 1500, "700", "center")
  q.position.set(DESIGN_W / 2, CONTENT_TOP)
  v.addChild(q)
  const counts = s.options.map(() => 0)
  const n = s.options.length
  const w = Math.min(460, (DESIGN_W - MARGIN * 2 - (n - 1) * 40) / n)
  const bars: Array<() => void> = []
  s.options.forEach((o, i) => {
    const fill = color(o.color, [palette.blue, palette.red, palette.green, palette.yellow][i % 4]!)
    const c = new Container()
    const x = DESIGN_W / 2 - ((n - 1) * (w + 40)) / 2 + i * (w + 40) - w / 2
    c.position.set(x, 380)
    const bar = new Graphics()
    const num = label("0", 90, palette.white, "700")
    const name = para(o.label, 34, palette.white, w - 40, "700", "center")
    c.addChild(bar, num, name)
    const draw = () => {
      const total = Math.max(1, ...counts)
      const h = 120 + (counts[i]! / total) * 330
      bar.clear().roundRect(0, 470 - h + 8, w, h, 26).fill(shade(fill)).roundRect(0, 470 - h, w, h, 26).fill(fill)
      relabel(num, `${counts[i]}`)
      num.position.set(w / 2, 470 - h + 70)
      name.position.set(w / 2, 490)
      name.style.fill = palette.ink
    }
    bars.push(draw)
    c.eventMode = "static"
    c.cursor = "pointer"
    c.hitArea = new Rectangle(0, 0, w, 600)
    c.on("pointerdown", (e) => {
      counts[i] = Math.max(0, counts[i]! + (e.button === 2 || e.shiftKey ? -1 : 1))
      bars.forEach((d) => d())
      ctx.tweens.add({ target: num, duration: 260, ease: ease.linear, update: (k) => num.scale.set(1 + ease.bump(k) * 0.3) })
    })
    v.addChild(c)
  })
  bars.forEach((d) => d())
  const hint = label("click to count a vote · shift-click to undo", 22, palette.inkSoft, "500")
  hint.position.set(DESIGN_W / 2, 1000)
  v.addChild(hint)
  return staticSlide(v)
}

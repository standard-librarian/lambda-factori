import { Container, Graphics, Rectangle } from "pixi.js"
import { label, relabel } from "../../../render/label.ts"
import { DESIGN_W, palette } from "../../../render/theme.ts"
import { ease } from "../../../kernel/tween.ts"
import type { SlideOf } from "@lambda-factori/contracts/Deck.ts"
import { cardArt, color, CONTENT_TOP, shade } from "./common.ts"
import { para } from "../../../render/text.ts"
import type { SlideContext, SlideView } from "../../../kernel/Slide.ts"

const GEM_COLORS = [0xe0485a, 0x306db5, 0x2fa7a0, 0xf2a93b, 0x9b5fc0, 0x4cc887, 0xee8d56]

const gem = (fill: number, r = 14) =>
  new Graphics()
    .poly([0, -r, r, 0, 0, r, -r, 0]).fill(fill)
    .poly([0, -r, r * 0.45, -r * 0.2, -r * 0.45, -r * 0.2]).fill({ color: palette.white, alpha: 0.45 })

/**
 * Parnas's test for a decomposition: pick a design decision that might change
 * and count the modules that know it. Each module shows the decisions it
 * knows as gems; every step makes one change and lights up who must be edited.
 */
export const decisionsSlide = (s: SlideOf<"decisions">, ctx: SlideContext): SlideView => {
  const v = new Container()
  const colorOf = new Map(s.decisions.map((d, i) => [d.id, color(d.color, GEM_COLORS[i % GEM_COLORS.length]!)] as const))
  // Legend; each entry is clickable, to answer "what if this changes?" live.
  let lx = 120
  const legend: Array<{ item: Container; id: string; label: string }> = []
  for (const d of s.decisions) {
    const item = new Container()
    const g = gem(colorOf.get(d.id)!, 12)
    const t = label(d.label, 22, palette.inkSoft, "600", "left")
    t.position.set(22, 0)
    item.addChild(g, t)
    item.position.set(lx, CONTENT_TOP + 6)
    item.eventMode = "static"
    item.cursor = "pointer"
    item.hitArea = new Rectangle(-16, -20, t.width + 44, 40)
    v.addChild(item)
    legend.push({ item, id: d.id, label: d.label })
    lx += t.width + 66
  }
  const nL = s.layouts.length
  const colW = (DESIGN_W - 160 - (nL - 1) * 60) / nL
  const cards: Array<Array<{
    c: Container
    knows: ReadonlyArray<string>
    secretly: ReadonlyArray<{ id: string; gem: Container }>
    outline: Graphics
    surprise: Graphics
    count: number
  }>> = []
  const unit = s.unit ?? "module"
  const counters: Array<ReturnType<typeof label>> = []
  s.layouts.forEach((layout, li) => {
    const x0 = 80 + li * (colW + 60)
    const head = para(layout.label, 32, palette.ink, colW, "700", "center")
    head.position.set(x0 + colW / 2, CONTENT_TOP + 50)
    v.addChild(head)
    const perRow = nL === 1 ? Math.min(3, layout.modules.length) : layout.modules.length > 4 ? 3 : 2
    const cw = (colW - (perRow - 1) * 24) / perRow
    const ch = 150
    const rowsN = Math.ceil(layout.modules.length / perRow)
    const count = label("", 32, palette.red, "700")
    count.position.set(x0 + colW / 2, CONTENT_TOP + 130 + rowsN * (ch + 26) + 34)
    v.addChild(count)
    counters.push(count)
    cards.push(layout.modules.map((m, mi) => {
      const c = new Container()
      c.position.set(x0 + (mi % perRow) * (cw + 24), CONTENT_TOP + 130 + Math.floor(mi / perRow) * (ch + 26))
      const outline = new Graphics().roundRect(-6, -6, cw + 12, ch + 20, 26).stroke({ width: 6, color: palette.red })
      outline.alpha = 0
      const surprise = new Graphics().roundRect(-6, -6, cw + 12, ch + 20, 26).stroke({ width: 6, color: 0xee8d56 })
      surprise.alpha = 0
      c.addChild(outline, surprise, cardArt(cw, ch, palette.white, shade(palette.cream, 0.86), 20))
      const nm = para(m.name, 26, palette.ink, cw - 30, "700", "center")
      nm.position.set(cw / 2, 18)
      c.addChild(nm)
      const secret = m.secretly ?? []
      const slots = m.knows.length + secret.length
      const slotX = (k: number) => cw / 2 - ((slots - 1) * 34) / 2 + k * 34
      m.knows.forEach((k, ki) => {
        const g = gem(colorOf.get(k) ?? palette.inkSoft)
        g.position.set(slotX(ki), ch - 34)
        c.addChild(g)
      })
      // Hidden knowledge: invisible (an unknown unknown) until a change bites.
      const secretly = secret.map((id, si) => {
        const g = gem(colorOf.get(id) ?? palette.inkSoft)
        g.visible = false
        g.position.set(slotX(m.knows.length + si), ch - 34)
        c.addChild(g)
        return { id, gem: g as Container }
      })
      v.addChild(c)
      return { c, knows: m.knows, secretly, outline, surprise, count: m.count ?? 1 }
    }))
  })
  const caption = para("", 30, palette.ink, DESIGN_W - 300, "600", "center")
  caption.position.set(DESIGN_W / 2, 950)
  v.addChild(caption)
  if (s.caption) relabel(caption, s.caption)

  const show = (change: SlideOf<"decisions">["changes"][number] | undefined, animate: boolean) => {
    cards.forEach((layout, li) => {
      let touched = 0
      let surprises = 0
      for (const card of layout) {
        const known = change !== undefined && card.knows.includes(change.decision)
        const secret = change !== undefined && !known && card.secretly.some((x) => x.id === change.decision)
        for (const x of card.secretly) x.gem.visible = change !== undefined && x.id === change.decision
        const hit = known || secret
        if (known) touched += card.count
        if (secret) surprises += card.count
        card.outline.alpha = known ? 1 : 0
        card.surprise.alpha = secret ? 1 : 0
        ctx.tweens.cancel(card.c)
        if (hit && animate) {
          const x = card.c.x
          ctx.tweens.add({ owner: card.c, target: card.c, duration: 460, ease: ease.linear, update: (k) => (card.c.x = x + Math.sin(k * Math.PI * 6) * 7 * (1 - k)), done: () => (card.c.x = x) })
        }
      }
      const plural = (k: number) => `${k} ${unit}${k === 1 ? "" : "s"}`
      relabel(counters[li]!, change
        ? `${plural(touched)} to change${surprises > 0 ? ` · +${surprises} you didn't know about` : ""}`
        : "")
      counters[li]!.style.fill = touched + surprises <= 1 ? palette.greenShade : palette.red
    })
    relabel(caption, change ? `change: ${change.label}` : s.caption ?? "")
  }

  for (const l of legend) l.item.on("pointerdown", () => show({ label: l.label, decision: l.id }, true))

  return {
    view: v,
    steps: s.changes.length,
    setStep: (step, animate) => show(step > 0 ? s.changes[step - 1] : undefined, animate),
    destroy: () => v.destroy({ children: true })
  }
}

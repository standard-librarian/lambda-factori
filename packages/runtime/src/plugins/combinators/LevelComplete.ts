/**
 * The "level complete" overlay: the sticker, this run's stats against the
 * player's best, next/keep-building buttons, and a right-hand column with the
 * paper that introduced the level's combinators and where they appear in real
 * software. Pure view: the caller adds it to the stage and removes it.
 */
import { Container, Graphics } from "pixi.js"
import { byName } from "@lambda-factori/core/Catalogue.ts"
import type { Level, LevelPack } from "@lambda-factori/core/Level.ts"
import type { Stats } from "@lambda-factori/core/Sim.ts"
import { archiveArt, usageArt } from "./archive.ts"
import { label } from "../../ui/label.ts"
import { stickerArt } from "../../ui/factoryArt.ts"
import { BOARD_W, DESIGN_H, DESIGN_W, palette } from "../../ui/theme.ts"
import { ease, lerp, type Tweens } from "../../kernel/tween.ts"
import { Button } from "../../ui/Button.ts"

export interface LevelCompleteOptions {
  readonly level: Level
  readonly pack: LevelPack
  readonly stats: Stats
  /** The player's previous best on this level, if any. */
  readonly best: Stats | undefined
  readonly tweens: Tweens
  /** "next level" (or "menu" on the last level, with `undefined`). */
  readonly onNext: (nextLevelId: string | undefined) => void
  readonly onKeep: () => void
}

export const levelCompletePanel = (o: LevelCompleteOptions): Container => {
  const panel = new Container()
  const dim = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: palette.ink, alpha: 0.35 })
  dim.eventMode = "static"
  panel.addChild(dim)
  const paper = o.pack.papers.find((p) => p.id === o.level.paper)
  const card = new Container()
  const hasRight = paper !== undefined || (o.level.features ?? [o.level.sticker ?? ""]).some((f) => o.pack.usage?.[f])
  const cardX = hasRight ? DESIGN_W / 2 - 290 : BOARD_W / 2
  card.position.set(cardX, DESIGN_H / 2)
  card.addChild(new Graphics().roundRect(-330, -250, 660, 500, 28).fill(palette.cream).roundRect(-330, 236, 660, 14, 7).fill(palette.trayShade))
  const title = label("level complete!", 46, palette.red, "700")
  title.y = -196
  card.addChild(title)

  const sticker = o.level.sticker ? byName.get(o.level.sticker) : undefined
  const glyph = sticker
    ? stickerArt(sticker.name, sticker.bird, sticker.color, 120)
    : stickerArt(o.level.targets.map((t) => t.label).join(""), undefined, palette.bin, 120)
  glyph.position.set(0, -70)
  card.addChild(glyph)
  if (sticker) {
    const rule = label(sticker.rule, 24, palette.inkSoft, "600")
    rule.y = 22
    card.addChild(rule)
  }

  const stat = (name: string, value: number, prev: number | undefined, x: number) => {
    const n = label(name, 20, palette.inkSoft, "600")
    n.position.set(x, 64)
    const v = label(`${value}`, 40, palette.ink, "700")
    v.position.set(x, 100)
    const p = label(prev === undefined ? "first clear" : `best ${Math.min(prev, value)}`, 16, palette.inkSoft, "500")
    p.position.set(x, 132)
    card.addChild(n, v, p)
  }
  stat("machines", o.stats.machines, o.best?.machines, -200)
  stat("cycles", o.stats.cycles, o.best?.cycles, 0)
  stat("term size", o.stats.size, o.best?.size, 200)

  const next = o.pack.levels[o.pack.levels.findIndex((l) => l.id === o.level.id) + 1]
  const nextBtn = new Button({ width: 240, height: 64, color: palette.red, shade: palette.redShade, text: next ? "next level" : "menu", fontSize: 26, onTap: () => o.onNext(next?.id) }, o.tweens)
  nextBtn.position.set(130, 184)
  const keep = new Button({ width: 240, height: 64, color: palette.token, shade: palette.binShade, text: "keep building", fontSize: 26, onTap: o.onKeep }, o.tweens)
  keep.position.set(-130, 184)
  card.addChild(nextBtn, keep)
  panel.addChild(card)

  card.scale.set(0.6)
  panel.alpha = 0
  o.tweens.add({ duration: 480, ease: ease.outBack, update: (k) => {
    panel.alpha = Math.min(1, k * 2)
    card.scale.set(lerp(0.6, 1, k))
    card.y = DESIGN_H / 2 + (1 - k) * 60
  } })
  o.tweens.add({ delay: 200, duration: 700, ease: ease.outElastic, update: (k) => {
    glyph.rotation = (1 - k) * -0.6
    glyph.scale.set(k)
  } })

  // Right column: the paper that introduced these combinators, and where
  // they show up in real software.
  const features = o.level.features ?? (o.level.sticker ? [o.level.sticker] : o.level.targets.map((t) => t.label))
  const snippets = features.flatMap((f) => o.pack.usage?.[f] ?? []).slice(0, 2)
  const right: Array<{ view: Container; h: number }> = []
  if (paper) right.push({ view: archiveArt(paper, 480, snippets.length ? 400 : 470), h: snippets.length ? 400 : 470 })
  if (snippets.length) {
    const u = usageArt(snippets, 480)
    right.push({ view: u.root, h: u.height })
  }
  const total = right.reduce((a, r) => a + r.h, 0) + (right.length - 1) * 40
  let y = DESIGN_H / 2 - total / 2
  right.forEach((r, i) => {
    const px = DESIGN_W / 2 + 340
    const py = y + r.h / 2
    y += r.h + 40
    r.view.position.set(px + 520, py)
    r.view.rotation = 0.22
    panel.addChild(r.view)
    o.tweens.add({ target: r.view, delay: 450 + i * 180, duration: 650, ease: ease.outBack, update: (k) => {
      r.view.x = lerp(px + 520, px, k)
      r.view.rotation = lerp(0.22, i % 2 === 0 ? 0.025 : -0.02, k)
    } })
  })
  return panel
}

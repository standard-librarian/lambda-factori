import { Container, Graphics } from "pixi.js"
import { catalogue, type Combinator } from "@lambda-factori/core/Catalogue.ts"
import { apply, parse, variable } from "@lambda-factori/core/Term.ts"
import { archiveArt } from "./archive.ts"
import { label } from "./label.ts"
import { paperArt } from "./backdrop.ts"
import { stickerArt } from "./factoryArt.ts"
import type { GameContext } from "../plugins/combinators/GameContext.ts"
import type { Scene } from "../kernel/Scene.ts"
import { DESIGN_H, DESIGN_W, palette } from "./theme.ts"
import { ease, lerp } from "../kernel/tween.ts"
import { Theater } from "./Theater.ts"
import { combinatorSpec, type TheaterSpec } from "./TheaterSpec.ts"
import { Button } from "./Button.ts"
import { icons } from "./icons.ts"

const ROWS = 6
const PRIMITIVES = ["S", "K"]

/**
 * The journals: an open book like Word Factori's recipe book (blue) and
 * sticker scrapbook (green). Pages turn with a squash-and-slide.
 */
export class BookScene implements Scene {
  readonly view = new Container()
  private readonly pages = new Container()
  private readonly ctx: GameContext
  private readonly kind: "recipes" | "stickers" | "papers"
  private spread = 0
  private theater: Theater | undefined
  private readonly rows: ReadonlyArray<{ c: Combinator; recipe: string | undefined; index: number }>

  constructor(ctx: GameContext, kind: "recipes" | "stickers" | "papers") {
    this.ctx = ctx
    this.kind = kind
    const save = ctx.progress()
    this.rows = catalogue.filter((c) => !PRIMITIVES.includes(c.name)).flatMap((c) => {
      const found = save.recipes[c.name] ?? []
      // Every combinator gets at least two lines: found recipes plus one open slot.
      const slots = Math.max(2, found.length + 1)
      return Array.from({ length: slots }, (_, index) => ({ c, recipe: found[index], index }))
    })

    const cover = kind === "recipes"
      ? [palette.token, palette.binShade]
      : kind === "stickers"
      ? [palette.green, palette.greenShade]
      : [palette.yellow, 0xc8902c]
    this.view.addChild(paperArt(DESIGN_W, DESIGN_H))
    const book = new Graphics()
      .roundRect(250, 110, 1420, 880, 48).fill(cover[1]!)
      .roundRect(260, 100, 1400, 870, 44).fill(cover[0]!)
      .roundRect(300, 130, 650, 810, 26).fill(palette.cream)
      .roundRect(970, 130, 650, 810, 26).fill(palette.cream)
      .rect(950, 130, 20, 810).fill(0xe6ded2)
    this.view.addChild(book, this.pages)

    const back = new Button({ width: 64, height: 58, color: cover[0]!, shade: cover[1]!, icon: icons.back, onTap: () => ctx.menu() }, ctx.tweens)
    back.position.set(120, 90)
    const prev = new Button({ width: 80, height: 80, color: cover[0]!, shade: cover[1]!, icon: icons.back, onTap: () => this.turn(-1) }, ctx.tweens)
    prev.position.set(400, 880)
    const next = new Button({ width: 80, height: 80, color: cover[0]!, shade: cover[1]!, icon: icons.forward, onTap: () => this.turn(1) }, ctx.tweens)
    next.position.set(1520, 880)
    this.view.addChild(back, prev, next)
    this.render()
  }

  private get pageCount() {
    if (this.kind === "papers") return this.papers.length
    return this.kind === "recipes" ? Math.ceil(this.rows.length / ROWS) : Math.ceil(catalogue.length / 6)
  }

  private get papers() {
    return [...this.ctx.pack.papers].sort((a, b) => a.year - b.year)
  }

  private turn(dir: number) {
    const target = this.spread + dir
    if (target < 0 || target * 2 >= this.pageCount) return
    const from = this.pages.x
    this.ctx.tweens.add({
      duration: 160,
      ease: ease.inCubic,
      update: (k) => {
        this.pages.alpha = 1 - k
        this.pages.x = from - dir * 40 * k
      },
      done: () => {
        this.spread = target
        this.render()
        this.ctx.tweens.add({ duration: 220, update: (k) => {
          this.pages.alpha = k
          this.pages.x = lerp(dir * 40, 0, k)
        } })
      }
    })
  }

  private render() {
    this.pages.removeChildren().forEach((c) => c.destroy({ children: true }))
    const save = this.ctx.progress()
    for (const side of [0, 1]) {
      const page = this.spread * 2 + side
      const x0 = side === 0 ? 300 : 970
      if (this.kind === "papers") {
        this.renderPaper(page, x0)
        continue
      }
      const tab = new Graphics().roundRect(x0 + 60, 150, 530, 56, 16).fill(this.kind === "recipes" ? palette.token : palette.green)
      this.pages.addChild(tab)
      if (this.kind === "recipes") {
        const found = Object.values(save.recipes).reduce((n, r) => n + r.length, 0)
        const heading = label(side === 0 ? "combinator recipes" : `discovered ${found}`, 30, palette.white, "700")
        heading.position.set(x0 + 325, 178)
        this.pages.addChild(heading)
        this.rows.slice(page * ROWS, page * ROWS + ROWS).forEach((row, i) => {
          const y = 250 + i * 92
          const has = row.recipe !== undefined
          const pill = new Graphics().roundRect(x0 + 110, y, 490, 56, 14).fill(has ? 0xa5b2dc : 0xd4c8b0)
          const tick = new Graphics().circle(x0 + 72, y + 28, 20).stroke({ width: 4, color: has ? palette.token : 0xd4c8b0 })
          if (has) {
            tick.circle(x0 + 72, y + 28, 20).fill(palette.token)
            tick.moveTo(x0 + 63, y + 28).lineTo(x0 + 70, y + 36).lineTo(x0 + 83, y + 20).stroke({ width: 4, color: palette.white, cap: "round", join: "round" })
          }
          const recipe = row.recipe
          const hit = new Graphics().rect(x0 + 40, y, 570, 56).fill({ color: 0xffffff, alpha: 0.001 })
          hit.eventMode = "static"
          hit.cursor = "help"
          hit.on("pointertap", () => {
            if (recipe === undefined) {
              const spec = combinatorSpec(row.c.name)
              if (spec) this.open(spec)
              return
            }
            const vars = row.c.params.map(variable)
            this.open({
              title: `${row.c.name} = ${recipe}`,
              subtitle: `Your recipe for the ${row.c.bird.toLowerCase()}, fed ${row.c.params.join(", ")}.`,
              term: apply(parse(recipe), vars),
              definition: { lhs: apply(parse(row.c.name), vars), rhs: row.c.body },
              goal: { label: row.c.name, params: row.c.params, body: row.c.body }
            })
          })
          this.pages.addChild(hit)
          const text = label(`${row.c.name} = ${row.recipe ?? "…"}`, 28, palette.white, "700", "left")
          text.position.set(x0 + 128, y + 28)
          const bird = label(row.index === 0 ? row.c.rule : "", 17, palette.inkSoft, "500", "right")
          bird.position.set(x0 + 590, y + 28)
          this.pages.addChild(pill, tick, text, bird)
        })
      } else {
        const earnedCount = catalogue.filter((c) => save.stickers.includes(c.name) || PRIMITIVES.includes(c.name)).length
        const heading = label(side === 0 ? "sticker book" : `${earnedCount} / ${catalogue.length} birds`, 30, palette.white, "700")
        heading.position.set(x0 + 325, 178)
        this.pages.addChild(heading)
        catalogue.slice(page * 6, page * 6 + 6).forEach((c, i) => {
          const earned = save.stickers.includes(c.name) || PRIMITIVES.includes(c.name)
          const s = stickerArt(earned ? c.name : "?", earned ? c.bird : "???", earned ? c.color : 0xcfc5b4, 130)
          s.position.set(x0 + 180 + (i % 2) * 290, 310 + Math.floor(i / 2) * 200)
          s.rotation = ((i * 7) % 5 - 2) * 0.04
          if (earned) {
            s.eventMode = "static"
            s.cursor = "help"
            s.on("pointertap", () => {
              const spec = combinatorSpec(c.name)
              if (spec) this.open(spec)
            })
          }
          this.pages.addChild(s)
          if (earned) {
            const apl = label(c.apl ? `APL ${c.apl}` : c.family, 17, palette.inkSoft, "600")
            apl.position.set(s.x, s.y + 88)
            this.pages.addChild(apl)
          }
        })
      }
    }
  }

  /** One archive page per paper, unlocked by finishing any level that cites it. */
  private renderPaper(page: number, x0: number) {
    const paper = this.papers[page]
    if (!paper) return
    const save = this.ctx.progress()
    const unlocked = this.ctx.pack.levels.some((l) => l.paper === paper.id && save.completed[l.id])
    if (unlocked) {
      const card = archiveArt(paper, 560, 700)
      card.position.set(x0 + 325, 540)
      card.rotation = page % 2 === 0 ? -0.012 : 0.012
      this.pages.addChild(card)
      return
    }
    const locked = new Graphics().roundRect(x0 + 45, 190, 560, 700, 10).fill(0xe9e0cc)
    const q = label("?", 120, 0xcfc5b4, "700")
    q.position.set(x0 + 325, 480)
    const year = label(`${paper.year}`, 40, 0xb9ad96, "700")
    year.position.set(x0 + 325, 600)
    const where = this.ctx.pack.levels.find((l) => l.paper === paper.id)
    const hint = label(where ? `finish “${where.title}” to unlock` : "locked", 20, palette.inkSoft, "500")
    hint.position.set(x0 + 325, 660)
    this.pages.addChild(locked, q, year, hint)
  }

  private open(spec: TheaterSpec) {
    if (this.theater) return
    this.theater = new Theater(this.ctx.tweens, this.ctx.app.ticker, spec, () => (this.theater = undefined))
    this.view.addChild(this.theater)
  }

  onKey(e: KeyboardEvent) {
    if (this.theater) return this.theater.onKey(e)
    if (e.code === "ArrowRight") this.turn(1)
    if (e.code === "ArrowLeft") this.turn(-1)
    if (e.code === "Escape") this.ctx.menu()
  }

  destroy() {
    this.view.destroy({ children: true })
  }
}

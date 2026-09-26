/**
 * The cards shown after a level: a journal page for the paper that introduced
 * its combinators, and "in the wild" snippets of where they appear in real code.
 */
import { Container, Graphics, Text } from "pixi.js"
import { FONT, palette } from "../../ui/theme.ts"
import { label } from "../../ui/label.ts"

const SERIF = "Georgia, 'Times New Roman', serif"

/**
 * A page from the archive: the paper that introduced this level's
 * combinators, drawn as a slightly yellowed journal page.
 */
export const archiveArt = (p: {
  readonly authors: string
  readonly year: number
  readonly title: string
  readonly venue: string
  readonly note: string
}, width = 460, height = 470) => {
  const c = new Container()
  const g = new Graphics()
    .roundRect(-width / 2 + 6, -height / 2 + 8, width, height, 10).fill({ color: palette.ink, alpha: 0.12 })
    .roundRect(-width / 2, -height / 2, width, height, 10).fill(0xfbf5e4)
    .rect(-width / 2 + 28, -height / 2 + 92, width - 56, 2).fill(0xd8ccb0)
  // Folded corner.
  g.poly([width / 2 - 34, -height / 2, width / 2, -height / 2 + 34, width / 2 - 34, -height / 2 + 34]).fill(0xe8dcc0)
  c.addChild(g)

  const ribbon = new Container()
  ribbon.addChild(new Graphics().roundRect(-92, -17, 184, 34, 17).fill(palette.red))
  ribbon.addChild(label("from the archive", 17, palette.white, "700"))
  ribbon.position.set(-width / 2 + 120, -height / 2)
  c.addChild(ribbon)

  const year = label(`${p.year}`, 46, palette.ink, "700", "left")
  year.position.set(-width / 2 + 28, -height / 2 + 58)
  c.addChild(year)

  const text = (s: string, size: number, color: number, y: number, style: "normal" | "italic" = "normal", weight: "400" | "700" = "400") => {
    const t = new Text({
      text: s,
      style: { fontFamily: SERIF, fontSize: size, fill: color, fontStyle: style, fontWeight: weight, wordWrap: true, wordWrapWidth: width - 56, lineHeight: size * 1.3 }
    })
    t.position.set(-width / 2 + 28, y)
    c.addChild(t)
    return t
  }
  const title = text(p.title, 25, palette.ink, -height / 2 + 108, "italic", "700")
  const authors = text(p.authors, 19, palette.inkSoft, title.y + title.height + 10)
  const venue = text(p.venue, 15, palette.inkSoft, authors.y + authors.height + 4, "italic")
  text(p.note, 17, palette.ink, venue.y + venue.height + 18)
  return c
}

/** "In the wild": where this combinator shows up in real code. */
export const usageArt = (snippets: ReadonlyArray<{ readonly lang: string; readonly code: string | ReadonlyArray<string>; readonly note: string }>, width = 460) => {
  const c = new Container()
  const body = new Container()
  let y = 70
  for (const s of snippets) {
    const lang = label(s.lang, 17, palette.white, "700", "left")
    const pill = new Graphics().roundRect(28, y - 16, lang.width + 24, 30, 15).fill(palette.blue)
    lang.position.set(40, y)
    const code = new Text({
      text: typeof s.code === "string" ? s.code : s.code.join("\n"),
      style: { fontFamily: "BQN386, Menlo, monospace", fontSize: 18, fill: palette.ink, lineHeight: 25 }
    })
    code.position.set(40, y + 26)
    if (code.width > width - 96) code.scale.set((width - 96) / code.width)
    const box = new Graphics().roundRect(28, y + 18, width - 56, code.height + 20, 12).fill(0xffffff)
    const note = new Text({ text: s.note, style: { fontFamily: FONT, fontSize: 17, fill: palette.inkSoft, fontWeight: "500", wordWrap: true, wordWrapWidth: width - 60 } })
    note.position.set(30, y + 26 + code.height + 18)
    body.addChild(pill, lang, box, code, note)
    y = note.y + note.height + 34
  }
  const height = y - 4
  c.addChild(
    new Graphics()
      .roundRect(-width / 2 + 6, -height / 2 + 8, width, height, 14).fill({ color: palette.ink, alpha: 0.12 })
      .roundRect(-width / 2, -height / 2, width, height, 14).fill(palette.cream)
  )
  const ribbon = new Container()
  ribbon.addChild(new Graphics().roundRect(-80, -17, 160, 34, 17).fill(palette.blue), label("in the wild", 17, palette.white, "700"))
  ribbon.position.set(-width / 2 + 108, -height / 2)
  body.position.set(-width / 2, -height / 2)
  c.addChild(body, ribbon)
  return { root: c, height }
}

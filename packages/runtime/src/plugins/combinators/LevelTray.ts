/**
 * The level's right-hand tray: world, title and blurb, one card per machine the
 * level allows (each shows the bird's name and rule, and starts a drag when
 * pressed), and the sticker pile at the bottom.
 */
import { Container, type FederatedPointerEvent, Graphics } from "pixi.js"
import { byName, colorOf } from "@lambda-factori/core/Catalogue.ts"
import type { Level, LevelPack } from "@lambda-factori/core/Level.ts"
import { W } from "../../ui/factoryArt.ts"
import { machineArt } from "./machineArt.ts"
import { label } from "../../ui/label.ts"
import { StickerPile } from "./StickerPile.ts"
import { BOARD_W, DESIGN_H, DESIGN_W, palette } from "../../ui/theme.ts"

export type MachineKind = "source" | "apply"

export const levelTray = (o: {
  readonly level: Level
  readonly pack: LevelPack
  readonly stickers: ReadonlyArray<string>
  readonly onGrab: (kind: MachineKind, atom: string | undefined, e: FederatedPointerEvent) => void
}): { readonly root: Container; readonly pile: StickerPile } => {
  const tray = new Container()
  tray.x = BOARD_W // the machine tray starts where the board ends
  tray.addChild(new Graphics().rect(0, 0, DESIGN_W - BOARD_W, DESIGN_H).fill(palette.tray).rect(0, 0, 6, DESIGN_H).fill(palette.trayShade))
  const world = o.pack.worlds.find((w) => w.id === o.level.world)
  const worldText = label(`${world?.title ?? o.level.world}`.toLowerCase(), 20, palette.inkSoft, "600", "left")
  worldText.position.set(28, 36)
  const title = label(o.level.title, 34, palette.ink, "700", "left")
  title.position.set(26, 72)
  const blurb = label(o.level.blurb, 19, palette.inkSoft, "500")
  blurb.style.wordWrap = true
  blurb.style.wordWrapWidth = 270
  blurb.anchor.set(0, 0)
  blurb.position.set(28, 100)
  tray.addChild(worldText, title, blurb)

  const machinesY = 124 + blurb.height
  const header = label("machines", 20, palette.inkSoft, "600", "left")
  header.position.set(28, machinesY)
  tray.addChild(header)
  const cards: Array<{ kind: MachineKind; atom: string | undefined }> = [
    ...o.level.sources.map((a) => ({ kind: "source" as const, atom: a })),
    { kind: "apply", atom: undefined }
  ]
  cards.forEach((card, i) => {
    const c = machineCard(card.kind, card.atom, o.onGrab)
    c.position.set(28 + (i % 2) * 138, machinesY + 24 + Math.floor(i / 2) * 142)
    tray.addChild(c)
  })

  const pile = new StickerPile(260, DESIGN_H - 24)
  pile.x = 30
  tray.addChild(pile)
  for (const s of o.stickers) pile.drop(s, colorOf(s).color, 130, 0, true)
  return { root: tray, pile }
}

const machineCard = (kind: MachineKind, atom: string | undefined, onGrab: (kind: MachineKind, atom: string | undefined, e: FederatedPointerEvent) => void) => {
  const c = new Container()
  c.addChild(new Graphics().roundRect(0, 0, 124, 128, 14).fill(palette.cream).roundRect(0, 120, 124, 8, 4).fill(palette.trayShade))
  const art = machineArt(kind, atom)
  art.root.scale.set(0.62)
  art.root.position.set(62 - (W * 0.62) / 2, 30)
  const known = atom ? byName.get(atom) : undefined
  const name = label(kind === "apply" ? "apply" : known?.bird.toLowerCase() ?? atom!, 16, palette.inkSoft, "600")
  name.position.set(62, 94)
  const rule = label(kind === "apply" ? "f, x → f x" : known ? known.rule : "primitive", 13, palette.inkSoft, "500")
  rule.position.set(62, 112)
  c.addChild(art.root, name, rule)
  c.eventMode = "static"
  c.cursor = "grab"
  c.on("pointerdown", (e) => {
    e.stopPropagation()
    onGrab(kind, atom, e)
  })
  return c
}

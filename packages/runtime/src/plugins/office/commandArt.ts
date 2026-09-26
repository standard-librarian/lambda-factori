/** Program-strip command blocks, HRM-style: a colour per command family, a bold lowercase name, an argument chip. */
import { Container, Graphics } from "pixi.js"
import { label } from "../../ui/label.ts"
import { mix, office, shadeOf } from "./officePalette.ts"

export const commandColors = (op: string): { fill: number; ink: number } => {
  switch (op) {
    case "inbox":
    case "outbox":
      return { fill: office.cmdIo, ink: office.cmdIoInk }
    case "copyfrom":
    case "copyto":
      return { fill: office.cmdCopy, ink: office.cmdCopyInk }
    case "add":
    case "sub":
    case "bump+":
    case "bump-":
      return { fill: office.cmdMath, ink: office.cmdMathInk }
    case "jump":
    case "jumpz":
    case "jumpn":
    case "label":
      return { fill: office.cmdJump, ink: office.cmdJumpInk }
    case "visit":
    case "pass":
    case "work":
      return { fill: office.cmdDesk, ink: office.cmdDeskInk }
    default:
      return { fill: office.cmdTalk, ink: office.cmdTalkInk }
  }
}

/** One command block, HRM-style: coloured tab, bold lowercase name, argument chip. */
export const commandArt = (name: string, op: string, arg: string | undefined, maxW: number) => {
  const c = new Container()
  const { fill, ink } = commandColors(op)
  const isLabel = op === "label"
  const t = label(isLabel ? "" : name, 24, ink, "700", "left")
  const shown = arg && arg.length > 30 ? `${arg.slice(0, 28)}…”` : arg
  const argT = shown ? label(shown, 20, op === "copyfrom" || op === "copyto" ? 0xffffff : ink, "700", "left") : undefined
  const tw = isLabel ? 70 : t.width + 24
  const g = new Graphics().roundRect(0, 3, tw, 36, 5).fill(shadeOf(fill, 0.78)).roundRect(0, 0, tw, 36, 5).fill(fill)
  t.position.set(12, 18)
  c.addChild(g, t)
  if (argT) {
    const aw = Math.min(maxW - tw - 8, argT.width + 18)
    if (argT.width > aw - 14) argT.scale.set((aw - 14) / argT.width)
    // Argument chips: darker for copy commands (like the tile chip), paler otherwise.
    const face = op === "copyfrom" || op === "copyto" ? shadeOf(fill, 0.86) : mix(fill, 0xffffff, 0.35)
    const chip = new Graphics().roundRect(tw + 6, 3, aw, 36, 5).fill(shadeOf(face, 0.8)).roundRect(tw + 6, 0, aw, 36, 5).fill(face)
    argT.position.set(tw + 15, 18)
    c.addChild(chip, argT)
  }
  return c
}

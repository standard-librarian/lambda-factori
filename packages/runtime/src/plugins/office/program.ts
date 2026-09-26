/**
 * Office programs in Human Resource Machine's own text format, one command per
 * line, with `name:` labels:
 *
 *     INBOX
 *     COPYTO 0
 *   a:
 *     ADD 0
 *     JUMPZ a
 *     OUTBOX
 *
 * plus presentation verbs (VISIT/PASS/WORK a desk, SAY/THINK, BOSS, CLERK,
 * HOLD/DROP, NOTE, PAUSE). `parseProgram` turns text into numbered `Line`s.
 */

export type Value = number | string

export type Op =
  | { readonly op: "inbox" }
  | { readonly op: "outbox" }
  | { readonly op: "copyfrom" | "copyto" | "add" | "sub" | "bump+" | "bump-"; readonly tile: string; readonly indirect: boolean }
  | { readonly op: "jump" | "jumpz" | "jumpn"; readonly label: string }
  | { readonly op: "label"; readonly label: string }
  | { readonly op: "say" | "boss" | "think" | "note"; readonly text: string }
  | { readonly op: "clerk"; readonly desk: string; readonly text: string }
  | { readonly op: "visit" | "pass" | "work"; readonly desk: string }
  | { readonly op: "hold"; readonly value: Value }
  | { readonly op: "drop" }
  | { readonly op: "pause" }

export interface Line {
  readonly op: Op
  /** 1-based line number in the source, for highlighting. */
  readonly line: number
  /** Index among executable commands (labels, notes excluded), HRM-style numbering. */
  readonly number: number | undefined
}

export class ProgramError extends Error {}

const TILE_OPS = new Set(["copyfrom", "copyto", "add", "sub", "bump+", "bump-", "bumpup", "bumpdn"])

export const parseValue = (s: string): Value => (/^-?\d+$/.test(s) ? Number(s) : s)

export const parseProgram = (src: string | ReadonlyArray<string>): Array<Line> => {
  const lines = typeof src === "string" ? src.split("\n") : src
  const out: Array<Line> = []
  let number = 0
  lines.forEach((raw, i) => {
    const text = raw.trim()
    if (!text || text.startsWith("--") || text.startsWith("#")) return
    const label = /^([A-Za-z_][\w-]*):$/.exec(text)
    if (label) {
      out.push({ op: { op: "label", label: label[1]! }, line: i + 1, number: undefined })
      return
    }
    const [head = "", ...rest] = text.split(/\s+/)
    const arg = rest.join(" ")
    const cmd = head.toLowerCase()
    const push = (op: Op, counts = true) => out.push({ op, line: i + 1, number: counts ? ++number : undefined })
    if (cmd === "inbox" || cmd === "outbox" || cmd === "pause" || cmd === "drop") {
      push({ op: cmd } as Op, cmd !== "pause")
    } else if (TILE_OPS.has(cmd)) {
      if (!arg) throw new ProgramError(`line ${i + 1}: ${cmd} needs a tile`)
      const indirect = /^\[.*\]$/.test(arg)
      const op = cmd === "bumpup" ? "bump+" : cmd === "bumpdn" ? "bump-" : cmd
      push({ op, tile: indirect ? arg.slice(1, -1) : arg, indirect } as Op)
    } else if (cmd === "jump" || cmd === "jumpz" || cmd === "jumpn") {
      if (!arg) throw new ProgramError(`line ${i + 1}: ${cmd} needs a label`)
      push({ op: cmd, label: arg })
    } else if (cmd === "say" || cmd === "boss" || cmd === "think" || cmd === "note") {
      push({ op: cmd, text: arg }, cmd !== "note")
    } else if (cmd === "clerk") {
      const [desk = "", ...words] = rest
      if (!desk) throw new ProgramError(`line ${i + 1}: clerk needs a desk`)
      push({ op: "clerk", desk, text: words.join(" ") }, false)
    } else if (cmd === "visit" || cmd === "pass" || cmd === "work") {
      if (!arg) throw new ProgramError(`line ${i + 1}: ${cmd} needs a desk`)
      push({ op: cmd, desk: arg })
    } else if (cmd === "hold") {
      push({ op: "hold", value: parseValue(arg) })
    } else {
      throw new ProgramError(`line ${i + 1}: unknown command “${head}”`)
    }
  })
  const labels = new Set(out.flatMap((l) => (l.op.op === "label" ? [l.op.label] : [])))
  for (const l of out) {
    if ((l.op.op === "jump" || l.op.op === "jumpz" || l.op.op === "jumpn") && !labels.has(l.op.label)) {
      throw new ProgramError(`line ${l.line}: no label “${l.op.label}:”`)
    }
  }
  return out
}

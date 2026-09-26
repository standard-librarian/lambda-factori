/**
 * The office interpreter: a Human Resource Machine-style machine where a
 * worker is the CPU, the hand is the accumulator, floor tiles are memory and
 * conveyor belts are I/O — plus a few presentation verbs (visit a desk, say
 * something, let the boss interrupt). It is pure: `run` produces the whole
 * trace up front, and the renderer only animates it.
 *
 * Programs use HRM's own text format, one command per line:
 *
 *     INBOX
 *     COPYTO 0
 *   a:
 *     ADD 0
 *     JUMPZ a
 *     OUTBOX
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

export interface Desk {
  readonly id: string
  /** What working at this desk does to the box in hand, e.g. "stamp:✓" or "set:ok". */
  readonly work?: string | undefined
  /** A value handed over when visited (copied into the worker's hand). */
  readonly gives?: Value | undefined
}

export interface World {
  readonly inbox: ReadonlyArray<Value>
  readonly tiles: ReadonlyMap<string, Value | undefined>
  readonly desks: ReadonlyMap<string, Desk>
}

export interface State {
  readonly hand: Value | undefined
  readonly inbox: ReadonlyArray<Value>
  readonly outbox: ReadonlyArray<Value>
  readonly tiles: ReadonlyMap<string, Value | undefined>
  readonly pc: number
  readonly steps: number
  readonly trips: number
}

/** One executed command and the state after it. The renderer animates `from` → `to`. */
export interface Action {
  readonly at: number
  readonly op: Op
  readonly from: State
  readonly to: State
  /** Where the worker walks for this action (a tile id, desk id, "inbox" or "outbox"). */
  readonly place: string | undefined
  readonly error: string | undefined
  /** True when this command is a presentation beat boundary. */
  readonly pause: boolean
}

export interface Trace {
  readonly actions: ReadonlyArray<Action>
  readonly final: State
  readonly error: string | undefined
  readonly halted: "end" | "inbox-empty" | "error" | "step-limit"
}

const MAX = 999

/**
 * What a desk's WORK does. `poke:<tile>:<value>` is a hidden side effect: the
 * box comes back untouched, but a tile quietly changes behind your back.
 */
const applyWork = (work: string | undefined, hand: Value | undefined): Value | undefined => {
  if (!work) return hand
  const [kind, arg = ""] = work.split(":")
  if (kind === "poke") return hand
  if (kind === "set") return parseValue(arg)
  if (kind === "stamp") return `${hand ?? ""}${arg}`
  if (kind === "double" && typeof hand === "number") return hand * 2
  if (kind === "inc" && typeof hand === "number") return hand + 1
  return hand
}

export const run = (program: ReadonlyArray<Line>, world: World, limit = 400): Trace => {
  const labelAt = new Map<string, number>()
  program.forEach((l, i) => l.op.op === "label" && labelAt.set(l.op.label, i))
  let state: State = { hand: undefined, inbox: world.inbox, outbox: [], tiles: world.tiles, pc: 0, steps: 0, trips: 0 }
  const actions: Array<Action> = []
  let where = "start"
  const tileOf = (s: State, tile: string, indirect: boolean): string => {
    if (!indirect) return tile
    const v = s.tiles.get(tile)
    if (v === undefined) throw new ProgramError(`tile ${tile} is empty, so [${tile}] points nowhere`)
    return String(v)
  }
  while (state.pc < program.length) {
    if (state.steps >= limit) return { actions, final: state, error: "step limit reached", halted: "step-limit" }
    const line = program[state.pc]!
    const op = line.op
    const from = state
    let next: State = { ...state, pc: state.pc + 1 }
    let place: string | undefined
    const counts = op.op !== "label" && op.op !== "note" && op.op !== "pause" && op.op !== "clerk"
    if (counts) next = { ...next, steps: state.steps + 1 }
    try {
      switch (op.op) {
        case "inbox": {
          const [first, ...rest] = state.inbox
          if (first === undefined) {
            // HRM ends the program when the inbox runs dry.
            return { actions, final: state, error: undefined, halted: "inbox-empty" }
          }
          place = "inbox"
          next = { ...next, hand: first, inbox: rest }
          break
        }
        case "outbox":
          place = "outbox"
          if (state.hand === undefined) throw new ProgramError("Empty hands! You can't OUTBOX nothing.")
          next = { ...next, hand: undefined, outbox: [...state.outbox, state.hand] }
          break
        case "copyfrom": {
          const t = tileOf(state, op.tile, op.indirect)
          place = t
          const v = state.tiles.get(t)
          if (v === undefined) throw new ProgramError(`Tile ${t} is empty! There's nothing to COPYFROM.`)
          next = { ...next, hand: v }
          break
        }
        case "copyto": {
          if (state.hand === undefined) throw new ProgramError("Empty hands! Nothing to COPYTO.")
          const t = tileOf(state, op.tile, op.indirect)
          place = t
          next = { ...next, tiles: new Map(state.tiles).set(t, state.hand) }
          break
        }
        case "add":
        case "sub": {
          const t = tileOf(state, op.tile, op.indirect)
          place = t
          const v = state.tiles.get(t)
          if (state.hand === undefined) throw new ProgramError(`Empty hands! Nothing to ${op.op.toUpperCase()} with.`)
          if (v === undefined) throw new ProgramError(`Tile ${t} is empty!`)
          if (typeof state.hand !== "number" || typeof v !== "number") {
            if (op.op === "sub" && typeof state.hand === "string" && typeof v === "string") {
              // HRM lets you subtract letters to compare them alphabetically.
              next = { ...next, hand: state.hand.charCodeAt(0) - v.charCodeAt(0) }
              place = t
              break
            }
            throw new ProgramError("You can't do arithmetic with letters!")
          }
          const r = op.op === "add" ? state.hand + v : state.hand - v
          if (Math.abs(r) > MAX) throw new ProgramError(`Overflow! ${r} is outside −999…999.`)
          place = t
          next = { ...next, hand: r }
          break
        }
        case "bump+":
        case "bump-": {
          const t = tileOf(state, op.tile, op.indirect)
          place = t
          const v = state.tiles.get(t)
          if (typeof v !== "number") throw new ProgramError(`Tile ${t} has no number to BUMP.`)
          const r = v + (op.op === "bump+" ? 1 : -1)
          if (Math.abs(r) > MAX) throw new ProgramError(`Overflow! ${r} is outside −999…999.`)
          place = t
          next = { ...next, hand: r, tiles: new Map(state.tiles).set(t, r) }
          break
        }
        case "jump":
          next = { ...next, pc: labelAt.get(op.label)! }
          break
        case "jumpz":
          if (state.hand === undefined) throw new ProgramError("Empty hands! JUMPZ has nothing to test.")
          if (state.hand === 0) next = { ...next, pc: labelAt.get(op.label)! }
          break
        case "jumpn":
          if (state.hand === undefined) throw new ProgramError("Empty hands! JUMPN has nothing to test.")
          if (typeof state.hand === "number" && state.hand < 0) next = { ...next, pc: labelAt.get(op.label)! }
          break
        case "visit":
        case "pass":
        case "work": {
          const desk = world.desks.get(op.desk)
          if (!desk) throw new ProgramError(`There's no desk called “${op.desk}”.`)
          place = op.desk
          if (op.op === "visit" && desk.gives !== undefined) next = { ...next, hand: desk.gives }
          if (op.op === "work") {
            next = { ...next, hand: applyWork(desk.work, state.hand) }
            const poke = /^poke:([^:]+):(.*)$/.exec(desk.work ?? "")
            if (poke) next = { ...next, tiles: new Map(next.tiles).set(poke[1]!, parseValue(poke[2]!)) }
          }
          // "pass" hands the box over and gets the very same box back: a pass-through.
          break
        }
        case "hold":
          next = { ...next, hand: op.value }
          break
        case "drop":
          next = { ...next, hand: undefined }
          break
        case "clerk":
          if (!world.desks.has(op.desk)) throw new ProgramError(`There's no desk called “${op.desk}”.`)
          break
        case "label":
        case "say":
        case "boss":
        case "think":
        case "note":
        case "pause":
          break
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      actions.push({ at: state.pc, op, from, to: state, place, error: message, pause: false })
      return { actions, final: state, error: message, halted: "error" }
    }
    if (place && place !== where) {
      next = { ...next, trips: next.trips + 1 }
      where = place
    }
    actions.push({ at: from.pc, op, from, to: next, place, error: undefined, pause: op.op === "pause" })
    state = next
  }
  return { actions, final: state, error: undefined, halted: "end" }
}

/** Compare an outbox against the expected output, HRM-style. */
export const check = (trace: Trace, expected: ReadonlyArray<Value> | undefined): { ok: boolean; message: string } => {
  if (trace.error) return { ok: false, message: trace.error }
  if (!expected) return { ok: true, message: "" }
  const got = trace.final.outbox
  for (let i = 0; i < expected.length; i++) {
    if (got[i] === undefined) return { ok: false, message: `Expected ${expected[i]} in the outbox, but nothing came out.` }
    if (got[i] !== expected[i]) return { ok: false, message: `Bad outbox! Management expected ${expected[i]}, but you gave ${got[i]}.` }
  }
  if (got.length > expected.length) return { ok: false, message: `Too many things in the outbox: ${got[expected.length]} wasn't expected.` }
  return { ok: true, message: "" }
}

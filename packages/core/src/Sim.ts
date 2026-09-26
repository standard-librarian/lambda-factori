/**
 * Discrete-time factory simulation, one "cycle" per tick (Word Factori scores
 * on cycles too). Tokens advance one cell per tick along wires, queue up when
 * blocked, and are absorbed into machine input buffers.
 *
 * The state is mutable for speed but fully owned by the `Sim` instance; the
 * renderer only reads it and consumes the events returned from `step()`.
 */
import type { Board, Building, PortName, Wire } from "./Board.ts"
import { colorOf } from "./Catalogue.ts"
import { DEFAULT_QUOTA, type Goal, goalOf, type Level, satisfies } from "./Level.ts"
import { recognize } from "./Reduce.ts"
import { app, atom, show, size, type Term } from "./Term.ts"

export const SOURCE_PERIOD = 4
export const APPLY_TICKS = 2

export interface Token {
  readonly id: number
  readonly term: Term
  readonly label: string
  readonly color: number
  /** Index into the wire path, and where it was on the previous tick (for interpolation). */
  idx: number
  prevIdx: number
}

interface MachineState {
  readonly building: Building
  inputs: Partial<Record<PortName, Token>>
  busy: number
  pending: Term | undefined
  out: Term | undefined
  cooldown: number
  count: number
  best: number
}

export type SimEvent =
  | { readonly _tag: "Emit"; readonly building: number; readonly label: string }
  | { readonly _tag: "Absorb"; readonly building: number; readonly port: PortName; readonly token: Token }
  | { readonly _tag: "ApplyStart"; readonly building: number }
  | {
    readonly _tag: "Produced"
    readonly building: number
    readonly term: Term
    readonly recognized: string | undefined
  }
  | { readonly _tag: "Accepted"; readonly building: number; readonly count: number; readonly quota: number }
  | { readonly _tag: "Rejected"; readonly building: number; readonly term: Term }
  | { readonly _tag: "Complete"; readonly stats: Stats }

export interface Stats {
  readonly cycles: number
  readonly machines: number
  readonly size: number
}

export const labelFor = (term: Term): { label: string; color: number } => {
  const known = recognize(term)
  if (known) return { label: known.name, color: known.color }
  if (term._tag !== "App") return { label: term.name, color: colorOf(term.name).color }
  const s = show(term)
  return { label: [...s].length <= 6 ? s : "λ", color: 0x7492cb }
}

export class Sim {
  readonly board: Board
  readonly targets: ReadonlyArray<{ readonly goal: Goal; readonly quota: number }>
  readonly machines = new Map<number, MachineState>()
  /** Per wire: token occupying each path cell. */
  readonly lanes = new Map<number, Array<Token | undefined>>()
  tick = 0
  complete = false
  private nextToken = 1

  constructor(board: Board, level: Level) {
    this.board = board
    this.targets = level.targets.map((t) => ({ goal: goalOf(t), quota: t.quota ?? DEFAULT_QUOTA }))
    for (const b of board.buildings) {
      this.machines.set(b.id, {
        building: b,
        inputs: {},
        busy: 0,
        pending: undefined,
        out: undefined,
        cooldown: 0,
        count: 0,
        best: Infinity
      })
    }
    for (const w of board.wires) this.lanes.set(w.id, w.path.map(() => undefined))
  }

  tokens(): ReadonlyArray<{ wire: Wire; token: Token }> {
    const out: Array<{ wire: Wire; token: Token }> = []
    for (const wire of this.board.wires) {
      for (const token of this.lanes.get(wire.id) ?? []) if (token) out.push({ wire, token })
    }
    return out
  }

  machine(id: number): MachineState | undefined {
    return this.machines.get(id)
  }

  step(): ReadonlyArray<SimEvent> {
    const events: Array<SimEvent> = []
    this.tick++
    this.moveTokens(events)
    for (const m of this.machines.values()) this.runMachine(m, events)
    for (const m of this.machines.values()) this.emit(m, events)
    if (!this.complete && this.targets.length > 0) {
      const bins = [...this.machines.values()].filter((m) => m.building.kind === "bin")
      if (bins.every((m) => m.count >= this.targets[m.building.target!]!.quota)) {
        this.complete = true
        events.push({
          _tag: "Complete",
          stats: {
            cycles: this.tick,
            machines: this.board.buildings.filter((b) => b.kind !== "bin").length,
            size: bins.reduce((acc, m) => acc + m.best, 0)
          }
        })
      }
    }
    return events
  }

  private moveTokens(events: Array<SimEvent>) {
    for (const wire of this.board.wires) {
      const lane = this.lanes.get(wire.id)!
      for (const t of lane) if (t) t.prevIdx = t.idx
      const last = lane.length - 1
      const head = lane[last]
      if (head) {
        const dst = this.machines.get(wire.to.building)
        if (dst && dst.inputs[wire.to.port] === undefined) {
          dst.inputs[wire.to.port] = head
          lane[last] = undefined
          events.push({ _tag: "Absorb", building: dst.building.id, port: wire.to.port, token: head })
        }
      }
      // Walk back-to-front so a whole queue shuffles forward together.
      for (let i = last - 1; i >= 0; i--) {
        const t = lane[i]
        if (t && lane[i + 1] === undefined) {
          lane[i + 1] = t
          lane[i] = undefined
          t.idx = i + 1
        }
      }
    }
  }

  private runMachine(m: MachineState, events: Array<SimEvent>) {
    const b = m.building
    switch (b.kind) {
      case "source": {
        if (m.cooldown > 0) m.cooldown--
        if (m.out === undefined && m.cooldown === 0 && b.atom !== undefined) {
          m.out = atom(b.atom)
          m.cooldown = SOURCE_PERIOD
        }
        return
      }
      case "apply": {
        if (m.busy > 0 && --m.busy === 0) {
          m.out = m.pending
          m.pending = undefined
          events.push({ _tag: "Produced", building: b.id, term: m.out!, recognized: recognize(m.out!)?.name })
        }
        const { f, x } = m.inputs
        if (m.busy === 0 && m.out === undefined && m.pending === undefined && f && x) {
          m.pending = app(f.term, x.term)
          m.inputs = {}
          m.busy = APPLY_TICKS
          events.push({ _tag: "ApplyStart", building: b.id })
        }
        return
      }
      case "bin": {
        const t = m.inputs.in
        if (!t) return
        m.inputs = {}
        const target = this.targets[b.target!]!
        if (satisfies(t.term, target.goal)) {
          m.count++
          m.best = Math.min(m.best, size(t.term))
          events.push({ _tag: "Accepted", building: b.id, count: m.count, quota: target.quota })
        } else {
          events.push({ _tag: "Rejected", building: b.id, term: t.term })
        }
        return
      }
    }
  }

  private emit(m: MachineState, events: Array<SimEvent>) {
    if (m.out === undefined) return
    const wires = this.board.wires.filter((w) => w.from === m.building.id)
    if (wires.length === 0 || wires.some((w) => this.lanes.get(w.id)![0] !== undefined)) return
    const { label, color } = labelFor(m.out)
    for (const w of wires) {
      this.lanes.get(w.id)![0] = { id: this.nextToken++, term: m.out, label, color, idx: 0, prevIdx: -1 }
    }
    events.push({ _tag: "Emit", building: m.building.id, label })
    m.out = undefined
  }
}

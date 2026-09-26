import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import pack from "./data/levels.json" with { type: "json" }
import * as Board from "./Board.ts"
import { goalOf, LevelPack, satisfies } from "./Level.ts"
import { Sim } from "./Sim.ts"
import { parse } from "./Term.ts"

const decoded = Schema.decodeUnknownSync(LevelPack)(pack)
const levels = decoded.levels

describe("levels", () => {
  it("decode", () => {
    expect(levels.length).toBeGreaterThan(30)
  })
  it("every level cites a known paper and has unique id", () => {
    const papers = new Set(decoded.papers.map((p) => p.id))
    for (const l of levels) expect(papers.has(l.paper ?? "")).toBe(true)
    expect(new Set(levels.map((l) => l.id)).size).toBe(levels.length)
  })
  it.each(levels.filter((l) => l.hint && !/[—a-z]/.test(l.hint)).map((l) => [l.id, l] as const))(
    "%s hint solves it",
    (_, level) => {
      expect(satisfies(parse(level.hint!), goalOf(level.targets[0]))).toBe(true)
    }
  )
})

describe("sim", () => {
  it("builds I = S K K and fills the bin", () => {
    const level = levels.find((l) => l.id === "idiot")!
    let board = Board.emptyBoard(1)
    const bin = board.buildings[0]!.id
    board = Board.place(board, "source", 10, 18, "S")
    board = Board.place(board, "source", 16, 18, "K")
    board = Board.place(board, "apply", 12, 13)
    board = Board.place(board, "apply", 16, 8)
    const [s, k, a1, a2] = board.buildings.slice(1).map((b) => b.id) as [number, number, number, number]
    board = Board.connect(board, s, { building: a1, port: "f" })
    board = Board.connect(board, k, { building: a1, port: "x" })
    board = Board.connect(board, a1, { building: a2, port: "f" })
    board = Board.connect(board, k, { building: a2, port: "x" })
    board = Board.connect(board, a2, { building: bin, port: "in" })
    expect(board.wires).toHaveLength(5)

    const sim = new Sim(board, level)
    const events = Array.from({ length: 200 }, () => sim.step()).flat()
    expect(events.some((e) => e._tag === "Produced" && e.recognized === "I")).toBe(true)
    const done = events.find((e) => e._tag === "Complete")
    expect(done).toBeDefined()
    expect(done?._tag === "Complete" && done.stats).toMatchObject({ machines: 4, size: 3 })
  })

  it("rejects wrong combinators", () => {
    const level = levels.find((l) => l.id === "idiot")!
    let board = Board.emptyBoard(1)
    board = Board.place(board, "source", 18, 10, "K")
    board = Board.connect(board, board.buildings[1]!.id, { building: board.buildings[0]!.id, port: "in" })
    const sim = new Sim(board, level)
    const events = Array.from({ length: 40 }, () => sim.step()).flat()
    expect(events.some((e) => e._tag === "Rejected")).toBe(true)
    expect(events.some((e) => e._tag === "Accepted")).toBe(false)
  })
})

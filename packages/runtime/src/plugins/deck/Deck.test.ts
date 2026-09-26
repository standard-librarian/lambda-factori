import { readdirSync, readFileSync } from "node:fs"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { analyze } from "./analyze.ts"
import { Deck, joinLines, Slide } from "@lambda-factori/contracts/Deck.ts"
import { templates } from "./templates.ts"

const dir = new URL("../../../../../apps/web/public/decks/", import.meta.url)
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json")

describe.each(files)("deck %s", (file) => {
  const deck = Schema.decodeUnknownSync(Deck)(JSON.parse(readFileSync(new URL(file, dir), "utf8")))

  it("decodes and is listed", () => {
    const index = JSON.parse(readFileSync(new URL("index.json", dir), "utf8")) as Array<string>
    expect(index).toContain(deck.id)
    expect(`${deck.id}.json`).toBe(file)
  })

  it("has code steps that point at real lines", () => {
    for (const s of deck.slides) {
      if (s.kind !== "code") continue
      for (const st of s.steps ?? []) {
        if (!st.lines) continue
        const pane = s.panes[st.pane ?? 0]!
        const count = joinLines(pane.code).split("\n").length
        for (const part of st.lines.split(",")) {
          const [a, b] = part.split("-").map(Number)
          expect(a, `${s.title}: ${st.lines}`).toBeGreaterThanOrEqual(1)
          expect(b ?? a!, `${s.title}: ${st.lines}`).toBeLessThanOrEqual(count)
        }
      }
    }
  })

  it("has assembly lines with one output and state per machine", () => {
    for (const s of deck.slides) {
      if (s.kind !== "line") continue
      for (const r of s.runs) {
        if (r.outputs) expect(r.outputs.length, `${s.title}: outputs`).toBe(s.machines.length)
        if (r.states) expect(r.states.length, `${s.title}: states`).toBe(s.machines.length)
      }
    }
  })

  it("has change maps whose gems name real decisions", () => {
    for (const s of deck.slides) {
      if (s.kind !== "decisions") continue
      const ids = new Set(s.decisions.map((d) => d.id))
      for (const l of s.layouts) for (const m of l.modules) for (const k of [...m.knows, ...(m.secretly ?? [])]) expect(ids, `${s.title}: ${m.name}`).toContain(k)
      for (const c of s.changes) expect(ids, `${s.title}: ${c.label}`).toContain(c.decision)
    }
  })

  it("finds the entanglement in PrimeGenerator", () => {
    const pg = deck.slides.find((s) => s.kind === "code" && s.panes[0]?.label === "PrimeGenerator.java")
    if (!pg || pg.kind !== "code") return
    const a = analyze(joinLines(pg.panes[0]!.code).split("\n"))
    expect(a.methods.map((m) => m.name)).toHaveLength(8)
    expect([...a.fields.keys()]).toEqual(["primes", "multiplesOfPrimeFactors"])
    expect(a.writes.some((w) => w.method === "smallestOddNthMultipleNotLessThanCandidate" && w.field === "multiplesOfPrimeFactors")).toBe(true)
  })
})

describe("slide editor templates", () => {
  it.each(Object.entries(templates))("%s decodes against the schema", (_, template) => {
    expect(() => Schema.decodeUnknownSync(Slide)(template)).not.toThrow()
  })
})

describe("legacy slide kinds", () => {
  it("decodes a pre-plugin theater slide as combinators/theater", () => {
    const slide = Schema.decodeUnknownSync(Slide)({ kind: "theater", title: "A reduction", term: "S K K x" })
    expect(slide).toMatchObject({ kind: "combinators/theater", title: "A reduction", term: "S K K x" })
  })

  it("migrates inside a whole deck, as a saved deck or share link would carry it", () => {
    const deck = Schema.decodeUnknownSync(Deck)({ id: "old", title: "Old", slides: [{ kind: "theater", term: "K x y" }] })
    expect(deck.slides[0]?.kind).toBe("combinators/theater")
  })
})

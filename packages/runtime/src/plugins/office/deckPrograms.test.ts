/**
 * Every bundled deck's `office/scene` slides decode, parse and run. This used
 * to be a check in `plugins/deck/Deck.test.ts` that reached into this
 * plugin's `program.ts`/`vm.ts` directly — a plugin importing another
 * plugin's internals, which the dependency rule forbids
 * (`architecture.test.ts`, rule 6). The office plugin checks its own data
 * against the decks instead.
 */
import { readdirSync, readFileSync } from "node:fs"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Deck } from "@lambda-factori/contracts/Deck.ts"
import { OfficeSpec } from "@lambda-factori/contracts/OfficeSpec.ts"
import { parseProgram } from "./program.ts"
import { run } from "./vm.ts"

const dir = new URL("../../../../../apps/web/public/decks/", import.meta.url)
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json")

describe.each(files)("office scenes in deck %s", (file) => {
  const deck = Schema.decodeUnknownSync(Deck)(JSON.parse(readFileSync(new URL(file, dir), "utf8")))

  it("decode, parse and run", () => {
    for (const s of deck.slides) {
      if (s.kind !== "office/scene") continue
      const spec = Schema.decodeUnknownSync(OfficeSpec)(s, { onExcessProperty: "ignore" })
      const program = parseProgram(spec.program)
      const t = run(program, {
        inbox: spec.inbox ?? [],
        tiles: new Map((spec.tiles ?? []).map((x) => [x.id, x.value])),
        desks: new Map((spec.desks ?? []).map((d) => [d.id, { id: d.id, work: d.work, gives: d.gives }]))
      })
      expect(t.halted, `${spec.title}: ${t.error}`).not.toBe("step-limit")
      if (t.error) expect(t.error, spec.title).not.toMatch(/no desk/)
    }
  })
})

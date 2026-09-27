/** The example's one data invariant: its template decodes with its own schema (the pattern
 * `Deck.test.ts` and each plugin's `mechanics.test.ts` follow for a built-in mechanic). */
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { counterTemplate } from "./counterTemplate.ts"
import { HelloCounterSlide } from "./schema.ts"

describe("hello/counter", () => {
  it("decodes its own template", () => {
    expect(() => Schema.decodeUnknownSync(HelloCounterSlide)(counterTemplate)).not.toThrow()
  })
})

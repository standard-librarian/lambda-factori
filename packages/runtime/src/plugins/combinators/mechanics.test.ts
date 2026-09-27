/** Data test: every combinators mechanic's editor template is a slide its own schema accepts, so
 * the slide editor's insert menu never offers an invalid starting point. */
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { TheaterSlide } from "@lambda-factori/contracts/TheaterSlide.ts"
import { theaterTemplate } from "./theaterTemplate.ts"

describe("combinators mechanic templates", () => {
  it("combinators/theater's template decodes against TheaterSlide", () => {
    expect(() => Schema.decodeUnknownSync(TheaterSlide)(theaterTemplate)).not.toThrow()
  })
})

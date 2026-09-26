/**
 * The `combinators/theater` slide mechanic's data: a term stepped through its
 * reduction, inline in a deck. Validated on its own, independently of the
 * deck's core kinds (`Deck.ts`'s `Plugged` only checks the `kind` shape), the
 * way `OfficeSpec` is for `office/scene`.
 */
import { Schema } from "effect"

export const TheaterSlide = Schema.Struct({
  kind: Schema.Literal("combinators/theater"),
  title: Schema.optional(Schema.String),
  term: Schema.String,
  caption: Schema.optional(Schema.String)
})
export type TheaterSlide = typeof TheaterSlide.Type

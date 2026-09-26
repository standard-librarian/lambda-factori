/**
 * The `hello/counter` slide mechanic's data: validated on its own, the way a
 * built-in mechanic validates its own schema (`OfficeSpec`, `TheaterSlide`).
 * Kept apart from `mechanic.ts` so this file — the one a test decodes the
 * template against — never needs a browser or Pixi.
 */
import { Schema } from "effect"

export const HelloCounterSlide = Schema.Struct({
  kind: Schema.Literal("hello/counter"),
  title: Schema.optional(Schema.String),
  from: Schema.Int,
  to: Schema.Int
})
export type HelloCounterSlide = typeof HelloCounterSlide.Type

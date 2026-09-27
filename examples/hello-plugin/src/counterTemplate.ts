/**
 * A minimal valid `hello/counter` slide, offered by the deck's slide editor
 * insert menu once this plugin is loaded, and checked against
 * `HelloCounterSlide` in `schema.test.ts` — the same pattern a built-in
 * mechanic's template follows (`combinators/theaterTemplate.ts`).
 */
import type { HelloCounterSlide } from "./schema.ts"

export const counterTemplate: typeof HelloCounterSlide.Encoded = {
  kind: "hello/counter",
  title: "Counting up",
  from: 1,
  to: 5
}

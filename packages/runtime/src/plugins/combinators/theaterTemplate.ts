/**
 * A minimal valid `combinators/theater` slide, offered by the deck's slide
 * editor insert menu (`mechanics.ts`) and checked against `TheaterSlide` in
 * `mechanics.test.ts`. Kept apart from `mechanics.ts` for the same reason as
 * `office/sceneTemplate.ts`: the test can decode it without pulling in the
 * Pixi renderer (`theaterSlide.ts`), which needs a browser.
 */
export const theaterTemplate: Record<string, unknown> = {
  kind: "combinators/theater",
  title: "A reduction",
  term: "S K K x"
}

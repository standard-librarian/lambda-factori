import { Effect, Layer, Stream } from "effect"
import { show } from "../core/Term.ts"
import { GameEvents } from "./Events.ts"
import { Levels } from "./Levels.ts"
import { Progress } from "./Progress.ts"

/**
 * Background fiber that turns raw simulation events into progress: new
 * recipes for the recipe book, level completion and stickers.
 */
export const Discovery = Layer.effectDiscard(Effect.gen(function*() {
  const events = yield* GameEvents
  const progress = yield* Progress
  const levels = yield* Levels

  yield* events.stream.pipe(
    Stream.runForEach(Effect.fnUntraced(function*(e) {
      if (e._tag !== "Sim") return
      const sim = e.event
      if (sim._tag === "Produced" && sim.recognized !== undefined) {
        const recipe = show(sim.term)
        const before = yield* progress.get
        const first = (before.recipes[sim.recognized] ?? []).length === 0
        if (yield* progress.recordRecipe(sim.recognized, recipe)) {
          yield* events.publish({ _tag: "RecipeDiscovered", name: sim.recognized, recipe, first })
        }
      } else if (sim._tag === "Complete") {
        const sticker = levels.byId(e.level)?.sticker
        const { newSticker } = yield* progress.completeLevel(e.level, sim.stats, sticker)
        if (newSticker && sticker) yield* events.publish({ _tag: "StickerEarned", name: sticker })
      }
    })),
    Effect.forkScoped
  )
}))

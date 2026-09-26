/**
 * One of the combinator game's own services (`game/`, shared by the
 * combinators and editor plugins, not a generic platform concern): levels
 * made in the level editor, persisted in this browser.
 */
import { Context, Effect, Layer, Ref, Schema } from "effect"
import { Level } from "@lambda-factori/core/Level.ts"
import { Storage } from "../platform/Storage.ts"

const KEY = "lambda-factori/custom-levels/v1"
const LevelsJson = Schema.fromJsonString(Schema.Array(Level))

/** Levels made in the level editor, persisted in this browser. */
export class CustomLevels extends Context.Service<CustomLevels, {
  readonly all: Effect.Effect<ReadonlyArray<Level>>
  save(level: Level): Effect.Effect<void>
  remove(id: string): Effect.Effect<void>
}>()("lambda-factori/game/CustomLevels") {
  static readonly layer = Layer.effect(
    CustomLevels,
    Effect.gen(function*() {
      const storage = yield* Storage
      const raw = yield* storage.get(KEY)
      const initial = raw
        ? yield* Schema.decodeUnknownEffect(LevelsJson)(raw).pipe(
          Effect.tapError((e) => Effect.logWarning("discarding unreadable custom levels", e.message)),
          Effect.orElseSucceed(() => [] as ReadonlyArray<Level>)
        )
        : []
      const ref = yield* Ref.make<ReadonlyArray<Level>>(initial)
      const persist = Effect.fnUntraced(function*(levels: ReadonlyArray<Level>) {
        yield* Ref.set(ref, levels)
        yield* storage.set(KEY, yield* Schema.encodeEffect(LevelsJson)(levels).pipe(Effect.orDie))
      })
      return CustomLevels.of({
        all: Ref.get(ref),
        save: Effect.fn("CustomLevels.save")(function*(level: Level) {
          const levels = yield* Ref.get(ref)
          const i = levels.findIndex((l) => l.id === level.id)
          yield* persist(i < 0 ? [...levels, level] : levels.map((l, k) => (k === i ? level : l)))
        }),
        remove: Effect.fn("CustomLevels.remove")(function*(id: string) {
          yield* persist((yield* Ref.get(ref)).filter((l) => l.id !== id))
        })
      })
    })
  )
}

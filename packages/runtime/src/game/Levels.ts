import { Context, Effect, Layer, Schema } from "effect"
import { LevelPack, type Level } from "@lambda-factori/core/Level.ts"
import pack from "@lambda-factori/core/data/levels.json" with { type: "json" }

export class LevelsError extends Schema.TaggedError<LevelsError>()("LevelsError", {
  message: Schema.String
}) {}

export class Levels extends Context.Service<Levels, {
  readonly pack: LevelPack
  byId(id: string): Level | undefined
  next(id: string): Level | undefined
}>()("lambda-factori/game/Levels") {
  static readonly layer = Layer.effect(
    Levels,
    Effect.gen(function*() {
      const decoded = yield* Schema.decodeUnknownEffect(LevelPack)(pack).pipe(
        Effect.mapError((e) => new LevelsError({ message: e.message }))
      )
      const index = new Map(decoded.levels.map((l, i) => [l.id, i]))
      return Levels.of({
        pack: decoded,
        byId: (id) => decoded.levels[index.get(id) ?? -1],
        next: (id) => decoded.levels[(index.get(id) ?? -2) + 1]
      })
    })
  )
}

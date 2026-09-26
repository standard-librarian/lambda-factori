/**
 * A browser-platform detail (`platform/`, imports nothing else in `runtime`):
 * a minimal string key-value store, so services built on it (`game/Progress.ts`,
 * `game/CustomLevels.ts`, `plugins/deck/Decks.ts`) can be tested without a browser.
 */
import { Context, Effect, Layer } from "effect"

export class Storage extends Context.Service<Storage, {
  get(key: string): Effect.Effect<string | undefined>
  set(key: string, value: string): Effect.Effect<void>
}>()("lambda-factori/platform/Storage") {
  static readonly localStorage = Layer.succeed(
    Storage,
    Storage.of({
      get: (key) => Effect.sync(() => globalThis.localStorage?.getItem(key) ?? undefined),
      set: (key, value) =>
        Effect.sync(() => globalThis.localStorage?.setItem(key, value)).pipe(
          // Quota errors or private mode must never break the game loop.
          Effect.catchDefect(() => Effect.void)
        )
    })
  )

  static readonly memory = Layer.sync(Storage, () => {
    const data = new Map<string, string>()
    return Storage.of({
      get: (key) => Effect.sync(() => data.get(key)),
      set: (key, value) => Effect.sync(() => void data.set(key, value))
    })
  })
}

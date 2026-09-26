import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { Progress } from "./Progress.ts"
import { Storage } from "./Storage.ts"

const run = <A>(eff: Effect.Effect<A, never, Progress | Storage>) =>
  Effect.runPromise(eff.pipe(Effect.provide(Progress.layer.pipe(Layer.provideMerge(Storage.memory)))))

describe("Progress", () => {
  it("records recipes once and persists them across reloads", async () => {
    const result = await run(Effect.gen(function*() {
      const progress = yield* Progress
      const first = yield* progress.recordRecipe("I", "SKK")
      const again = yield* progress.recordRecipe("I", "SKK")
      const other = yield* progress.recordRecipe("I", "SKS")
      const sticker = yield* progress.completeLevel("idiot", { cycles: 40, machines: 4, size: 3 }, "I")
      const stickerAgain = yield* progress.completeLevel("idiot", { cycles: 30, machines: 5, size: 3 }, "I")
      // Rebuild the service from the same storage to check the round trip.
      const storage = yield* Storage
      const reloaded = yield* Effect.gen(function*() {
        return yield* (yield* Progress).get
      }).pipe(Effect.provide(Progress.layer.pipe(Layer.provide(Layer.succeed(Storage, storage)))))
      return { first, again, other, sticker, stickerAgain, reloaded }
    }))
    expect(result).toMatchObject({ first: true, again: false, other: true })
    expect(result.sticker.newSticker).toBe(true)
    expect(result.stickerAgain.newSticker).toBe(false)
    expect(result.reloaded.recipes["I"]).toEqual(["SKK", "SKS"])
    expect(result.reloaded.completed["idiot"]).toEqual({ cycles: 30, machines: 4, size: 3 })
  })
})

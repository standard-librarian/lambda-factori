/**
 * One of the combinator game's own services (`game/`, shared by the
 * combinators and editor plugins, not a generic platform concern): the
 * in-process bus for simulation and progress events.
 */
import { Context, Effect, Layer, PubSub, Stream } from "effect"
import type { SimEvent } from "@lambda-factori/core/Sim.ts"

export type GameEvent =
  | { readonly _tag: "Sim"; readonly level: string; readonly event: SimEvent }
  | { readonly _tag: "RecipeDiscovered"; readonly name: string; readonly recipe: string; readonly first: boolean }
  | { readonly _tag: "StickerEarned"; readonly name: string }

/** In-process event bus between the simulation, progress tracking and the UI. */
export class GameEvents extends Context.Service<GameEvents, {
  publish(event: GameEvent): Effect.Effect<void>
  readonly stream: Stream.Stream<GameEvent>
}>()("lambda-factori/game/GameEvents") {
  static readonly layer = Layer.effect(
    GameEvents,
    Effect.gen(function*() {
      const pubsub = yield* PubSub.unbounded<GameEvent>()
      yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))
      return GameEvents.of({
        publish: (event) => PubSub.publish(pubsub, event).pipe(Effect.asVoid),
        stream: Stream.fromPubSub(pubsub)
      })
    })
  )
}

/**
 * The kernel's view onto anything the host can show: a Pixi container plus
 * the lifecycle the host drives it with (ticks, keys, destruction). Nothing
 * here knows about the combinator game; `GameContext`, the combinator game's
 * own window onto the host, lives at `plugins/combinators/GameContext.ts`.
 */
import type { Container } from "pixi.js"
import type { GameEvent } from "../game/Events.ts"

export interface Scene {
  readonly view: Container
  tick?(dtMs: number): void
  /**
   * Whether the scene is moving on its own and needs a frame every tick. The host
   * renders on demand; scenes with a `tick` count as always moving unless they say otherwise.
   */
  animating?(): boolean
  onEvent?(event: GameEvent): void
  onKey?(event: KeyboardEvent): void
  destroy(): void
}

/**
 * The kernel's view onto anything the host can show: a Pixi container plus
 * the lifecycle the host drives it with (ticks, keys, destruction). Nothing
 * here knows about the combinator game or its events; `GameContext`, the
 * combinator game's own window onto the host, lives at
 * `plugins/combinators/GameContext.ts`, and a scene that cares about game
 * events subscribes to them itself (see `GameContext.subscribe`).
 */
import type { Container } from "pixi.js"

export interface Scene {
  readonly view: Container
  tick?(dtMs: number): void
  /**
   * Whether the scene is moving on its own and needs a frame every tick. The host
   * renders on demand; scenes with a `tick` count as always moving unless they say otherwise.
   */
  animating?(): boolean
  onKey?(event: KeyboardEvent): void
  destroy(): void
}

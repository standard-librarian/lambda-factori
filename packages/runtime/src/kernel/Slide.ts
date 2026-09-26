/**
 * The slide contract every deck-style plugin renders to: how a slide sees the
 * host (`SlideContext`) and what rendering it must hand back (`SlideView`),
 * plus the shape a plugin exposes to lend the deck new slide kinds
 * (`Mechanic`). Kept in `kernel/` so the deck, the office and any future
 * slide mechanic can all depend on this without depending on each other.
 */
import type { Container, Ticker } from "pixi.js"
import type { HostApi } from "./Plugin.ts"
import type { Tweens } from "./tween.ts"

export interface SlideContext {
  readonly host: HostApi
  readonly tweens: Tweens
  readonly ticker: Ticker
  /** Tell the deck the slide moved itself to build step `step` (e.g. from its own controls). */
  readonly syncStep?: (step: number) => void
}

/**
 * A rendered slide. `steps` is the number of build steps after the initial
 * state; the deck calls `setStep(i)` for i in 0…steps as the presenter
 * advances, with `animate` false when jumping (overview, going back).
 */
export interface SlideView {
  readonly view: Container
  readonly steps: number
  setStep(step: number, animate: boolean): void
  tick?(dt: number): void
  /** Whether the slide needs frames right now; slides with `tick` but no `animating` always do. */
  animating?(): boolean
  destroy(): void
}

/**
 * Slide mechanics contributed by plugins. A deck slide whose kind is
 * "<plugin>/<mechanic>" is rendered by that plugin; mechanics are loaded
 * lazily the first time a deck uses them.
 */
export interface Mechanic {
  /** The mechanic paints the whole slide (no paper background or deck title). */
  readonly fullBleed?: boolean
  /** Validate and render a slide. Throw with a readable message on bad data. */
  render(slide: Record<string, unknown>, ctx: SlideContext): SlideView
}

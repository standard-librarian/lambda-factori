/**
 * The reduction theater's play/step state machine, with no drawing: which
 * step is showing, whether autoplay is armed, and how long to wait before the
 * next automatic step. `Theater` asks it what to do (`next`/`prev`/`restart`/
 * `togglePlay`/`tick`) and carries out the returned effect — animate to a
 * step, jump straight to one, or stop — then calls `land` once an animation
 * finishes. This owns only the decision of when; the animation itself is
 * `TermRow`'s job.
 */
export type PlaybackEffect =
  | { readonly type: "none" }
  | { readonly type: "animate"; readonly to: number }
  | { readonly type: "show"; readonly to: number }

export class TheaterPlayback {
  index = 0
  playing: boolean
  private busyFlag = false
  private wait: number

  constructor(private total: number, firstWait = 700) {
    this.playing = total > 0
    this.wait = firstWait
  }

  get busy() {
    return this.busyFlag
  }

  /** Change how many steps there are (a new variant's trace) and start over. */
  reset(total: number): PlaybackEffect {
    this.total = total
    return this.restart()
  }

  /** Ask to animate to the next step. Guarded: no-op mid-animation or at the end. */
  next(): PlaybackEffect {
    if (this.busyFlag || this.index >= this.total) return { type: "none" }
    this.busyFlag = true
    return { type: "animate", to: this.index + 1 }
  }

  /** The animation `next()` requested has landed: commit the index and arm the next wait. */
  land() {
    this.index++
    this.busyFlag = false
    this.wait = 650
  }

  /** Jump straight back one step (no animation) and pause autoplay. */
  prev(): PlaybackEffect {
    if (this.busyFlag || this.index === 0) return { type: "none" }
    this.playing = false
    this.index--
    return { type: "show", to: this.index }
  }

  restart(): PlaybackEffect {
    if (this.busyFlag) return { type: "none" }
    this.index = 0
    this.playing = this.total > 0
    this.wait = 500
    return { type: "show", to: 0 }
  }

  /** Neither armed nor mid-animation: flip autoplay, or restart if already at the end. */
  togglePlay(): "restart" | "toggled" {
    if (this.index >= this.total) return "restart"
    this.playing = !this.playing
    this.wait = 0
    return "toggled"
  }

  /** Advance the clock. Tells the caller to advance a step, stop at the end, or do nothing. */
  tick(dt: number): "advance" | "stop" | "none" {
    if (!this.playing || this.busyFlag) return "none"
    this.wait -= dt
    if (this.wait > 0) return "none"
    if (this.index >= this.total) {
      this.playing = false
      return "stop"
    }
    return "advance"
  }
}

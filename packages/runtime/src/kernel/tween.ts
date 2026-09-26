/**
 * A tiny tween runner driven by the Pixi ticker. Every animation in the game
 * (squash, pops, slides, shakes) is a tween over a normalised t ∈ [0, 1].
 */
export type Ease = (t: number) => number

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inCubic: (t: number) => t ** 3,
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
  },
  outElastic: (t: number) =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  /** 0 → 1 → 0, for pulses and shakes. */
  bump: (t: number) => Math.sin(Math.PI * t)
} satisfies Record<string, Ease>

interface Tween {
  elapsed: number
  dead: boolean
  readonly duration: number
  readonly delay: number
  readonly ease: Ease
  readonly update: (t: number) => void
  readonly done: (() => void) | undefined
  readonly owner: object | undefined
  readonly target: { readonly destroyed: boolean } | undefined
}

export interface TweenOptions {
  readonly duration: number
  readonly delay?: number
  readonly ease?: Ease
  readonly update: (t: number) => void
  readonly done?: () => void
  /** Tweens with the same owner can be cancelled together. */
  readonly owner?: object
  /** Display object being animated; the tween dies silently once it is destroyed. */
  readonly target?: { readonly destroyed: boolean }
}

export class Tweens {
  private tweens: Array<Tween> = []

  /** True while any tween is pending or running. */
  get active(): boolean {
    return this.tweens.length > 0
  }

  add(o: TweenOptions): void {
    this.tweens.push({
      elapsed: 0,
      dead: false,
      duration: Math.max(1, o.duration),
      delay: o.delay ?? 0,
      ease: o.ease ?? ease.outCubic,
      update: o.update,
      done: o.done,
      owner: o.owner,
      target: o.target
    })
  }

  after(ms: number, fn: () => void): void {
    this.add({ delay: ms, duration: 1, update: () => {}, done: fn })
  }

  cancel(owner: object): void {
    for (const t of this.tweens) if (t.owner === owner) t.dead = true
  }

  clear(): void {
    for (const t of this.tweens) t.dead = true
  }

  tick(dtMs: number): void {
    // Snapshot: tweens added by callbacks start on the next frame.
    for (const tw of [...this.tweens]) {
      if (tw.dead) continue
      if (tw.target?.destroyed) {
        tw.dead = true
        continue
      }
      tw.elapsed += dtMs
      const local = tw.elapsed - tw.delay
      if (local < 0) continue
      const t = Math.min(1, local / tw.duration)
      tw.update(tw.ease(t))
      if (t >= 1) {
        tw.dead = true
        tw.done?.()
      }
    }
    this.tweens = this.tweens.filter((t) => !t.dead)
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

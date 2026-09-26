/**
 * A transport bar for anything that plays over time: restart · back ·
 * play/pause · forward · speed, a progress bar with a notch at every stop, and
 * a status line. It holds no playback state: the owner handles the taps and
 * calls `show` with what to display.
 */
import { Container, Graphics } from "pixi.js"
import { Button } from "./Button.ts"
import { icons } from "./icons.ts"
import { label, relabel } from "./label.ts"
import { palette } from "./theme.ts"
import type { Tweens } from "./tween.ts"

export interface PlaybackHandlers {
  readonly restart: () => void
  readonly back: () => void
  readonly playPause: () => void
  readonly forward: () => void
  readonly speed: () => void
}

export interface PlaybackState {
  readonly playing: boolean
  readonly canBack: boolean
  readonly canForward: boolean
  /** 0…1 */
  readonly progress: number
  /** Stop positions (0…1) and whether the playhead has passed each. */
  readonly notches: ReadonlyArray<{ readonly at: number; readonly reached: boolean }>
  readonly status: string
  readonly speed: number
}

const BAR_W = 540

export class PlaybackBar extends Container {
  private readonly playB: Button
  private readonly backB: Button
  private readonly forwardB: Button
  private readonly speedB: Button
  private readonly progress = new Graphics()
  private readonly status = label("", 22, palette.inkSoft, "600")

  /** `after` runs once after any tap, so the owner can redraw. */
  constructor(tweens: Tweens, on: PlaybackHandlers, after: () => void) {
    super()
    const button = (x: number, onTap: () => void, look: { icon?: (g: Graphics) => void; text?: string }, w = 76) => {
      const b = new Button({ width: w, height: 60, color: palette.blue, shade: 0x1f4c85, fontSize: 24, onTap: () => (onTap(), after()), ...look }, tweens)
      b.position.set(x, 0)
      this.addChild(b)
      return b
    }
    button(-250, on.restart, { icon: icons.restart })
    this.backB = button(-160, on.back, { icon: icons.back })
    this.playB = button(-40, on.playPause, { icon: icons.play }, 96)
    this.forwardB = button(80, on.forward, { icon: icons.forward })
    this.speedB = button(190, on.speed, { text: "1×" }, 96)
    this.status.position.set(-40, 52)
    this.addChild(this.progress, this.status)
  }

  show(s: PlaybackState) {
    this.playB.setIcon(s.playing ? icons.pause : icons.play)
    this.backB.enabled = s.canBack
    this.forwardB.enabled = s.canForward
    if (this.speedB.text) relabel(this.speedB.text, `${s.speed}×`)
    const x0 = -BAR_W / 2 - 40
    this.progress.clear()
      .roundRect(x0, 36, BAR_W, 8, 4).fill({ color: palette.ink, alpha: 0.12 })
      .roundRect(x0, 36, Math.max(8, BAR_W * s.progress), 8, 4).fill(palette.blue)
    for (const n of s.notches) this.progress.circle(x0 + BAR_W * n.at, 40, 5).fill(n.reached ? palette.blue : 0xc9cbe0)
    relabel(this.status, s.status)
    this.status.x = -40
  }
}

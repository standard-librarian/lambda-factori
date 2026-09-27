/** The spec for `theaterPlayback.ts`, the theater's play/step state machine with no drawing:
 * autoplay arming, the busy guard while an animation runs, and when the clock advances or stops. */
import { describe, expect, it } from "vitest"
import { TheaterPlayback } from "./theaterPlayback.ts"

describe("theater playback", () => {
  it("arms autoplay only when there is something to reduce", () => {
    expect(new TheaterPlayback(0).playing).toBe(false)
    expect(new TheaterPlayback(3).playing).toBe(true)
  })

  it("next requests an animation, and only commits the index on land", () => {
    const p = new TheaterPlayback(2)
    const eff = p.next()
    expect(eff).toEqual({ type: "animate", to: 1 })
    expect(p.index).toBe(0) // not yet committed
    expect(p.busy).toBe(true)
    expect(p.next()).toEqual({ type: "none" }) // busy mid-animation
    p.land()
    expect(p.index).toBe(1)
    expect(p.busy).toBe(false)
  })

  it("refuses to animate past the last step", () => {
    const p = new TheaterPlayback(1)
    p.next()
    p.land()
    expect(p.index).toBe(1)
    expect(p.next()).toEqual({ type: "none" })
  })

  it("prev jumps straight back and pauses autoplay", () => {
    const p = new TheaterPlayback(2)
    p.next()
    p.land()
    expect(p.prev()).toEqual({ type: "show", to: 0 })
    expect(p.index).toBe(0)
    expect(p.playing).toBe(false)
    expect(p.prev()).toEqual({ type: "none" }) // already at the start
  })

  it("restart rewinds to the first step and re-arms autoplay", () => {
    const p = new TheaterPlayback(2)
    p.next()
    p.land()
    expect(p.restart()).toEqual({ type: "show", to: 0 })
    expect(p.index).toBe(0)
    expect(p.playing).toBe(true)
  })

  it("togglePlay flips autoplay, but restarts once at the end", () => {
    const p = new TheaterPlayback(1)
    expect(p.togglePlay()).toBe("toggled")
    expect(p.playing).toBe(false)
    p.next()
    p.land()
    expect(p.togglePlay()).toBe("restart")
  })

  it("tick advances only once the wait elapses, and stops autoplay at the end", () => {
    const p = new TheaterPlayback(1, 100)
    expect(p.tick(50)).toBe("none")
    expect(p.tick(60)).toBe("advance")
    p.next()
    p.land() // index === total now, wait armed to 650
    expect(p.tick(700)).toBe("stop")
    expect(p.playing).toBe(false)
  })

  it("reset swaps the trace length and starts over", () => {
    const p = new TheaterPlayback(1)
    p.next()
    p.land()
    expect(p.reset(3)).toEqual({ type: "show", to: 0 })
    expect(p.index).toBe(0)
    expect(p.playing).toBe(true)
  })
})

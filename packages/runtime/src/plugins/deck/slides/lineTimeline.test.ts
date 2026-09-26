import { describe, expect, it } from "vitest"
import { buildTimeline, Playhead, segmentAt } from "./lineTimeline.ts"

const timeline = buildTimeline({ inbox: { x: 100, y: 500 }, belt: 600, machines: [400, 800], tray: 1200 })
const run = (h: Playhead, ms = 60_000) => {
  for (let t = 0; t < ms && h.playing; t += 16) h.advance(16)
}

describe("line timeline", () => {
  it("visits every machine in order and ends in the tray", () => {
    expect(timeline.segments.map((s) => s.kind)).toEqual(["travel", "work", "hold", "travel", "work", "hold", "travel", "drop"])
    expect(timeline.stops).toHaveLength(4) // start, after each of 2 machines, end
    expect(segmentAt(timeline, 0).segment.kind).toBe("travel")
    expect(segmentAt(timeline, timeline.total).segment.kind).toBe("drop")
  })

  it("reveals each machine's output halfway through its work", () => {
    expect(timeline.revealAt[0]).toBeLessThan(timeline.stops[1]!)
    expect(timeline.revealAt[1]).toBeGreaterThan(timeline.stops[1]!)
  })
})

describe("playhead", () => {
  it("forward pauses at the next stop", () => {
    const h = new Playhead(timeline, 2)
    h.forward()
    expect(h.run).toBe(1)
    run(h)
    expect(h.playing).toBe(false)
    expect(h.time).toBe(timeline.stops[1])
    h.forward()
    run(h)
    expect(h.time).toBe(timeline.stops[2])
  })

  it("back goes to the previous stop, then to the previous item", () => {
    const h = new Playhead(timeline, 2)
    h.jump(2, false) // item 2, finished
    h.back()
    expect(h.time).toBe(timeline.stops[2])
    h.back()
    h.back()
    h.back()
    expect([h.run, h.time]).toEqual([1, timeline.total])
  })

  it("play at the end of an item starts the next one", () => {
    const h = new Playhead(timeline, 2)
    h.jump(1, false)
    h.togglePlay()
    expect([h.run, h.time, h.playing]).toEqual([2, 0, true])
    run(h)
    expect(h.finished).toBe(true)
    expect(h.canForward).toBe(false)
  })

  it("speed scales how fast time passes", () => {
    const h = new Playhead(timeline, 1)
    h.jump(1, true)
    h.cycleSpeed() // 1× → 2×
    h.advance(100)
    expect(h.time).toBe(200)
  })
})

/**
 * The line slide's clock, with no drawing. One item's trip down the line is a
 * fixed sequence of segments (travel to a machine, work inside it, hold at its
 * exit, …, drop into the tray). `Playhead` owns (run, time) and the transport:
 * play/pause, step to the next or previous stop, restart, speed. The view draws
 * whatever the playhead says, so pausing, stepping back and speed changes are
 * exact by construction.
 */

/** Pace, unhurried so the audience can read each output: px/ms on the belt, ms per stage. */
const TRAVEL_SPEED = 0.42
const WORK_MS = 1100
const HOLD_MS = 900
const DROP_MS = 450
/** The item disappears into a machine this far left of its centre and comes out this far right. */
const ENTRY = 72

export type Segment =
  | { readonly kind: "travel"; readonly from: number; readonly to: number; readonly fromY: number; readonly d: number }
  | { readonly kind: "work"; readonly machine: number; readonly d: number }
  | { readonly kind: "hold"; readonly x: number; readonly d: number }
  | { readonly kind: "drop"; readonly d: number }

export interface Timeline {
  readonly segments: ReadonlyArray<Segment>
  /** Start time of each segment. */
  readonly starts: ReadonlyArray<number>
  readonly total: number
  /** Where back/forward land: the start, after each machine has worked, the end. */
  readonly stops: ReadonlyArray<number>
  /** When machine `i`'s output (and new state) appears: halfway through its work. */
  readonly revealAt: ReadonlyArray<number>
}

export interface LinePath {
  readonly inbox: { readonly x: number; readonly y: number }
  /** The y the item rides at on the belt. */
  readonly belt: number
  readonly machines: ReadonlyArray<number>
  readonly tray: number
}

export const buildTimeline = (path: LinePath): Timeline => {
  const segments: Array<Segment> = []
  let x = path.inbox.x
  let y = path.inbox.y
  const travel = (to: number) => {
    segments.push({ kind: "travel", from: x, to, fromY: y, d: Math.max(500, Math.abs(to - x) / TRAVEL_SPEED) })
    x = to
    y = path.belt
  }
  path.machines.forEach((mx, i) => {
    travel(mx - ENTRY)
    segments.push({ kind: "work", machine: i, d: WORK_MS })
    x = mx + ENTRY
    segments.push({ kind: "hold", x, d: HOLD_MS })
  })
  travel(path.tray)
  segments.push({ kind: "drop", d: DROP_MS })

  const starts: Array<number> = []
  let total = 0
  for (const seg of segments) {
    starts.push(total)
    total += seg.d
  }
  const works = segments.flatMap((seg, k) => (seg.kind === "work" ? [{ start: starts[k]!, d: seg.d }] : []))
  return {
    segments,
    starts,
    total,
    stops: [0, ...works.map((w) => w.start + w.d), total],
    revealAt: works.map((w) => w.start + w.d / 2)
  }
}

/** The segment playing at `time`, and how far through it (0…1). */
export const segmentAt = (t: Timeline, time: number) => {
  let k = t.segments.length - 1
  while (k > 0 && t.starts[k]! > time) k--
  return { segment: t.segments[k]!, local: Math.min(1, (time - t.starts[k]!) / t.segments[k]!.d) }
}

const SPEEDS = [0.5, 1, 2] as const

/**
 * Which item is on the line (`run`, 1-based; 0 = none yet), where it is
 * (`time`), and whether it's moving. Transport methods mirror the playback bar.
 */
export class Playhead {
  run = 0
  time = 0
  playing = false
  speed: number = 1
  /** Pause when time reaches this (set when stepping to a stop). */
  private until = Number.POSITIVE_INFINITY
  private readonly t: Timeline
  private readonly runs: number

  constructor(timeline: Timeline, runs: number) {
    this.t = timeline
    this.runs = runs
  }

  get finished() {
    return this.run === 0 || this.time >= this.t.total
  }

  get canBack() {
    return this.run > 0
  }

  get canForward() {
    return !(this.run === this.runs && this.time >= this.t.total)
  }

  /** The deck moved to build step `run`: play it from the start, or show it finished. */
  jump(run: number, animate: boolean) {
    this.run = run
    this.until = Number.POSITIVE_INFINITY
    this.playing = animate && run > 0
    this.time = this.playing ? 0 : this.t.total
  }

  restart() {
    if (this.run === 0) return this.start(1, Number.POSITIVE_INFINITY)
    this.time = 0
    this.until = Number.POSITIVE_INFINITY
    this.playing = true
  }

  back() {
    this.playing = false
    if (this.run === 0) return
    // Just past a stop counts as being on it, so back goes to the stop before.
    const prev = [...this.t.stops].reverse().find((st) => st < this.time - 400)
    if (prev !== undefined) this.time = prev
    else if (this.run > 1) {
      this.run--
      this.time = this.t.total
    } else {
      this.run = 0
      this.time = 0
    }
  }

  togglePlay() {
    if (this.playing) return void (this.playing = false)
    if (this.nextRunReady()) return this.start(this.run + 1, Number.POSITIVE_INFINITY)
    if (this.time >= this.t.total) this.time = 0
    this.until = Number.POSITIVE_INFINITY
    this.playing = true
  }

  /** Play to the next stop, then pause there. */
  forward() {
    if (this.nextRunReady()) return this.start(this.run + 1, this.t.stops[1]!)
    if (this.time >= this.t.total) return
    this.until = this.t.stops.find((st) => st > this.time + 1) ?? this.t.total
    this.playing = true
  }

  cycleSpeed() {
    this.speed = SPEEDS[(SPEEDS.indexOf(this.speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length]!
  }

  /** Advance the clock by `dt` real milliseconds. */
  advance(dt: number) {
    if (!this.playing) return
    this.time = Math.min(this.t.total, this.until, this.time + dt * this.speed)
    if (this.time >= this.until || this.time >= this.t.total) this.playing = false
  }

  private nextRunReady() {
    return this.run === 0 || (this.time >= this.t.total && this.run < this.runs)
  }

  private start(run: number, until: number) {
    this.run = run
    this.time = 0
    this.until = until
    this.playing = true
  }
}

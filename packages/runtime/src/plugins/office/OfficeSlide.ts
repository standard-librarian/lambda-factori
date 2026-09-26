/**
 * The `office/scene` slide: a Human Resource Machine-style room acting out a
 * program. The VM runs the whole program up front (a `Trace` of actions with
 * the state before and after each). This module then plays that trace:
 * - it builds the room (`Room`), the program strip, the speech bubbles and the stats chips;
 * - it plays the trace in beats (each deck step runs up to the next PAUSE, or the whole
 *   room plays itself in autoplay);
 * - it runs the HRM-style controls (reset, step, play, fast) and the worker's idle life.
 * `perform` acts out each command; `Performer` owns the moving parts.
 */
import { Container, Graphics } from "pixi.js"
import type { OfficeSpec } from "@lambda-factori/contracts/OfficeSpec.ts"
import type { SlideContext, SlideView } from "../../kernel/Slide.ts"
import { Button } from "../../render/Button.ts"
import { label } from "../../render/label.ts"
import { FLOOR, ROOM_H } from "./layout.ts"
import { perform } from "./perform.ts"
import { Performer } from "./Performer.ts"
import { ProgramStrip } from "./ProgramStrip.ts"
import { Room } from "./Room.ts"
import { Speech } from "./Speech.ts"
import { type Action, check, run, type State, type Trace } from "./vm.ts"
import { parseProgram, type Value } from "./program.ts"

export const officeSlide = (spec: OfficeSpec, ctx: SlideContext): SlideView => {
  const v = new Container()
  const program = parseProgram(spec.program)
  const trace: Trace = run(program, {
    inbox: spec.inbox ?? [],
    tiles: new Map<string, Value | undefined>((spec.tiles ?? []).map((t) => [t.id, t.value])),
    desks: new Map((spec.desks ?? []).map((d) => [d.id, { id: d.id, work: d.work, gives: d.gives }]))
  })
  const result = check(trace, spec.expect)

  const room = new Room(spec)
  const strip = new ProgramStrip(spec, program, ctx.tweens)
  v.addChild(room.root, strip.root, strip.pointer)
  const speech = new Speech(room, ctx.tweens)
  const p = new Performer(room, ctx.tweens, spec.speed ?? 1)
  const drawStats = statsChips(spec, program.filter((l) => l.number !== undefined).length, v)
  const autoplay = spec.autoplay !== false
  const stage = { p, speech, strip, spec, autoplay, drawStats }

  // --- Beats: each deck step runs up to the next PAUSE (or to the end) ---------
  const cuts: Array<number> = [0]
  trace.actions.forEach((a, i) => a.pause && cuts.push(i + 1))
  if (cuts.at(-1) !== trace.actions.length) cuts.push(trace.actions.length)
  let at = 0
  let beat = 0

  const stateAt = (i: number): { s: State; where: string | undefined } => {
    if (i === 0) return { s: trace.actions[0]?.from ?? trace.final, where: undefined }
    const a = trace.actions[i - 1]!
    let where: string | undefined
    for (let k = i - 1; k >= 0 && !where; k--) where = trace.actions[k]!.place
    return { s: a.error ? a.from : a.to, where }
  }

  const finish = () => {
    if (at < trace.actions.length || trace.error) return
    if (spec.expect && !result.ok) speech.bossSays(result.message, "error")
    else if (spec.boss?.success) speech.bossSays(spec.boss.success)
    if (spec.expect && result.ok) void p.hop(p.gen).then(() => p.hop(p.gen))
  }

  /** After jumping, show the latest line each speaker said in the current beat. */
  const restoreTalk = (i: number) => {
    let start = 0
    for (const c of cuts) if (c < i) start = c
    const said = new Map<string, Action>()
    for (let k = start; k < i; k++) {
      const o = trace.actions[k]!.op
      if (o.op === "say" || o.op === "think") said.set("worker", trace.actions[k]!)
      else if (o.op === "boss") said.set("boss", trace.actions[k]!)
      else if (o.op === "clerk") said.set(`clerk:${o.desk}`, trace.actions[k]!)
    }
    for (const { op: o } of said.values()) {
      if (o.op === "say" || o.op === "think") speech.say(o.text, o.op)
      else if (o.op === "boss") speech.bossSays(o.text)
      else if (o.op === "clerk") speech.clerkSays(o.desk, o.text)
    }
  }

  const jumpTo = (i: number) => {
    p.gen++
    speech.clear()
    at = i
    const { s, where } = stateAt(i)
    p.snap(s, where)
    drawStats(s)
    strip.pointAt(i < trace.actions.length ? trace.actions[i]!.at : trace.actions.at(-1)?.at ?? 0, false)
    strip.showPointer(i > 0)
    restoreTalk(i)
    const last = trace.actions[i - 1]
    if (last?.error) speech.bossSays(last.error, "error")
    if (i === trace.actions.length && i > 0) finish()
  }

  const playTo = async (end: number) => {
    const g = ++p.gen
    strip.showPointer(true)
    while (at < end && g === p.gen) {
      const a = trace.actions[at]!
      await perform(stage, a, g)
      if (g !== p.gen) return
      at++
      if (a.error) break
    }
    if (g === p.gen && at === trace.actions.length) finish()
  }

  const reset = () => {
    jumpTo(0)
    if (spec.boss?.intro) speech.bossSays(spec.boss.intro)
  }
  reset()

  // --- HRM-style controls: reset, step, play, fast -------------------------------
  const controls = new Container()
  controls.position.set(FLOOR.fx + 60, ROOM_H - 130)
  v.addChild(controls)
  const control = (x: number, fill: number, shade: number, icon: (g: Graphics) => void, onTap: () => void) => {
    const b = new Button({ width: 70, height: 60, color: fill, shade, icon, onTap }, ctx.tweens)
    b.position.set(x, 0)
    controls.addChild(b)
  }
  control(0, 0xb5483d, 0x7a2a22, (g) => g.roundRect(-12, -12, 24, 24, 4).fill(0xffffff), () => {
    beat = 0
    reset()
  })
  control(86, 0x85a051, 0x55702c, (g) => g.poly([-10, -12, 6, 0, -10, 12]).fill(0xffffff).rect(8, -12, 5, 24).fill(0xffffff), () => {
    if (at < trace.actions.length) void playTo(at + 1)
  })
  control(172, 0x85a051, 0x55702c, (g) => g.poly([-10, -14, 14, 0, -10, 14]).fill(0xffffff), () => {
    p.speed = spec.speed ?? 1
    void playTo(trace.actions.length)
  })
  control(258, 0x85a051, 0x55702c, (g) => g.poly([-16, -12, 0, 0, -16, 12]).poly([0, -12, 16, 0, 0, 12]).fill(0xffffff), () => {
    p.speed = (spec.speed ?? 1) * 4
    void playTo(trace.actions.length)
  })

  const idle = idleLife(room)
  return {
    view: v,
    steps: autoplay ? 0 : cuts.length - 1,
    setStep: (step, animate) => {
      if (autoplay) {
        // The room plays itself; PAUSE lines become short holds. One → press moves on.
        reset()
        const g = p.gen
        ctx.tweens.add({ target: v, delay: 700, duration: 1, update: () => {}, done: () => {
          if (g === p.gen) void playTo(trace.actions.length)
        } })
        return
      }
      if (animate && step === beat + 1) {
        // Catch up if the previous beat is still playing, then play this one.
        if (at < cuts[beat]!) jumpTo(cuts[beat]!)
        beat = step
        p.speed = spec.speed ?? 1
        void playTo(cuts[step]!)
        return
      }
      beat = step
      jumpTo(cuts[step]!)
      if (step === 0 && spec.boss?.intro) speech.bossSays(spec.boss.intro)
    },
    tick: (dt) => idle(dt, p.moving),
    destroy: () => {
      p.gen++
      v.destroy({ children: true })
    }
  }
}

/** The steps / size / trips / "in your head" chips in the room's top-left corner. */
const statsChips = (spec: OfficeSpec, size: number, parent: Container) => {
  const box = new Container()
  box.position.set(FLOOR.fx + 20, FLOOR.fy + 20)
  parent.addChild(box)
  const chips = (spec.stats ?? ["steps", "size"]).map((kind, i) => {
    const t = label("", 22, 0xfff3e3, "700", "left")
    const chip = new Container()
    chip.addChild(new Graphics().roundRect(0, -19, 200, 38, 19).fill({ color: 0x2a1a12, alpha: 0.55 }), t)
    t.position.set(16, 0)
    chip.position.set(i * 214, 0)
    box.addChild(chip)
    return { kind, t }
  })
  return (s: State) => {
    for (const c of chips) {
      c.t.text = c.kind === "steps" ? `steps ${s.steps}`
        : c.kind === "size" ? `size ${size}`
        : c.kind === "trips" ? `trips ${s.trips}`
        : `in your head ${[...s.tiles.values()].filter((x) => x !== undefined).length + (s.hand === undefined ? 0 : 1)}`
    }
  }
}

/** The worker breathes, blinks, and glances around when not walking. */
const idleLife = (room: Room) => {
  let clock = Math.random() * 3000
  let blinkAt = 2500
  let glanceAt = 3500
  const w = room.worker
  return (dt: number, moving: boolean) => {
    clock += dt
    w.body.scale.set(1, 1 + Math.sin(clock / 600) * 0.012)
    if (clock > glanceAt && !moving) {
      // Look left, right, then back at the camera.
      const k = (clock - glanceAt) / 900
      w.look(k < 1 ? Math.sin(k * Math.PI * 2) * 0.9 : 0, 0)
      if (k >= 1) glanceAt = clock + 3000 + Math.random() * 4000
    }
    if (clock > blinkAt) {
      const k = (clock - blinkAt) / 140
      w.blink(k < 1 ? k : k < 2 ? 2 - k : 0)
      if (k >= 2) blinkAt = clock + 2200 + Math.random() * 2600
    }
  }
}

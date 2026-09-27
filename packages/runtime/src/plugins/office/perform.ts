/**
 * The choreography of each office command: given one VM action (with the
 * state before and after it), walk the worker to the right place and act it
 * out. Boxes fly between belts, tiles and hands, clerks nod, the boss speaks,
 * and errors get a head shake and a scolding. The VM has already decided what
 * happens; this only shows it.
 */
import type { Container } from "pixi.js"
import type { OfficeSpec } from "@lambda-factori/contracts/OfficeSpec.ts"
import { label } from "../../ui/label.ts"
import { ease, lerp } from "@lambda-factori/kernel/tween.ts"
import { boxArt } from "./roomArt.ts"
import { bubbleArt } from "./bubbleArt.ts"
import { inSlot, outSlot } from "./layout.ts"
import { type Performer, tweenP } from "./Performer.ts"
import type { ProgramStrip } from "./ProgramStrip.ts"
import type { Speech } from "./Speech.ts"
import type { Action } from "@lambda-factori/office/vm.ts"
import type { Value } from "@lambda-factori/office/program.ts"

export interface Stage {
  readonly p: Performer
  readonly speech: Speech
  readonly strip: ProgramStrip
  readonly spec: OfficeSpec
  /** PAUSE lines are short holds when the room plays itself, instant otherwise. */
  readonly autoplay: boolean
  readonly drawStats: (s: Action["to"]) => void
}

export const perform = async (st: Stage, a: Action, g: number) => {
  const { p, speech, strip } = st
  const o = a.op
  strip.pointAt(a.at, true)
  if (o.op !== "say" && o.op !== "think" && o.op !== "boss") speech.fadeWorker()
  if (a.place) await p.walk(p.room.spotOf(a.place, p.place), g)
  if (g !== p.gen) return
  switch (o.op) {
    case "inbox":
      await takeFromInbox(p, a)
      break
    case "outbox":
      await putInOutbox(p, a)
      break
    case "copyfrom": {
      await p.stomp(g)
      const copy = p.addBox(a.to.hand!, p.tileViews.get(a.place!)?.position ?? p.handWorld(), "fx")
      await p.fly(copy, p.handWorld(), 260, 30)
      copy.destroy({ children: true })
      p.setHand(a.to.hand)
      break
    }
    case "copyto": {
      await p.stomp(g)
      const old = p.tileViews.get(a.place!)
      const copy = p.addBox(a.from.hand!, p.handWorld())
      await p.fly(copy, p.room.tilePos.get(a.place!)!, 240, 10)
      if (old) p.poof(old)
      p.tileViews.set(a.place!, copy)
      break
    }
    case "add":
    case "sub": {
      await p.stomp(g)
      const ghost = p.addBox(a.to.tiles.get(a.place!) ?? 0, p.tileViews.get(a.place!)?.position ?? p.handWorld(), "fx")
      const sign = label(o.op === "add" ? "+" : "−", 44, 0xffffff, "700")
      sign.position.set(p.room.worker.root.x + 50, p.room.worker.root.y - 200)
      p.room.fx.addChild(sign)
      await p.fly(ghost, p.handWorld(), 260, 20)
      ghost.destroy({ children: true })
      sign.destroy()
      p.setHand(a.to.hand)
      if (p.handView) p.pulse(p.handView, 0.3)
      break
    }
    case "bump+":
    case "bump-": {
      await p.stomp(g)
      p.tileViews.get(a.place!)?.destroy({ children: true })
      const nb = p.addBox(a.to.tiles.get(a.place!)!, p.room.tilePos.get(a.place!)!)
      p.tileViews.set(a.place!, nb)
      p.pulse(nb, 0.35)
      p.setHand(a.to.hand)
      break
    }
    case "visit":
    case "pass":
    case "work":
      await atDesk(st, a, o.desk)
      break
    case "say":
    case "think":
      speech.say(o.text, o.op)
      await tweenP(p.tweens, p.room.worker.root, p.ms(900), () => {})
      break
    case "boss":
      speech.bossSays(o.text)
      await tweenP(p.tweens, p.room.boss, p.ms(1000), () => {})
      break
    case "clerk": {
      const clerk = p.room.deskViews.get(o.desk)!.clerk
      speech.clerkSays(o.desk, o.text)
      await tweenP(p.tweens, clerk, p.ms(1100), (k) => (clerk.y = -Math.abs(Math.sin(k * Math.PI * 4)) * 5), ease.linear)
      break
    }
    case "hold":
      p.setHand(a.to.hand)
      if (p.handView) {
        const hv = p.handView
        await tweenP(p.tweens, hv, p.ms(260), (k) => hv.scale.set(lerp(0.3, 1, k)), ease.outBack)
      }
      break
    case "drop": {
      const hv = p.releaseHand()
      if (hv) p.poof(hv)
      p.room.worker.setArms(false)
      break
    }
    case "jump":
    case "jumpz":
    case "jumpn":
      await tweenP(p.tweens, strip.pointer, p.ms(160), () => {})
      break
    case "pause":
      // A beat: hold so the room (and the audience) can take it in.
      await tweenP(p.tweens, strip.pointer, p.ms(st.autoplay ? 1700 : 0), () => {})
      break
    default:
      break
  }
  if (a.error) {
    // The worker shakes their head; management is not pleased.
    const head = p.room.worker.head
    await tweenP(p.tweens, p.room.worker.root, p.ms(500), (k) => (head.rotation = Math.sin(k * Math.PI * 6) * 0.15 * (1 - k)), ease.linear)
    speech.bossSays(a.error, "error")
  } else syncHiddenTiles(p, a)
  st.drawStats(a.error ? a.from : a.to)
}

const takeFromInbox = async (p: Performer, a: Action) => {
  const b = p.inboxViews.shift()
  if (b) {
    await p.fly(b, p.handWorld(), 260, 40)
    b.destroy({ children: true })
  }
  p.setHand(a.to.hand)
  // Refill the visible queue and slide it up.
  const shown = a.to.inbox.slice(0, 9)
  while (p.inboxViews.length < shown.length) p.inboxViews.push(p.addBox(shown[p.inboxViews.length]!, inSlot(p.inboxViews.length + 1)))
  p.shiftBelt(p.inboxViews, inSlot, p.room.inBelt, -1)
}

const putInOutbox = async (p: Performer, a: Action) => {
  p.setHand(undefined)
  const b = p.addBox(a.from.hand!, p.handWorld())
  p.outboxViews.unshift(b)
  p.shiftBelt(p.outboxViews.slice(1), (i) => outSlot(i + 1), p.room.outBelt, 1)
  await p.fly(b, outSlot(0), 260, 40)
  if (p.outboxViews.length > 9) p.outboxViews.pop()?.destroy({ children: true })
}

/** VISIT / PASS / WORK: hand the box to a clerk and get something back. */
const atDesk = async (st: Stage, a: Action, desk: string) => {
  const p = st.p
  const d = p.room.deskPos.get(desk)!
  const clerk = p.room.deskViews.get(desk)!.clerk
  const onDesk = { x: d.x - 40, y: d.y - 26 }
  const quip = st.spec.desks?.find((x) => x.id === desk)?.says
  if (quip) {
    const q = bubbleArt(quip, 300, "left", "say")
    q.scale.set(0.8)
    q.position.set(d.x + 10, d.y - 70)
    p.room.fx.addChild(q)
    p.tweens.add({ target: q, delay: p.ms(1300), duration: p.ms(300), update: (k) => (q.alpha = 1 - k), done: () => q.destroy({ children: true }) })
  }
  const nod = () => tweenP(p.tweens, clerk, p.ms(360), (k) => {
    clerk.rotation = Math.sin(k * Math.PI * 2) * 0.12
    clerk.y = -ease.bump(k) * 10
  }, ease.linear)

  if (a.op.op === "visit" && a.to.hand !== a.from.hand) {
    // Whatever the worker held is replaced by what the clerk hands over.
    const old = p.releaseHand()
    if (old) p.poof(old)
    await nod()
    await flyAndHold(p, p.addBox(a.to.hand!, onDesk, "fx"), a.to.hand, 300, 50)
  } else if (a.from.hand !== undefined) {
    // Hand the box over, wait while the clerk looks at it, take it (or its replacement) back.
    const b = p.addBox(a.from.hand, p.handWorld(), "fx")
    p.setHand(undefined)
    await p.fly(b, onDesk, 260, 40)
    await nod()
    let back: Container = b
    if (a.op.op === "work" && a.to.hand !== a.from.hand) {
      b.destroy({ children: true })
      back = p.addBox(a.to.hand!, onDesk, "fx")
      await tweenP(p.tweens, back, p.ms(260), (k) => back.scale.set(1 + ease.bump(k) * 0.4), ease.linear)
    }
    await flyAndHold(p, back, a.to.hand)
  } else await nod()
}

const flyAndHold = async (p: Performer, box: Container, value: Value | undefined, dur = 260, arc = 40) => {
  await p.fly(box, p.handWorld(), dur, arc)
  box.destroy({ children: true })
  p.setHand(value)
}

/** Tiles changed behind the worker's back (a hidden side effect) swap silently. */
const syncHiddenTiles = (p: Performer, a: Action) => {
  a.to.tiles.forEach((val, id) => {
    const shown = p.tileViews.get(id) as (Container & { lfValue?: Value }) | undefined
    const at = p.room.tilePos.get(id)
    if (!at || val === undefined || shown?.lfValue === val) return
    if (shown && a.from.tiles.get(id) === val) return
    shown?.destroy({ children: true })
    const b = boxArt(val) as Container & { lfValue?: Value }
    b.lfValue = val
    b.position.copyFrom(at)
    p.room.items.addChild(b)
    p.tileViews.set(id, b)
  })
}

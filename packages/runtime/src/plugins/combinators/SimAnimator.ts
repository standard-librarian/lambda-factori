/**
 * How the simulation looks. Turns `Sim` events into motion on the floor:
 * - sources slam their stamps and emit a token;
 * - tokens ride the wires, interpolated between ticks;
 * - apply castles clamp, and the produced term floats above them;
 * - absorbed tokens shrink into ports;
 * - bins count, bounce, tick or shake.
 * It also runs the idle life of the floor (bobbing icons, chimney smoke). It
 * reads the board through `BoardView` and never changes it.
 */
import type { Container } from "pixi.js"
import type { Board, PortName } from "@lambda-factori/core/Board.ts"
import { colorOf } from "@lambda-factori/core/Catalogue.ts"
import { labelFor, type Sim, type SimEvent, type Token } from "@lambda-factori/core/Sim.ts"
import type { Term } from "@lambda-factori/core/Term.ts"
import type { BoardView, BuildingView } from "./BoardView.ts"
import { ring } from "./effects.ts"
import { H, tokenArt, W } from "../../ui/factoryArt.ts"
import { center, portDot } from "./floorGeometry.ts"
import { label, relabel } from "../../ui/label.ts"
import { palette } from "../../ui/theme.ts"
import { ease, lerp, type Tweens } from "@lambda-factori/kernel/tween.ts"

export class SimAnimator {
  private readonly tokenViews = new Map<number, Container>()
  /** Tokens mid-absorption: the sim has dropped them, but their shrink tween still owns the view. */
  private readonly absorbing = new Set<number>()
  private readonly floor: BoardView
  private readonly tweens: Tweens
  private readonly board: () => Board
  private readonly onTokenTap: (term: Term) => void

  constructor(o: { floor: BoardView; tweens: Tweens; board: () => Board; onTokenTap: (term: Term) => void }) {
    this.floor = o.floor
    this.tweens = o.tweens
    this.board = o.board
    this.onTokenTap = o.onTokenTap
  }

  /** Clear every token and preview (the simulation was stopped). */
  reset() {
    for (const v of this.tokenViews.values()) v.destroy({ children: true })
    this.tokenViews.clear()
    this.absorbing.clear()
    for (const v of this.floor.views.values()) {
      v.preview?.destroy({ children: true })
      v.preview = undefined
    }
    this.floor.resetBins()
  }

  /** Place every token on its wire, `alpha` (0…1) of the way through the current tick. */
  syncTokens(sim: Sim | undefined, alpha: number) {
    const seen = new Set<number>()
    for (const { wire, token } of sim?.tokens() ?? []) {
      seen.add(token.id)
      const v = this.tokenViews.get(token.id) ?? this.createToken(token)
      const pts = wire.path.map(center)
      const src = this.board().buildings.find((b) => b.id === wire.from)!
      const a = token.prevIdx < 0 ? portDot(src, "out") : pts[token.prevIdx]!
      const b = pts[token.idx]!
      v.position.set(lerp(a.x, b.x, alpha), lerp(a.y, b.y, alpha))
    }
    for (const [id, v] of this.tokenViews) {
      if (seen.has(id) || this.absorbing.has(id)) continue
      v.destroy({ children: true })
      this.tokenViews.delete(id)
    }
  }

  /** Bob icons and, while running, puff smoke now and then. */
  idle(dt: number, running: boolean) {
    for (const v of this.floor.views.values()) {
      if (!v.art) continue
      v.idle += dt
      v.art.icon.y = v.art.iconY + Math.sin(v.idle / 420) * 2
      if (running && Math.random() < dt / 1800) this.puff(v, 7)
    }
  }

  /** Animate one simulation event (`Complete` is the scene's business, not the floor's). */
  event(e: SimEvent, tickMs: number) {
    if (e._tag === "Absorb") return this.absorb(e.token, e.building, e.port, tickMs)
    const v = "building" in e ? this.floor.views.get(e.building) : undefined
    if (!v) return
    if (v.art) {
      if (e._tag === "Emit") this.emit(v, tickMs)
      else if (e._tag === "ApplyStart") this.clamp(v, tickMs)
      else if (e._tag === "Produced") this.produced(v, e.term)
    }
    if (v.bin) {
      if (e._tag === "Accepted") this.accepted(v, e.count, e.quota)
      else if (e._tag === "Rejected") this.rejected(v)
    }
  }

  private createToken(token: Token) {
    const v = tokenArt(token.label, token.color)
    v.scale.set(0.4)
    v.eventMode = "static"
    v.cursor = "help"
    // Tokens move every frame, so a tap (down + up on the same spot) is unreliable; open on press.
    v.on("pointerdown", (ev) => {
      ev.stopPropagation()
      this.onTokenTap(token.term)
    })
    this.floor.tokenLayer.addChild(v)
    this.tokenViews.set(token.id, v)
    this.tweens.add({ target: v, duration: 260, ease: ease.outBack, update: (k) => v.scale.set(lerp(0.4, 1, k)) })
    return v
  }

  private puff(v: BuildingView, size: number, color = v.building.kind === "apply" ? 0xd9707b : colorOf(v.building.atom ?? "").color) {
    this.floor.smoke.puff(v.root.x + v.art!.chimney.x, v.root.y + v.art!.chimney.y, color, size)
  }

  private emit(v: BuildingView, tickMs: number) {
    const dot = portDot(v.building, "out")
    ring(this.floor.fxLayer, this.tweens, dot.x, dot.y, palette.portOut, 10)
    if (v.building.kind === "source") {
      // The stamp slams down, then springs back up.
      const stamp = v.art!.icon.children.slice(1)
      this.tweens.add({ duration: Math.min(360, tickMs * 1.4), ease: ease.linear, update: (k) => {
        const push = k < 0.3 ? ease.inCubic(k / 0.3) : 1 - ease.outBack((k - 0.3) / 0.7)
        for (const c of stamp) c.y = push * 12
      } })
      this.puff(v, 8)
    }
    if (v.preview) {
      const p = v.preview
      v.preview = undefined
      this.tweens.add({ target: p, duration: 200, update: (k) => { p.alpha = 1 - k; p.scale.set(0.8 * (1 - k)) }, done: () => p.destroy({ children: true }) })
    }
  }

  private absorb(token: Token, building: number, port: PortName, tickMs: number) {
    const v = this.tokenViews.get(token.id)
    const b = this.floor.views.get(building)
    if (!v || !b) return
    this.absorbing.add(token.id)
    const from = { x: v.x, y: v.y }
    const to = portDot(b.building, port)
    this.tweens.add({ target: v, duration: tickMs * 0.9, ease: ease.inCubic, update: (k) => {
      v.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k))
      v.scale.set(1 - k * 0.8)
    }, done: () => {
      this.absorbing.delete(token.id)
      ring(this.floor.fxLayer, this.tweens, to.x, to.y, palette.portIn, 9)
    } })
  }

  /** The apply castle's clamp squeezes its two inputs together. */
  private clamp(v: BuildingView, tickMs: number) {
    const art = v.art!
    const left = art.icon.getChildByLabel("left")!
    const right = art.icon.getChildByLabel("right")!
    this.tweens.add({ duration: Math.max(200, tickMs * 1.8), ease: ease.linear, update: (k) => {
      const s = ease.bump(k)
      left.x = -8 + s * 6
      right.x = 8 - s * 6
      art.body.scale.set(1 + s * 0.06, 1 - s * 0.08)
    } })
    this.puff(v, 9, 0xd9707b)
  }

  private produced(v: BuildingView, term: Term) {
    const { label: text, color } = labelFor(term)
    const p = tokenArt(text, color)
    p.position.set(v.root.x + 20, v.root.y - 16)
    p.scale.set(0)
    this.floor.fxLayer.addChild(p)
    v.preview?.destroy({ children: true })
    v.preview = p
    this.tweens.add({ target: p, duration: 300, ease: ease.outBack, update: (k) => p.scale.set(0.8 * k) })
  }

  private accepted(v: BuildingView, count: number, quota: number) {
    const bin = v.bin!
    relabel(bin.counter, `${Math.min(count, quota)}/${quota}`)
    this.tweens.add({ duration: 320, ease: ease.linear, update: (k) => {
      bin.bubble.scale.set(1 + ease.bump(k) * 0.35)
      bin.box.scale.set(1 + ease.bump(k) * 0.06)
    } })
    ring(this.floor.fxLayer, this.tweens, v.root.x + W / 2, v.root.y + H / 2, palette.bin, 40)
    if (count === quota) this.tweens.add({ duration: 420, ease: ease.outBack, update: (k) => bin.check.scale.set(k) })
  }

  private rejected(v: BuildingView) {
    const bin = v.bin!
    this.tweens.add({ duration: 360, ease: ease.linear, update: (k) => (bin.box.x = W / 2 + Math.sin(k * Math.PI * 6) * 8 * (1 - k)) })
    ring(this.floor.fxLayer, this.tweens, v.root.x + W / 2, v.root.y + H / 2, palette.bad, 30)
    const x = label("✗", 30, palette.bad, "700")
    x.position.set(v.root.x + W / 2, v.root.y + H + 10)
    this.floor.fxLayer.addChild(x)
    this.tweens.add({ duration: 700, update: (k) => { x.y = v.root.y + H + 10 - k * 30; x.alpha = 1 - k }, done: () => x.destroy() })
  }
}

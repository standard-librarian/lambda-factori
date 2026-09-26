import { type Application, Container, Graphics } from "pixi.js"
import type { GameEvent } from "../game/Events.ts"
import type { Scene } from "../render/Scene.ts"
import { DESIGN_H, DESIGN_W, palette } from "../render/theme.ts"
import { Tweens } from "../render/tween.ts"
import { Toasts } from "../render/ui.ts"
import { HomeScene } from "./HomeScene.ts"
import { OpenScene } from "./OpenScene.ts"
import type { HostApi, Plugin, Services } from "./Plugin.ts"
import { builtins } from "./registry.ts"

/** Idle heartbeat: even a static scene is redrawn this often, to catch untweened changes. */
const IDLE_FRAME_MS = 250

const segments = (hash: string) =>
  hash.replace(/^#\/?/, "").split("/").filter((s) => s.length > 0).map(decodeURIComponent)

/**
 * Owns the Pixi stage: a fixed 1920×1080 design surface letterboxed into the
 * window, one scene at a time with cross-fades, keyboard dispatch and a hash
 * router that lazily loads whichever plugin owns the route.
 */
export class Host implements HostApi {
  readonly tweens = new Tweens()
  readonly app: Application
  readonly services: Services
  private readonly root = new Container()
  private readonly fade = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(palette.paper)
  private readonly toasts: Toasts
  private readonly bars = new Graphics()
  private scene: Scene | undefined
  private readonly plugins = new Map<string, Promise<Plugin>>()
  private ignoreHash: string | undefined
  /** Set by input and by anything that changes the stage outside a tween; cleared on render. */
  private dirty = true

  constructor(app: Application, services: Services) {
    this.app = app
    this.services = services
    this.fade.alpha = 0
    this.fade.eventMode = "none"
    this.toasts = new Toasts(this.tweens)
    this.toasts.position.set(DESIGN_W / 2, 70)
    this.toasts.eventMode = "none"
    // Letterbox bars cover anything drawn outside the design surface. (Cheaper than
    // masking the root, which costs a stencil pass on every frame.)
    this.bars.eventMode = "none"
    app.stage.addChild(this.root, this.bars)
    this.root.addChild(this.fade, this.toasts)
    this.layout()
    app.renderer.on("resize", () => this.layout())
    // Render on demand: a static slide or menu costs no GPU time. A frame is drawn while
    // tweens run, while the scene animates, after input or resize, and as an idle heartbeat.
    app.ticker.remove(app.render, app)
    const wake = () => (this.dirty = true)
    for (const type of ["pointermove", "pointerdown", "pointerup", "wheel"] as const) app.canvas.addEventListener(type, wake, { passive: true })
    window.addEventListener("keydown", wake)
    app.renderer.on("resize", wake)
    let idle = 0
    app.ticker.add((t) => {
      const dt = Math.min(t.deltaMS, 100)
      const moving = this.tweens.active
      this.tweens.tick(dt)
      this.scene?.tick?.(dt)
      idle += t.deltaMS
      const animating = this.scene?.animating ? this.scene.animating() : this.scene?.tick !== undefined
      if (moving || animating || this.dirty || this.tweens.active || idle >= IDLE_FRAME_MS) {
        this.dirty = false
        idle = 0
        app.render()
        if (import.meta.env.DEV) (globalThis as { lfFrames?: number }).lfFrames = ((globalThis as { lfFrames?: number }).lfFrames ?? 0) + 1
      }
    })
    window.addEventListener("keydown", (e) => {
      // Typing in an editor overlay must never drive the scene underneath.
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return
      this.scene?.onKey?.(e)
    })
    window.addEventListener("hashchange", () => {
      if (this.ignoreHash === location.hash) {
        this.ignoreHash = undefined
        return
      }
      void this.route()
    })
    void this.route()
  }

  private layout() {
    const { width, height } = this.app.screen
    const s = Math.min(width / DESIGN_W, height / DESIGN_H)
    const x = (width - DESIGN_W * s) / 2
    const y = (height - DESIGN_H * s) / 2
    this.root.scale.set(s)
    this.root.position.set(x, y)
    this.bars.clear()
    if (x > 0) this.bars.rect(0, 0, x + 1, height).rect(width - x - 1, 0, x + 1, height)
    if (y > 0) this.bars.rect(0, 0, width, y + 1).rect(0, height - y - 1, width, y + 1)
    this.bars.fill(palette.paper)
  }

  show(make: () => Scene) {
    const swap = () => {
      if (!this.scene) performance.mark("lf:first-scene")
      this.scene?.destroy()
      this.tweens.clear()
      this.scene = make()
      this.root.addChildAt(this.scene.view, 0)
      this.tweens.add({ duration: 220, update: (k) => (this.fade.alpha = 1 - k) })
    }
    if (!this.scene) return swap()
    this.tweens.add({ duration: 160, update: (k) => (this.fade.alpha = k), done: swap })
  }

  onEvent(e: GameEvent) {
    this.scene?.onEvent?.(e)
  }

  toast(text: string) {
    this.toasts.show(text)
  }

  home = () => this.navigate("")

  navigate(route: string) {
    const hash = `#/${route}`
    if (location.hash === hash) void this.route()
    else location.hash = hash
  }

  replaceRoute(route: string) {
    const hash = `#/${route}`
    if (location.hash === hash) return
    this.ignoreHash = hash
    history.replaceState(null, "", hash)
    this.ignoreHash = undefined
  }

  private plugin(id: string): Promise<Plugin> | undefined {
    const cached = this.plugins.get(id)
    if (cached) return cached
    const entry = builtins.find((b) => b.id === id)
    if (!entry) return undefined
    const loading = entry.load()
    this.plugins.set(id, loading)
    return loading
  }

  private async route() {
    const [id, ...rest] = segments(location.hash)
    if (id === undefined) {
      this.show(() => new HomeScene(this))
      return
    }
    try {
      if (id === "import" && rest[0]) {
        const url = rest.join("/")
        this.show(() => new OpenScene(this, url, "url"))
        return
      }
      if (id === "open" && rest[0]) {
        const payload = rest[0]
        this.show(() => new OpenScene(this, payload))
        return
      }
      if (id === "plugin" && rest[0]) {
        // A third-party plugin: an ES module whose default export is a Plugin.
        const mod = (await import(/* @vite-ignore */ rest[0])) as { default: Plugin }
        await mod.default.open(this, rest.slice(1))
        return
      }
      const loading = this.plugin(id)
      if (!loading) {
        this.toast(`no plugin called “${id}”`)
        this.show(() => new HomeScene(this))
        return
      }
      await (await loading).open(this, rest)
    } catch (e) {
      console.error(e)
      this.toast(`couldn't open ${id}: ${e instanceof Error ? e.message : String(e)}`)
      if (!this.scene) this.show(() => new HomeScene(this))
    }
  }
}

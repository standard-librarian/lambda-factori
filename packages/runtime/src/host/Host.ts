import { type Application, Container, Graphics, Rectangle, Text } from "pixi.js"
import type { HostApi, PixiKit, Plugin, PluginEntry, SharedPack } from "@lambda-factori/kernel/Plugin.ts"
import type { Scene } from "@lambda-factori/kernel/Scene.ts"
import type { Mechanic } from "@lambda-factori/kernel/Slide.ts"
import { Tweens } from "@lambda-factori/kernel/tween.ts"
import { DESIGN_H, DESIGN_W, palette } from "../ui/theme.ts"
import { Toasts } from "../ui/Toasts.ts"
import { countDevFrame } from "../platform/devHooks.ts"
import { HomeScene } from "./HomeScene.ts"
import { OpenScene } from "./OpenScene.ts"
import { perfProbe } from "./perfProbe.ts"
import { parseMechanicKind, parseRoute, shadowsBuiltin } from "./routes.ts"
import { copyShareLink } from "./share.ts"

/** Idle heartbeat: even a static scene is redrawn this often, to catch untweened changes. */
const IDLE_FRAME_MS = 250

/**
 * Owns the Pixi stage: a fixed 1920×1080 design surface letterboxed into the
 * window, one scene at a time with cross-fades, keyboard dispatch and a hash
 * router that lazily loads whichever plugin owns the route.
 */
export class Host implements HostApi {
  readonly tweens = new Tweens()
  readonly app: Application
  /** Handed to every plugin as `host.pixi`: the host's own Pixi constructors, so a third-party
   * plugin (which can only `import type` from pixi.js) builds objects without a second copy. */
  readonly pixi: PixiKit = { Container, Graphics, Text, Rectangle }
  /** Every configured plugin (built-in and third-party): not part of `HostApi` (a plugin never
   * sees another plugin's manifest), only handed to the host's own screens (`HomeScene`,
   * `OpenScene`) that need the whole table. */
  private readonly entries: ReadonlyArray<PluginEntry>
  private readonly root = new Container()
  private readonly fade = new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill(palette.paper)
  private readonly toasts: Toasts
  private readonly bars = new Graphics()
  private scene: Scene | undefined
  /** Loaded plugins, by id: every configured entry plus any third-party plugin opened by URL. */
  private readonly plugins = new Map<string, Promise<Plugin>>()
  private ignoreHash: string | undefined
  /** Set by input and by anything that changes the stage outside a tween; cleared on render. */
  private dirty = true

  constructor(app: Application, entries: ReadonlyArray<PluginEntry>) {
    this.app = app
    this.entries = entries
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
    const probe = perfProbe()
    app.ticker.add((t) => {
      const dt = Math.min(t.deltaMS, 100)
      const moving = this.tweens.active
      this.tweens.tick(dt)
      this.scene?.tick?.(dt)
      idle += t.deltaMS
      const animating = this.scene?.animating ? this.scene.animating() : this.scene?.tick !== undefined
      const render = moving || animating || this.dirty || this.tweens.active || idle >= IDLE_FRAME_MS
      probe?.frame(render)
      if (render) {
        this.dirty = false
        idle = 0
        app.render()
        countDevFrame()
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

  share(pack: SharedPack): Promise<string> {
    return copyShareLink(pack)
  }

  async mechanics(kinds: ReadonlyArray<string>): Promise<ReadonlyMap<string, Mechanic>> {
    const map = new Map<string, Mechanic>()
    for (const kind of new Set(kinds)) {
      const parsed = parseMechanicKind(kind)
      if (!parsed) continue
      const loading = this.plugin(parsed.id)
      if (!loading) throw new Error(`no plugin provides slide kind “${kind}”`)
      const plugin = await loading
      const m = plugin.mechanics?.[parsed.name]
      if (!m) throw new Error(`plugin “${parsed.id}” has no mechanic “${parsed.name}”`)
      map.set(kind, m)
    }
    return map
  }

  private plugin(id: string): Promise<Plugin> | undefined {
    const cached = this.plugins.get(id)
    if (cached) return cached
    const entry = this.entries.find((b) => b.id === id)
    if (!entry) return undefined
    const loading = entry.load()
    this.plugins.set(id, loading)
    return loading
  }

  private async route() {
    const parsed = parseRoute(location.hash)
    // Named per route shape, for the catch block's toast: the plugin id or third-party URL the
    // user tried to open (home and pack links never fail this way, but need a label too).
    const label = parsed._tag === "Plugin" ? parsed.id : parsed._tag === "ThirdParty" ? parsed.url : parsed._tag.toLowerCase()
    try {
      switch (parsed._tag) {
        case "Home":
          this.show(() => new HomeScene(this, this.entries))
          return
        case "Import":
          this.show(() => new OpenScene(this, this.entries, parsed.url, "url"))
          return
        case "Open":
          this.show(() => new OpenScene(this, this.entries, parsed.payload))
          return
        case "ThirdParty": {
          // A third-party plugin: an ES module whose default export is a Plugin. It joins the
          // same table as the built-ins, so a deck can also resolve mechanics from it — but it
          // must never claim a built-in's id and silently replace it.
          const mod = (await import(/* @vite-ignore */ parsed.url)) as { default: Plugin }
          if (shadowsBuiltin(this.entries, mod.default.id)) {
            this.toast(`can't load a plugin from a URL: “${mod.default.id}” is already a built-in plugin`)
            if (!this.scene) this.show(() => new HomeScene(this, this.entries))
            return
          }
          this.plugins.set(mod.default.id, Promise.resolve(mod.default))
          await mod.default.open?.(this, parsed.path)
          return
        }
        case "Plugin": {
          const loading = this.plugin(parsed.id)
          const plugin = loading && (await loading)
          if (!plugin?.open) {
            this.toast(`no plugin called “${parsed.id}”`)
            this.show(() => new HomeScene(this, this.entries))
            return
          }
          await plugin.open(this, parsed.path)
          return
        }
      }
    } catch (e) {
      console.error(e)
      this.toast(`couldn't open ${label}: ${e instanceof Error ? e.message : String(e)}`)
      if (!this.scene) this.show(() => new HomeScene(this, this.entries))
    }
  }
}

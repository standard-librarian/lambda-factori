/**
 * The plugin contract. λ factori's host knows nothing about combinators or
 * slides: everything the user can open (the combinator game, the level
 * editor, a slide deck) is a plugin, loaded lazily at runtime and addressed by
 * a hash route `#/<plugin>/<path…>`. A plugin declares its own port — the
 * capabilities it needs from the composition root (`apps/web/src/plugins.ts`)
 * — instead of sharing one fat interface with every other plugin.
 */
import type { Application } from "pixi.js"
import type { Scene } from "./Scene.ts"
import type { Mechanic } from "./Slide.ts"
import type { Tweens } from "./tween.ts"

/** A pack shared as a `#/open/<payload>` link: a deck, or a level pack. */
export interface SharedPack {
  readonly type: "deck" | "levels"
  readonly data: unknown
}

export interface HostApi {
  readonly app: Application
  readonly tweens: Tweens
  /** Replace the current scene (cross-fades). */
  show(make: () => Scene): void
  /** Navigate to a route; opens the owning plugin. */
  navigate(route: string): void
  /** Update the address bar without re-opening anything (e.g. slide number). */
  replaceRoute(route: string): void
  home(): void
  toast(text: string): void
  /** Copy a share link for `pack` to the clipboard, and return it. */
  share(pack: SharedPack): Promise<string>
  /** Resolve plugin slide kinds ("<plugin>/<mechanic>"), loading their plugins first. Throws a readable error for an unknown kind. */
  mechanics(kinds: ReadonlyArray<string>): Promise<ReadonlyMap<string, Mechanic>>
}

export interface PluginManifest {
  readonly id: string
  readonly title: string
  readonly subtitle: string
  /** A `library` plugin contributes mechanics but has no route and no home-screen card (e.g. `office`). */
  readonly kind: "game" | "tool" | "deck" | "library"
  readonly color: number
  readonly shade: number
}

export interface Plugin extends PluginManifest {
  /** Open the plugin at `path` (the route segments after its id). Omitted by `library` plugins, which have no route. */
  open?(host: HostApi, path: ReadonlyArray<string>): void | Promise<void>
  /** Slide kinds this plugin lends the deck, keyed by name (the deck slide kind is "<id>/<name>"). */
  readonly mechanics?: Readonly<Record<string, Mechanic>>
}

export interface PluginEntry extends PluginManifest {
  readonly load: () => Promise<Plugin>
}

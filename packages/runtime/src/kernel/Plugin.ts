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

/** A pack shared as a `#/open/<payload>` link: a deck, a level pack, or any future pack type a
 * plugin declares in `packTypes`. The host never enumerates the possible types itself; it only
 * matches this string against a plugin's `packTypes` to find who can preview it. */
export interface SharedPack {
  readonly type: string
  readonly data: unknown
}

export interface HostApi {
  readonly app: Application
  readonly tweens: Tweens
  /** Every configured plugin (built-in and third-party), for the home screen and the
   * shared-pack card. The host reads only the generic `PluginEntry` shape here — never a
   * concrete plugin by name. */
  readonly entries: ReadonlyArray<PluginEntry>
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
  /** `SharedPack.type` values this plugin can decode, describe and import (e.g. the deck plugin
   * → `["deck"]`, combinators → `["levels"]`). Omitted by plugins that share nothing. */
  readonly packTypes?: ReadonlyArray<string>
}

/** A card for something a plugin lends the home screen (e.g. one of the deck plugin's decks),
 * shaped like the tool/community cards it sits alongside. */
export interface ShelfCard {
  readonly title: string
  readonly subtitle: string
  readonly color: number
  readonly shade: number
  readonly tag: string
  readonly route: string
}

/** One action `OpenScene` offers on a shared-pack card (e.g. "play now"). `tone` picks the
 * button's colour from the host's own palette, so a plugin never has to import it. */
export interface PackPreviewAction {
  readonly text: string
  readonly tone: "primary" | "secondary"
  run(): void
}

/** What a plugin shows for a shared pack of one of its `packTypes`, on `OpenScene`'s card. */
export interface PackPreview {
  readonly title: string
  readonly subtitle: string
  readonly meta: string
  readonly actions: ReadonlyArray<PackPreviewAction>
}

export interface Plugin extends PluginManifest {
  /** Open the plugin at `path` (the route segments after its id). Omitted by `library` plugins, which have no route. */
  open?(host: HostApi, path: ReadonlyArray<string>): void | Promise<void>
  /** Slide kinds this plugin lends the deck, keyed by name (the deck slide kind is "<id>/<name>"). */
  readonly mechanics?: Readonly<Record<string, Mechanic>>
  /** Decode and describe a shared pack of type `type` (one of this plugin's `packTypes`). Throw
   * with a readable message on bad data; `OpenScene` shows it as "this pack doesn't match the
   * format". */
  previewPack?(type: string, data: unknown, host: HostApi): PackPreview
}

export interface PluginEntry extends PluginManifest {
  readonly load: () => Promise<Plugin>
  /** Cards for the home screen's shelf row, without loading the plugin's own chunk (e.g. the
   * deck plugin lists its decks from `DeckLibrary.list` alone). */
  shelf?(): Promise<ReadonlyArray<ShelfCard>>
}

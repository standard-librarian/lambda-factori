/**
 * The plugin contract. λ factori's host knows nothing about combinators or
 * slides: everything the user can open (the combinator game, the level
 * editor, a slide deck) is a plugin, loaded lazily at runtime and addressed by
 * a hash route `#/<plugin>/<path…>`.
 */
import type { Application } from "pixi.js"
import type { Board } from "@lambda-factori/core/Board.ts"
import type { Level, LevelPack } from "@lambda-factori/core/Level.ts"
import type { GameEvent } from "../game/Events.ts"
import type { SaveData } from "../game/Progress.ts"
import type { Scene } from "../render/Scene.ts"
import type { Tweens } from "../render/tween.ts"
import type { Deck, DeckMeta } from "@lambda-factori/contracts/Deck.ts"

/** Bridges from the imperative UI to the Effect services. */
export interface Services {
  readonly pack: LevelPack
  progress(): SaveData
  publish(event: GameEvent): void
  saveBoard(levelId: string, board: Board): void
  customLevels(): ReadonlyArray<Level>
  saveCustomLevel(level: Level): Promise<void>
  removeCustomLevel(id: string): Promise<void>
  decks(): Promise<ReadonlyArray<DeckMeta>>
  loadDeck(id: string): Promise<Deck>
  saveDeck(deck: Deck): Promise<void>
  resetDeck(id: string): Promise<void>
}

export interface HostApi {
  readonly app: Application
  readonly tweens: Tweens
  readonly services: Services
  /** Replace the current scene (cross-fades). */
  show(make: () => Scene): void
  /** Navigate to a route; opens the owning plugin. */
  navigate(route: string): void
  /** Update the address bar without re-opening anything (e.g. slide number). */
  replaceRoute(route: string): void
  home(): void
  toast(text: string): void
}

export interface PluginManifest {
  readonly id: string
  readonly title: string
  readonly subtitle: string
  readonly kind: "game" | "tool" | "deck"
  readonly color: number
  readonly shade: number
}

export interface Plugin extends PluginManifest {
  /** Open the plugin at `path` (the route segments after its id). */
  open(host: HostApi, path: ReadonlyArray<string>): void | Promise<void>
}

export interface PluginEntry extends PluginManifest {
  readonly load: () => Promise<Plugin>
}

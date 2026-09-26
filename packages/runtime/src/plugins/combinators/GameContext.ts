/**
 * The combinator game's own window onto the host: everything a `LevelScene`,
 * `MenuScene` or `BookScene` needs (the pack, progress, saving a board,
 * navigating between the game's own screens) without reaching into `HostApi`
 * or any other plugin's internals.
 */
import type { Application } from "pixi.js"
import type { Board } from "@lambda-factori/core/Board.ts"
import type { LevelPack } from "@lambda-factori/core/Level.ts"
import type { GameEvent } from "../../game/Events.ts"
import type { SaveData } from "../../game/Progress.ts"
import type { Tweens } from "../../kernel/tween.ts"

export interface GameContext {
  readonly app: Application
  readonly tweens: Tweens
  readonly pack: LevelPack
  progress(): SaveData
  publish(event: GameEvent): void
  saveBoard(levelId: string, board: Board): void
  /** Subscribe to game events; call the returned function to unsubscribe. */
  subscribe(fn: (event: GameEvent) => void): () => void
  menu(): void
  play(levelId: string): void
  book(page?: "recipes" | "stickers" | "papers"): void
  home(): void
  editor(levelId?: string): void
}

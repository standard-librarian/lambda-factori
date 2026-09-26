import type { Application, Container } from "pixi.js"
import type { Board } from "../core/Board.ts"
import type { LevelPack } from "../core/Level.ts"
import type { GameEvent } from "../game/Events.ts"
import type { SaveData } from "../game/Progress.ts"
import type { Tweens } from "./tween.ts"

/** The imperative UI's window onto the Effect services. */
export interface GameContext {
  readonly app: Application
  readonly tweens: Tweens
  readonly pack: LevelPack
  progress(): SaveData
  publish(event: GameEvent): void
  saveBoard(levelId: string, board: Board): void
  menu(): void
  play(levelId: string): void
  book(page?: "recipes" | "stickers" | "papers"): void
  home(): void
  editor(levelId?: string): void
}

export interface Scene {
  readonly view: Container
  tick?(dtMs: number): void
  /**
   * Whether the scene is moving on its own and needs a frame every tick. The host
   * renders on demand; scenes with a `tick` count as always moving unless they say otherwise.
   */
  animating?(): boolean
  onEvent?(event: GameEvent): void
  onKey?(event: KeyboardEvent): void
  destroy(): void
}

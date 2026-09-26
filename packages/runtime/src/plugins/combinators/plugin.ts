/**
 * The `combinators` plugin: the combinator factory game itself. Its port
 * (`CombinatorsPort`) is what `apps/web/src/plugins.ts` must supply — the
 * level pack, progress, saving a board, and a way to subscribe to game
 * events — everything the game's scenes need but no other plugin should.
 */
import type { Board } from "@lambda-factori/core/Board.ts"
import type { Level, LevelPack } from "@lambda-factori/core/Level.ts"
import type { GameEvent } from "../../game/Events.ts"
import type { SaveData } from "../../game/Progress.ts"
import type { HostApi, Plugin } from "../../kernel/Plugin.ts"
import { BookScene } from "../../render/BookScene.ts"
import { LevelScene } from "../../render/LevelScene.ts"
import { MenuScene } from "../../render/MenuScene.ts"
import type { GameContext } from "./GameContext.ts"
import { manifest } from "./manifest.ts"

export interface CombinatorsPort {
  readonly pack: LevelPack
  progress(): SaveData
  publish(event: GameEvent): void
  saveBoard(levelId: string, board: Board): void
  customLevels(): ReadonlyArray<Level>
  /** Subscribe to game events; call the returned function to unsubscribe. */
  subscribe(fn: (event: GameEvent) => void): () => void
}

export const CUSTOM_WORLD = { id: "custom", title: "your levels", subtitle: "made in the level editor" }

/** The built-in pack plus whatever the level editor has saved, as one pack. */
const packWithCustom = (port: CombinatorsPort): LevelPack => {
  const custom = port.customLevels()
  const base = port.pack
  if (custom.length === 0) return base
  const ids = new Set(base.levels.map((l) => l.id))
  return {
    ...base,
    worlds: [...base.worlds, CUSTOM_WORLD],
    levels: [...base.levels, ...custom.filter((l) => !ids.has(l.id)).map((l) => ({ ...l, world: CUSTOM_WORLD.id }) as typeof l)]
  }
}

/** The combinator game's view of the host. `returnTo` sends "menu" back to the editor after a playtest. */
class CombinatorApp implements GameContext {
  readonly app
  readonly tweens
  readonly pack: LevelPack
  private readonly host: HostApi
  private readonly port: CombinatorsPort
  private readonly returnTo: string | undefined

  constructor(host: HostApi, port: CombinatorsPort, returnTo?: string) {
    this.host = host
    this.port = port
    this.app = host.app
    this.tweens = host.tweens
    this.pack = packWithCustom(port)
    this.returnTo = returnTo
  }

  progress = () => this.port.progress()
  publish = (e: GameEvent) => this.port.publish(e)
  saveBoard = (id: string, board: Board) => this.port.saveBoard(id, board)
  subscribe = (fn: (e: GameEvent) => void) => this.port.subscribe(fn)
  menu = () => this.host.navigate(this.returnTo ?? "combinators")
  play = (id: string) => this.host.navigate(`combinators/level/${encodeURIComponent(id)}`)
  book = (page: "recipes" | "stickers" | "papers" = "recipes") => this.host.navigate(`combinators/book/${page}`)
  home = () => this.host.home()
  editor = (levelId?: string) => this.host.navigate(levelId ? `editor/${encodeURIComponent(levelId)}` : "editor")
}

export const plugin = (port: CombinatorsPort): Plugin => ({
  ...manifest,
  open(host, path) {
    const [what, arg] = path
    const test = what === "test"
    const ctx = new CombinatorApp(host, port, test ? "editor" : undefined)
    if ((what === "level" || test) && arg) {
      const level = ctx.pack.levels.find((l) => l.id === arg)
      if (!level) {
        host.toast(`no level “${arg}”`)
        return host.navigate("combinators")
      }
      return host.show(() => new LevelScene(ctx, level))
    }
    if (what === "book") {
      const page = arg === "stickers" || arg === "papers" ? arg : "recipes"
      return host.show(() => new BookScene(ctx, page))
    }
    host.show(() => new MenuScene(ctx))
  }
})

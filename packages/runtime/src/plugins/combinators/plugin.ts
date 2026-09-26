/**
 * The `combinators` plugin: the combinator factory game itself. Its port
 * (`CombinatorsPort`) is what `apps/web/src/plugins.ts` must supply — the
 * level pack, progress, saving a board, and a way to subscribe to game
 * events — everything the game's scenes need but no other plugin should.
 * It also owns `packTypes: ["levels"]`: a shared level pack is decoded and
 * described here (`previewPack`), not by the host. It lends the deck one slide
 * mechanic, `combinators/theater` (see `mechanics.ts`), an inline reduction theater.
 */
import { Exit, Schema } from "effect"
import type { Board } from "@lambda-factori/core/Board.ts"
import { Level, type LevelPack } from "@lambda-factori/core/Level.ts"
import type { GameEvent } from "../../game/Events.ts"
import type { SaveData } from "../../game/Progress.ts"
import type { HostApi, PackPreview, Plugin } from "../../kernel/Plugin.ts"
import { BookScene } from "./BookScene.ts"
import { LevelScene } from "./LevelScene.ts"
import { MenuScene } from "./MenuScene.ts"
import type { GameContext } from "./GameContext.ts"
import { manifest } from "./manifest.ts"
import { mechanics } from "./mechanics.ts"

export interface CombinatorsPort {
  readonly pack: LevelPack
  progress(): SaveData
  publish(event: GameEvent): void
  saveBoard(levelId: string, board: Board): void
  customLevels(): ReadonlyArray<Level>
  /** Subscribe to game events; call the returned function to unsubscribe. */
  subscribe(fn: (event: GameEvent) => void): () => void
  /** Save a level into the custom world (a shared level pack lands here before it's playable). */
  saveCustomLevel(level: Level): Promise<void>
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

const decodeLevels = Schema.decodeUnknownExit(Schema.Array(Level))

/** Decode a shared level pack and describe it; the actions save every level into the custom
 * world (so they show up in the pack the game and the editor both see) before navigating. */
const previewLevelsPack = (port: CombinatorsPort, data: unknown, host: HostApi): PackPreview => {
  const exit = decodeLevels(data)
  if (Exit.isFailure(exit)) throw new Error(String(exit.cause))
  const levels = exit.value
  const first = levels[0]!
  const keep = async () => {
    for (const l of levels) await port.saveCustomLevel(new Level({ ...l, world: CUSTOM_WORLD.id }))
  }
  return {
    title: levels.length === 1 ? first.title : `${levels.length} levels`,
    subtitle: first.blurb,
    meta: "a level pack",
    actions: [
      { text: "play now", tone: "primary", run: () => void keep().then(() => host.navigate(`combinators/level/${encodeURIComponent(first.id)}`)) },
      { text: "open in editor", tone: "secondary", run: () => void keep().then(() => host.navigate(`editor/${encodeURIComponent(first.id)}`)) }
    ]
  }
}

export const plugin = (port: CombinatorsPort): Plugin => ({
  ...manifest,
  mechanics,
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
  },
  previewPack: (_type, data, host) => previewLevelsPack(port, data, host)
})

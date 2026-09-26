import type { Board } from "../../core/Board.ts"
import type { LevelPack } from "../../core/Level.ts"
import type { HostApi, Plugin } from "../../engine/Plugin.ts"
import type { GameEvent } from "../../game/Events.ts"
import { BookScene } from "../../render/BookScene.ts"
import { LevelScene } from "../../render/LevelScene.ts"
import { MenuScene } from "../../render/MenuScene.ts"
import type { GameContext } from "../../render/Scene.ts"

export const CUSTOM_WORLD = { id: "custom", title: "your levels", subtitle: "made in the level editor" }

/** The built-in pack plus whatever the level editor has saved, as one pack. */
export const packWithCustom = (host: HostApi): LevelPack => {
  const custom = host.services.customLevels()
  const base = host.services.pack
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
  private readonly returnTo: string | undefined

  constructor(host: HostApi, returnTo?: string) {
    this.host = host
    this.app = host.app
    this.tweens = host.tweens
    this.pack = packWithCustom(host)
    this.returnTo = returnTo
  }

  progress = () => this.host.services.progress()
  publish = (e: GameEvent) => this.host.services.publish(e)
  saveBoard = (id: string, board: Board) => this.host.services.saveBoard(id, board)
  menu = () => this.host.navigate(this.returnTo ?? "combinators")
  play = (id: string) => this.host.navigate(`combinators/level/${encodeURIComponent(id)}`)
  book = (page: "recipes" | "stickers" | "papers" = "recipes") => this.host.navigate(`combinators/book/${page}`)
  home = () => this.host.home()
  editor = (levelId?: string) => this.host.navigate(levelId ? `editor/${encodeURIComponent(levelId)}` : "editor")
}

export const plugin: Plugin = {
  id: "combinators",
  title: "combinator factory",
  subtitle: "the λ factori game: S and K to APL",
  kind: "game",
  color: 0xac1b2b,
  shade: 0x73000b,
  open(host, path) {
    const [what, arg] = path
    const test = what === "test"
    const ctx = new CombinatorApp(host, test ? "editor" : undefined)
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
}

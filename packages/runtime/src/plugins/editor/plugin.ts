/**
 * The `editor` plugin (`#/editor/<id>`): level creation mode. A calm backdrop
 * scene under the DOM form (`form.ts`); saved levels playtest at
 * `#/combinators/test/<id>`. Its port (`LevelLibrary`) is the built-in level
 * pack plus the custom levels made in this browser.
 */
import { Container } from "pixi.js"
import type { Level, LevelPack } from "@lambda-factori/core/Level.ts"
import type { HostApi, Plugin } from "@lambda-factori/kernel/Plugin.ts"
import type { Scene } from "@lambda-factori/kernel/Scene.ts"
import { paperArt, skylineArt } from "../../ui/backdrop.ts"
import { label } from "../../ui/label.ts"
import { DESIGN_H, DESIGN_W, palette } from "../../ui/theme.ts"
import { mountLevelForm } from "./form.ts"
import { manifest } from "./manifest.ts"

export interface LevelLibrary {
  readonly pack: LevelPack
  customLevels(): ReadonlyArray<Level>
  saveCustomLevel(level: Level): Promise<void>
  removeCustomLevel(id: string): Promise<void>
}

class EditorScene implements Scene {
  readonly view = new Container()
  private readonly dispose: () => void

  constructor(host: HostApi, library: LevelLibrary, initial: string | undefined) {
    this.view.addChild(paperArt(DESIGN_W, DESIGN_H), skylineArt(DESIGN_W, DESIGN_H - 10))
    const t = label("level editor", 72, palette.ink, "700", "left")
    t.position.set(120, 120)
    const sub = label("sources, bins and goals · playtest instantly", 30, palette.inkSoft, "500", "left")
    sub.position.set(124, 190)
    this.view.addChild(t, sub)
    this.dispose = mountLevelForm(host, library, initial)
  }

  destroy() {
    this.dispose()
    this.view.destroy({ children: true })
  }
}

export const plugin = (library: LevelLibrary): Plugin => ({
  ...manifest,
  open(host, path) {
    host.show(() => new EditorScene(host, library, path[0]))
  }
})

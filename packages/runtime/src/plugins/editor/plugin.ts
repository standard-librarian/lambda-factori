/**
 * The `editor` plugin (`#/editor/<id>`): level creation mode. A calm backdrop
 * scene under the DOM form (`form.ts`); saved levels playtest at
 * `#/combinators/test/<id>`.
 */
import { Container } from "pixi.js"
import type { HostApi, Plugin } from "../../kernel/Plugin.ts"
import type { Scene } from "../../kernel/Scene.ts"
import { paperArt, skylineArt } from "../../render/backdrop.ts"
import { label } from "../../render/label.ts"
import { DESIGN_H, DESIGN_W, palette } from "../../render/theme.ts"
import { mountLevelForm } from "./form.ts"

class EditorScene implements Scene {
  readonly view = new Container()
  private readonly dispose: () => void

  constructor(host: HostApi, initial: string | undefined) {
    this.view.addChild(paperArt(DESIGN_W, DESIGN_H), skylineArt(DESIGN_W, DESIGN_H - 10))
    const t = label("level editor", 72, palette.ink, "700", "left")
    t.position.set(120, 120)
    const sub = label("sources, bins and goals · playtest instantly", 30, palette.inkSoft, "500", "left")
    sub.position.set(124, 190)
    this.view.addChild(t, sub)
    this.dispose = mountLevelForm(host, initial)
  }

  destroy() {
    this.dispose()
    this.view.destroy({ children: true })
  }
}

export const plugin: Plugin = {
  id: "editor",
  title: "level editor",
  subtitle: "make and playtest your own levels",
  kind: "tool",
  color: 0x306db5,
  shade: 0x1f4c85,
  open(host, path) {
    host.show(() => new EditorScene(host, path[0]))
  }
}

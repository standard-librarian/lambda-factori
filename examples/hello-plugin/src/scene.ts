/**
 * The scene `#/plugin/<url>` opens: a slowly spinning procedural shape and a
 * label, drawn only with `host.pixi` (never `import`ed as a value — see
 * `index.ts`'s header). Proves a third-party plugin can hold its own scene,
 * not just lend the deck a mechanic.
 */
import type { HostApi } from "@lambda-factori/kernel/Plugin.ts"
import type { Scene } from "@lambda-factori/kernel/Scene.ts"

export const helloScene = (host: HostApi): Scene => {
  const { Container, Graphics, Text } = host.pixi
  const view = new Container()
  const shape = new Graphics().star(0, 0, 6, 140, 70).fill(0xd0342c)
  shape.position.set(960, 460)
  const label = new Text({
    text: "hello, from a plugin loaded by URL",
    style: { fontFamily: "sans-serif", fontSize: 40, fill: 0x2b2b2b, fontWeight: "600" }
  })
  label.anchor.set(0.5)
  label.position.set(960, 760)
  view.addChild(shape, label)
  return {
    view,
    tick: (dtMs) => (shape.rotation += dtMs * 0.0006),
    destroy: () => view.destroy({ children: true })
  }
}

/**
 * `hello`: the SDK's own worked example, built only against
 * `@lambda-factori/kernel` — never the runtime, which a third-party plugin
 * can't import. It has one route (`#/plugin/<url>`, opening `helloScene`)
 * and one deck slide mechanic (`hello/counter`, in `mechanic.ts`).
 *
 * It reaches Pixi only through `host.pixi` (`HostApi.pixi`), never a value
 * `import` of `pixi.js` — this file and every other in this package import
 * only its types. That's what lets `dist/hello-plugin.js` (built by
 * `vite.config.ts` in library mode) be `import()`ed from a different origin
 * without pulling in a second copy of the renderer: see the README's
 * "Write a plugin" section.
 */
import type { HostApi, Plugin } from "@lambda-factori/kernel/Plugin.ts"
import { counter } from "./mechanic.ts"
import { manifest } from "./manifest.ts"
import { helloScene } from "./scene.ts"

const plugin: Plugin = {
  ...manifest,
  open: (host: HostApi) => host.show(() => helloScene(host)),
  mechanics: { counter }
}

export default plugin

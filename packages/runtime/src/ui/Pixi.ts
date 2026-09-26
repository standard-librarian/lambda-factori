// Static so Vite links the @font-face CSS from index.html and the fonts are discovered early.
import "@fontsource/fredoka/500.css"
import "@fontsource/fredoka/600.css"
import "@fontsource/fredoka/700.css"
import { Context, Effect, Layer } from "effect"
import { Application } from "pixi.js"
import { palette } from "./theme.ts"

/** The Pixi Application as a scoped resource: created on layer build, destroyed on release. */
export class Pixi extends Context.Service<Pixi, Application>()("lambda-factori/ui/Pixi") {
  static readonly layer = Layer.effect(
    Pixi,
    Effect.acquireRelease(
      Effect.promise(async () => {
        const app = new Application()
        await app.init({
          resizeTo: window,
          background: palette.paper,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(2, window.devicePixelRatio || 1)
        })
        document.body.appendChild(app.canvas)
        app.canvas.addEventListener("contextmenu", (e) => e.preventDefault())
        return app
      }),
      (app) => Effect.sync(() => app.destroy({ removeView: true }, { children: true }))
    )
  )
}

let fonts: Promise<void> | undefined

/**
 * Starts every font download at once (memoized). Called at startup, before the
 * renderer initializes, so fonts, renderer and the route's plugin load in parallel.
 */
export const startFonts = () =>
  (fonts ??= (async () => {
    const apl = new FontFace("BQN386", `url(${import.meta.env.BASE_URL}fonts/BQN386.woff2)`)
    await Promise.all([
      apl.load().then((face) => void document.fonts.add(face)),
      Promise.all(["500", "600", "700"].map((w) => document.fonts.load(`${w} 32px Fredoka`)))
    ])
  })())

/** Resolves once the UI fonts are ready, so Text measures correctly on first render. */
export const loadFonts = Effect.promise(startFonts)

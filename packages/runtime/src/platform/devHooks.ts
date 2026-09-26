/**
 * Handles on `globalThis` for the headless play-tester (`scripts/drive.ts`) and
 * the dev console. Dev builds only; production builds expose nothing.
 *
 * - `lfDeck`   the open DeckScene: `lfDeck.goto(slide, step)`, `lfDeck.step`
 * - `lfApp`    the Pixi Application (renderer, stage)
 * - `lfFrames` frames actually rendered so far (render-on-demand counter)
 */
interface DevHooks {
  lfDeck?: unknown
  lfApp?: unknown
  lfFrames?: number
}

const hooks = globalThis as DevHooks

export const exposeDev = <K extends keyof DevHooks>(name: K, value: DevHooks[K]) => {
  if (import.meta.env.DEV) hooks[name] = value
}

export const countDevFrame = () => {
  if (import.meta.env.DEV) hooks.lfFrames = (hooks.lfFrames ?? 0) + 1
}

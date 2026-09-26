/**
 * Slide mechanics contributed by plugins. A deck slide whose kind is
 * "<plugin>/<mechanic>" is rendered by that plugin; mechanics are loaded
 * lazily the first time a deck uses them.
 */
import type { SlideContext, SlideView } from "../plugins/deck/slides/common.ts"

export interface Mechanic {
  /** The mechanic paints the whole slide (no paper background or deck title). */
  readonly fullBleed?: boolean
  /** Validate and render a slide. Throw with a readable message on bad data. */
  render(slide: Record<string, unknown>, ctx: SlideContext): SlideView
}

const loaders: Record<string, () => Promise<Record<string, Mechanic>>> = {
  office: () => import("../plugins/office/mechanics.ts").then((m) => m.mechanics)
}

const loaded = new Map<string, Mechanic>()

/** Load every plugin mechanic a deck refers to, so rendering can stay synchronous. */
export const preloadMechanics = async (kinds: ReadonlyArray<string>) => {
  for (const kind of new Set(kinds.filter((k) => k.includes("/")))) {
    if (loaded.has(kind)) continue
    const [plugin, name] = kind.split("/") as [string, string]
    const load = loaders[plugin]
    if (!load) throw new Error(`no plugin provides slide kind “${kind}”`)
    const mechanics = await load()
    const m = mechanics[name]
    if (!m) throw new Error(`plugin “${plugin}” has no mechanic “${name}”`)
    loaded.set(kind, m)
  }
}

export const mechanic = (kind: string): Mechanic | undefined => loaded.get(kind)

/** Let a third-party plugin register mechanics at runtime. */
export const registerMechanics = (plugin: string, mechanics: Record<string, Mechanic>) => {
  loaders[plugin] = () => Promise.resolve(mechanics)
}

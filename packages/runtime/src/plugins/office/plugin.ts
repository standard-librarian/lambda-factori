/**
 * The `office` plugin: a `library` plugin (no route, no home-screen card)
 * that only lends the deck a slide mechanic, `office/scene` (see
 * `mechanics.ts`).
 */
import type { Plugin } from "../../kernel/Plugin.ts"
import { manifest } from "./manifest.ts"
import { mechanics } from "./mechanics.ts"

export const plugin: Plugin = { ...manifest, mechanics }

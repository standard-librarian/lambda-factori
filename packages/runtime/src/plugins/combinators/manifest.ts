/**
 * The combinator factory plugin's manifest — loaded eagerly by
 * `apps/web/src/plugins.ts` for the home screen, before the plugin's chunk.
 */
import type { PluginManifest } from "@lambda-factori/kernel/Plugin.ts"

export const manifest: PluginManifest = {
  id: "combinators",
  title: "combinator factory",
  subtitle: "the λ factori game: S and K to APL",
  kind: "game",
  color: 0xac1b2b,
  shade: 0x73000b,
  packTypes: ["levels"]
}

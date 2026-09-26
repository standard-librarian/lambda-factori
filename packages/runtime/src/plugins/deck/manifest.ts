/**
 * The deck plugin's manifest — loaded eagerly by `apps/web/src/plugins.ts`
 * for the home screen, before the plugin's chunk.
 */
import type { PluginManifest } from "@lambda-factori/kernel/Plugin.ts"

export const manifest: PluginManifest = {
  id: "deck",
  title: "slide decks",
  subtitle: "explain ideas with moving parts",
  kind: "deck",
  color: 0x4cc887,
  shade: 0x399871,
  packTypes: ["deck"]
}

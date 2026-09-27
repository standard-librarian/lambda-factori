/**
 * The level editor plugin's manifest — loaded eagerly by
 * `apps/web/src/plugins.ts` for the home screen, before the plugin's chunk.
 */
import type { PluginManifest } from "@lambda-factori/kernel/Plugin.ts"

export const manifest: PluginManifest = {
  id: "editor",
  title: "level editor",
  subtitle: "make and playtest your own levels",
  kind: "tool",
  color: 0x306db5,
  shade: 0x1f4c85
}

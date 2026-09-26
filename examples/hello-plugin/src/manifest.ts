/** The example plugin's manifest: a `tool`-kind plugin with one route and one slide mechanic. */
import type { PluginManifest } from "@lambda-factori/kernel/Plugin.ts"

export const manifest: PluginManifest = {
  id: "hello",
  title: "hello",
  subtitle: "a third-party plugin loaded from a URL",
  kind: "tool",
  color: 0xd0342c,
  shade: 0x8a1f19
}

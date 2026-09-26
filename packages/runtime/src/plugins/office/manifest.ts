/**
 * The office plugin's manifest. It's a `library` plugin: it has no route and
 * no card on the home screen, only the `office/scene` mechanic it lends the
 * deck (see `mechanics.ts` and `plugin.ts`).
 */
import type { PluginManifest } from "../../kernel/Plugin.ts"

export const manifest: PluginManifest = {
  id: "office",
  title: "office",
  subtitle: "a Human Resource Machine-style room, acting out a program",
  kind: "library",
  color: 0x7a5230,
  shade: 0x513512
}

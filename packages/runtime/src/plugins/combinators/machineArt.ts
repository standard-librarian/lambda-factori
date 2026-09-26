/**
 * The board's machine art: the red apply castle, or a source press coloured
 * by its atom's entry in the combinator catalogue. The only piece of factory
 * art that needs `core` (`colorOf`) — everything domain-free lives in
 * `ui/factoryArt.ts`, which this builds on.
 */
import { colorOf } from "@lambda-factori/core/Catalogue.ts"
import { applyArt, type FactoryArt, sourceArt } from "../../ui/factoryArt.ts"

export const machineArt = (kind: "source" | "apply", atom: string | undefined): FactoryArt => {
  if (kind === "apply") return applyArt()
  const { color, shade } = colorOf(atom ?? "?")
  return sourceArt(atom ?? "?", color, shade)
}

import { defineMechanic } from "../../kernel/mechanic.ts"
import type { Mechanic } from "../../kernel/Slide.ts"
import { officeSlide } from "./OfficeSlide.ts"
import { sceneTemplate } from "./sceneTemplate.ts"
import { OfficeSpec } from "@lambda-factori/contracts/OfficeSpec.ts"

/** Slide mechanics contributed by the office plugin: `office/scene`. */
export const mechanics: Record<string, Mechanic> = {
  scene: defineMechanic(OfficeSpec, officeSlide, { fullBleed: true, template: sceneTemplate })
}

/**
 * Slide mechanics the combinators plugin lends the deck: `combinators/theater`,
 * an inline reduction theater (`theaterSlide.ts`). Its data is validated with
 * its own schema, the way `office/scene` validates `OfficeSpec`
 * (`plugins/office/mechanics.ts`), via the shared `defineMechanic` helper.
 */
import { TheaterSlide } from "@lambda-factori/contracts/TheaterSlide.ts"
import { defineMechanic } from "@lambda-factori/kernel/mechanic.ts"
import type { Mechanic } from "@lambda-factori/kernel/Slide.ts"
import { theaterSlide } from "./theaterSlide.ts"
import { theaterTemplate } from "./theaterTemplate.ts"

export const mechanics: Record<string, Mechanic> = {
  theater: defineMechanic(TheaterSlide, theaterSlide, { template: theaterTemplate })
}

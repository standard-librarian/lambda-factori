/**
 * Slide mechanics the combinators plugin lends the deck: `combinators/theater`,
 * an inline reduction theater (`theaterSlide.ts`). Its data is validated with
 * its own schema, the way `office/scene` validates `OfficeSpec`
 * (`plugins/office/mechanics.ts`).
 */
import { Exit, Schema } from "effect"
import { TheaterSlide } from "@lambda-factori/contracts/TheaterSlide.ts"
import type { Mechanic } from "../../kernel/Slide.ts"
import { theaterSlide } from "./theaterSlide.ts"

const decode = Schema.decodeUnknownExit(TheaterSlide)

export const mechanics: Record<string, Mechanic> = {
  theater: {
    render: (slide, ctx) => {
      const exit = decode(slide, { onExcessProperty: "ignore" })
      if (Exit.isFailure(exit)) throw new Error(String(exit.cause).slice(0, 600))
      return theaterSlide(exit.value, ctx)
    }
  }
}

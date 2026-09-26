import { Exit, Schema } from "effect"
import type { Mechanic } from "../../engine/mechanics.ts"
import { officeSlide } from "./OfficeSlide.ts"
import { OfficeSpec } from "@lambda-factori/contracts/OfficeSpec.ts"

const decode = Schema.decodeUnknownExit(OfficeSpec)

/** Slide mechanics contributed by the office plugin: `office/scene`. */
export const mechanics: Record<string, Mechanic> = {
  scene: {
    fullBleed: true,
    render: (slide, ctx) => {
      const exit = decode(slide, { onExcessProperty: "ignore" })
      if (Exit.isFailure(exit)) throw new Error(String(exit.cause).slice(0, 600))
      return officeSlide(exit.value, ctx)
    }
  }
}

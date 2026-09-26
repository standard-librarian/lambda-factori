/**
 * Builds a `Mechanic` from a schema and a render function, so every plugin
 * mechanic (`office/mechanics.ts`, `combinators/mechanics.ts`) shares one
 * decode-then-throw instead of each writing its own. `render`'s parameter
 * type is inferred from `schema`, so passing a renderer for the wrong shape
 * is a compile error, not a runtime throw; so is a template of the wrong shape.
 */
import { Exit, Schema } from "effect"
import type { Mechanic, SlideContext, SlideView } from "./Slide.ts"

export const defineMechanic = <S extends Schema.Codec<unknown, Record<string, unknown>>>(
  schema: S,
  render: (value: S["Type"], ctx: SlideContext) => SlideView,
  options?: {
    readonly fullBleed?: boolean
    /** A minimal valid slide of this mechanic, offered by the deck's slide editor. Typed as the
     * schema's encoded (JSON) shape, so a template that can't decode fails to compile. */
    readonly template?: S["Encoded"]
  }
): Mechanic => {
  const decode = Schema.decodeUnknownExit(schema)
  return {
    ...(options?.fullBleed !== undefined ? { fullBleed: options.fullBleed } : {}),
    ...(options?.template !== undefined ? { template: options.template } : {}),
    render: (slide, ctx) => {
      const exit = decode(slide, { onExcessProperty: "ignore" })
      if (Exit.isFailure(exit)) throw new Error(String(exit.cause).slice(0, 600))
      return render(exit.value, ctx)
    }
  }
}

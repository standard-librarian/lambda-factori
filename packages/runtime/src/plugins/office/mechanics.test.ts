import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { OfficeSpec } from "@lambda-factori/contracts/OfficeSpec.ts"
import { sceneTemplate } from "./sceneTemplate.ts"

describe("office mechanic templates", () => {
  it("office/scene's template decodes against OfficeSpec", () => {
    expect(() => Schema.decodeUnknownSync(OfficeSpec)(sceneTemplate)).not.toThrow()
  })
})

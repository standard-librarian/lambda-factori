/**
 * A minimal valid `office/scene` slide, offered by the deck's slide editor
 * insert menu (`mechanics.ts`) and checked against `OfficeSpec` in
 * `mechanics.test.ts`. Kept apart from `mechanics.ts` so the test can decode
 * it without pulling in the Pixi renderer (`OfficeSlide.ts`), which touches
 * `document` at import time and needs a browser.
 */
import type { OfficeSpec } from "@lambda-factori/contracts/OfficeSpec.ts"

export const sceneTemplate: typeof OfficeSpec.Encoded = {
  kind: "office/scene",
  title: "A new office",
  program: ["INBOX", "OUTBOX"]
}

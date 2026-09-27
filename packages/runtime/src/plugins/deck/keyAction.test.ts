/** The spec for `keyAction.ts`: which key means which deck action, including Escape closing the
 * topmost overlay before it leaves the deck. */
import { describe, expect, it } from "vitest"
import { deckKeyAction } from "./keyAction.ts"

const closed = { overviewOpen: false, notesOpen: false, editorOpen: false }

describe("deck key actions", () => {
  it("maps every advance/retreat key to next/prev", () => {
    for (const code of ["ArrowRight", "PageDown", "Space", "Enter"]) expect(deckKeyAction(code, closed)).toEqual({ type: "next" })
    for (const code of ["ArrowLeft", "PageUp", "Backspace"]) expect(deckKeyAction(code, closed)).toEqual({ type: "prev" })
  })

  it("maps the letter keys to their toggles", () => {
    expect(deckKeyAction("KeyN", closed)).toEqual({ type: "toggleNotes" })
    expect(deckKeyAction("KeyO", closed)).toEqual({ type: "toggleOverview" })
    expect(deckKeyAction("KeyG", closed)).toEqual({ type: "toggleOverview" })
    expect(deckKeyAction("KeyF", closed)).toEqual({ type: "toggleFullscreen" })
    expect(deckKeyAction("KeyP", closed)).toEqual({ type: "openPresenter" })
    expect(deckKeyAction("KeyE", closed)).toEqual({ type: "toggleEditor" })
    expect(deckKeyAction("KeyS", closed)).toEqual({ type: "shareLink" })
  })

  it("Escape closes the topmost overlay first: overview, then notes, then editor", () => {
    expect(deckKeyAction("Escape", closed)).toEqual({ type: "home" })
    expect(deckKeyAction("Escape", { ...closed, editorOpen: true })).toEqual({ type: "toggleEditor" })
    expect(deckKeyAction("Escape", { ...closed, notesOpen: true, editorOpen: true })).toEqual({ type: "toggleNotes" })
    expect(deckKeyAction("Escape", { ...closed, overviewOpen: true, notesOpen: true, editorOpen: true })).toEqual({ type: "toggleOverview" })
  })

  it("ignores keys it doesn't own", () => {
    expect(deckKeyAction("KeyZ", closed)).toBeUndefined()
  })
})

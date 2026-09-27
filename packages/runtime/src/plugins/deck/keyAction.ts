/**
 * Which key means which deck action, decided without touching the DOM or a
 * running scene. `DeckScene.onKey` looks up the action and carries it out;
 * this only hides the mapping (arrow keys, PageUp/PageDown, space and the
 * letter keys N/O/F/P/E/S), including the couple of keys whose meaning
 * depends on what overlay is open (Escape closes the topmost one first).
 */
export type DeckAction =
  | { readonly type: "next" }
  | { readonly type: "prev" }
  | { readonly type: "first" }
  | { readonly type: "last" }
  | { readonly type: "toggleNotes" }
  | { readonly type: "toggleOverview" }
  | { readonly type: "toggleFullscreen" }
  | { readonly type: "openPresenter" }
  | { readonly type: "toggleEditor" }
  | { readonly type: "shareLink" }
  | { readonly type: "home" }
  | undefined

/** What's open, for the keys (only Escape) whose action depends on it. */
export interface DeckOverlays {
  readonly overviewOpen: boolean
  readonly notesOpen: boolean
  readonly editorOpen: boolean
}

export const deckKeyAction = (code: string, overlays: DeckOverlays): DeckAction => {
  switch (code) {
    case "ArrowRight":
    case "PageDown":
    case "Space":
    case "Enter":
      return { type: "next" }
    case "ArrowLeft":
    case "PageUp":
    case "Backspace":
      return { type: "prev" }
    case "Home":
      return { type: "first" }
    case "End":
      return { type: "last" }
    case "KeyN":
      return { type: "toggleNotes" }
    case "KeyO":
    case "KeyG":
      return { type: "toggleOverview" }
    case "KeyF":
      return { type: "toggleFullscreen" }
    case "KeyP":
      return { type: "openPresenter" }
    case "KeyE":
      return { type: "toggleEditor" }
    case "KeyS":
      return { type: "shareLink" }
    case "Escape":
      if (overlays.overviewOpen) return { type: "toggleOverview" }
      if (overlays.notesOpen) return { type: "toggleNotes" }
      if (overlays.editorOpen) return { type: "toggleEditor" }
      return { type: "home" }
    default:
      return undefined
  }
}

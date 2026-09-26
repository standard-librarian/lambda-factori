/**
 * The deck ↔ presenter-window protocol, over a BroadcastChannel per deck. The
 * deck announces its `state` after every move; the presenter sends `cmd`s.
 */
export type DeckMessage =
  | { readonly type: "state"; readonly deck: string; readonly slide: number; readonly step: number; readonly steps: number; readonly total: number }
  | { readonly type: "cmd"; readonly deck: string; readonly cmd: "next" | "prev" | "sync" | "goto"; readonly slide?: number }

export const channelName = (deck: string) => `lambda-factori/deck/${deck}`

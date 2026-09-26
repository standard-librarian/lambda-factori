import { ensureOverlayStyles } from "../../render/overlay.ts"
import { channelName, type DeckMessage } from "./messages.ts"
import { type Deck, joinLines } from "@lambda-factori/contracts/Deck.ts"
import { slideTitle } from "./render.ts"

/**
 * Presenter view: a second window with the current slide's notes, what comes
 * next, build progress and a timer. It drives the audience window over a
 * BroadcastChannel, so clicker keys work in either window.
 */
export const openPresenter = (deck: Deck) => {
  ensureOverlayStyles()
  for (const c of document.querySelectorAll("canvas")) c.style.display = "none"
  document.title = `presenter · ${deck.title}`
  const root = document.createElement("div")
  root.className = "lf-panel"
  root.style.inset = "16px"
  root.innerHTML = `
    <header><b>presenter</b><span class="lf-muted">${deck.title}</span>
      <span style="margin-left:auto;font-size:34px;font-weight:700" data-timer>00:00</span>
      <button data-reset>reset timer</button></header>
    <div style="display:flex;gap:18px;flex:1;min-height:0">
      <div style="flex:2;display:flex;flex-direction:column;gap:10px;min-height:0">
        <div style="font-size:18px;color:#ac1b2b;font-weight:700" data-where>waiting for the deck window…</div>
        <div style="font-size:40px;font-weight:700;line-height:1.1" data-title></div>
        <div style="font-size:18px;color:#5b5f7d" data-steps></div>
        <div style="flex:1;overflow:auto;font-size:26px;line-height:1.4;white-space:pre-wrap;background:#fffdf8;border-radius:16px;padding:16px;border:2px solid #d6cab4" data-notes></div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:10px">
        <div class="lf-muted">next</div>
        <div style="font-size:26px;font-weight:600" data-next></div>
        <div class="lf-row" style="margin-top:auto">
          <button data-prev style="font-size:22px;padding:18px 26px">◀ back</button>
          <button class="lf-primary" data-fwd style="font-size:22px;padding:18px 34px">next ▶</button>
        </div>
        <p class="lf-muted">→ / space / PageDown: next · ← / PageUp: back · the audience window is the one to put on the projector</p>
      </div>
    </div>`
  document.body.appendChild(root)
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(`[${sel}]`)!
  const channel = new BroadcastChannel(channelName(deck.id))
  const send = (cmd: "next" | "prev" | "sync") => channel.postMessage({ type: "cmd", deck: deck.id, cmd } satisfies DeckMessage)
  let started = 0
  const render = (m: Extract<DeckMessage, { type: "state" }>) => {
    if (!started) started = Date.now()
    const s = deck.slides[m.slide]
    if (!s) return
    $("data-where").textContent = `slide ${m.slide + 1} / ${m.total} · ${s.kind}`
    $("data-title").textContent = slideTitle(s, m.slide)
    $("data-steps").textContent = m.steps > 0 ? `build ${m.step} / ${m.steps}` : ""
    $("data-notes").textContent = joinLines(s.notes) || "—"
    const n = deck.slides[m.slide + 1]
    $("data-next").textContent = n ? slideTitle(n, m.slide + 1) : "the end"
  }
  channel.onmessage = (e: MessageEvent<DeckMessage>) => {
    if (e.data.type === "state" && e.data.deck === deck.id) render(e.data)
  }
  $("data-fwd").onclick = () => send("next")
  $("data-prev").onclick = () => send("prev")
  $("data-reset").onclick = () => (started = Date.now())
  window.addEventListener("keydown", (e) => {
    if (["ArrowRight", "PageDown", "Space", "Enter"].includes(e.code)) {
      e.preventDefault()
      send("next")
    } else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.code)) {
      e.preventDefault()
      send("prev")
    }
  }, { capture: true })
  setInterval(() => {
    const s = started ? Math.floor((Date.now() - started) / 1000) : 0
    $("data-timer").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
  }, 500)
  send("sync")
}

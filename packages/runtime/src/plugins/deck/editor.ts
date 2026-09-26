import { Exit, Schema } from "effect"
import type { HostApi } from "../../kernel/Plugin.ts"
import type { Mechanic } from "../../kernel/Slide.ts"
import { Deck, Slide } from "@lambda-factori/contracts/Deck.ts"
import { ensureOverlayStyles } from "../../ui/overlay.ts"
import type { DeckLibrary } from "./plugin.ts"
import { templates } from "./templates.ts"

const decodeSlide = Schema.decodeUnknownExit(Slide)
const decodeDeck = Schema.decodeUnknownExit(Deck)
const encodeDeck = Schema.encodeSync(Deck)

/**
 * Deck creation mode: edit the current slide's JSON, add or remove slides,
 * save the deck to this browser, or export it as a file (a new plugin).
 */
export const openSlideEditor = (o: {
  host: HostApi
  library: DeckLibrary
  /** The mechanics this deck has resolved, so the insert menu can offer their templates too. */
  mechanics: ReadonlyMap<string, Mechanic>
  deck: () => Deck
  index: () => number
  apply: (deck: Deck, index: number) => void
  onClose: () => void
}): (() => void) => {
  ensureOverlayStyles()
  const mechanicTemplates = [...o.mechanics].flatMap(([kind, m]) => (m.template ? [[kind, m.template] as const] : []))
  const insertable: Record<string, Record<string, unknown>> = { ...templates, ...Object.fromEntries(mechanicTemplates) }
  const root = document.createElement("div")
  root.className = "lf-panel lf-right"
  root.innerHTML = `
    <header><b>slide editor</b><span class="lf-muted" data-where></span><button data-close>✕</button></header>
    <textarea spellcheck="false" data-json></textarea>
    <div class="lf-error" data-error></div>
    <div class="lf-row">
      <button class="lf-primary" data-apply>apply (⌘↵)</button>
      <select data-template>${Object.keys(insertable).map((k) => `<option value="${k}">+ ${k}</option>`).join("")}</select>
      <button data-add>insert after</button>
      <button data-delete>delete slide</button>
    </div>
    <div class="lf-row">
      <button data-save>save deck in browser</button>
      <button data-export>export .json</button>
      <label class="lf-file">import .json<input type="file" accept="application/json" data-import></label>
      <button data-reset>discard local edits</button>
    </div>
    <p class="lf-muted">Every slide is JSON checked against the deck schema. Kinds: ${Object.keys(templates).join(", ")}${mechanicTemplates.length > 0 ? `, plus this deck's plugin kinds: ${mechanicTemplates.map(([k]) => k).join(", ")}` : ""}. Any slide can have "notes" and a "sticky".</p>`
  document.body.appendChild(root)
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(`[${sel}]`)!
  const json = $<HTMLTextAreaElement>("data-json")
  const error = $<HTMLDivElement>("data-error")
  const load = () => {
    const d = o.deck()
    json.value = JSON.stringify(encodeDeck(d).slides[o.index()], null, 2)
    $<HTMLSpanElement>("data-where").textContent = ` slide ${o.index() + 1} of ${d.slides.length}`
    error.textContent = ""
  }
  load()
  const withSlides = (slides: ReadonlyArray<unknown>, index: number) => {
    const d = o.deck()
    const exit = decodeDeck({ ...encodeDeck(d), slides })
    if (Exit.isFailure(exit)) {
      error.textContent = String(exit.cause).slice(0, 800)
      return false
    }
    o.apply(exit.value, index)
    load()
    return true
  }
  const apply = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(json.value)
    } catch (e) {
      error.textContent = `JSON: ${e instanceof Error ? e.message : String(e)}`
      return
    }
    const exit = decodeSlide(parsed)
    if (Exit.isFailure(exit)) {
      error.textContent = String(exit.cause).slice(0, 800)
      return
    }
    const slides = [...encodeDeck(o.deck()).slides]
    slides[o.index()] = parsed as (typeof slides)[number]
    withSlides(slides, o.index())
  }
  $("data-apply").onclick = apply
  json.onkeydown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") apply()
    e.stopPropagation()
  }
  $("data-add").onclick = () => {
    const kind = $<HTMLSelectElement>("data-template").value
    const slides = [...encodeDeck(o.deck()).slides]
    slides.splice(o.index() + 1, 0, insertable[kind] as (typeof slides)[number])
    withSlides(slides, o.index() + 1)
  }
  $("data-delete").onclick = () => {
    const slides = [...encodeDeck(o.deck()).slides]
    if (slides.length <= 1) return
    slides.splice(o.index(), 1)
    withSlides(slides, Math.max(0, o.index() - 1))
  }
  $("data-save").onclick = () => void o.library.save(o.deck()).then(() => o.host.toast("deck saved in this browser"))
  $("data-reset").onclick = () =>
    void o.library.reset(o.deck().id).then(() => {
      o.host.toast("local edits discarded")
      location.reload()
    })
  $("data-export").onclick = () => {
    const blob = new Blob([JSON.stringify(encodeDeck(o.deck()), null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${o.deck().id}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  $<HTMLInputElement>("data-import").onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const exit = decodeDeck(JSON.parse(await file.text()))
    if (Exit.isFailure(exit)) {
      error.textContent = String(exit.cause).slice(0, 800)
      return
    }
    await o.library.save(exit.value)
    o.host.navigate(`deck/${encodeURIComponent(exit.value.id)}/1`)
  }
  const close = () => {
    root.remove()
    o.onClose()
  }
  $("data-close").onclick = close
  return () => root.remove()
}

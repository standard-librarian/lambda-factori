/**
 * The level editor's DOM form: pick or copy a level, edit its fields and bins,
 * then save, playtest, search for the smallest recipe, share, export or import.
 * Validation and search live in `levelText.ts`; this file only wires the page.
 */
import { Exit, Schema } from "effect"
import { catalogue } from "@lambda-factori/core/Catalogue.ts"
import { Level } from "@lambda-factori/core/Level.ts"
import type { HostApi } from "@lambda-factori/kernel/Plugin.ts"
import { ensureOverlayStyles } from "../../ui/overlay.ts"
import { blankLevel, type LevelFields, recipeReport, showTargets, validateLevel } from "./levelText.ts"
import type { LevelLibrary } from "./plugin.ts"

const encodeLevel = Schema.encodeSync(Level)
const decodeLevels = Schema.decodeUnknownExit(Schema.Array(Level))

/** Mount the form; returns a function that removes it. */
export const mountLevelForm = (host: HostApi, library: LevelLibrary, initialId: string | undefined): (() => void) => {
  ensureOverlayStyles()
  const root = document.createElement("div")
  root.className = "lf-panel"
  Object.assign(root.style, { top: "22%", left: "5%", right: "5%", bottom: "5%" })
  const papers = library.pack.papers
  root.innerHTML = `
    <header><b>your levels</b>
      <select data-pick></select>
      <button data-new>new</button>
      <select data-copy><option value="">copy a built-in level…</option>${library.pack.levels.map((l) => `<option value="${l.id}">${l.title}</option>`).join("")}</select>
      <button data-close>✕ home</button>
    </header>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;flex:1;min-height:0">
      <div style="display:flex;flex-direction:column;gap:10px">
        <label class="lf-field"><span>id</span><input type="text" data-id></label>
        <label class="lf-field"><span>title</span><input type="text" data-title></label>
        <label class="lf-field"><span>blurb</span><input type="text" data-blurb></label>
        <label class="lf-field"><span>hint (a term, or words)</span><input type="text" data-hint></label>
        <label class="lf-field"><span>sources (atoms, comma separated: S, K, I, B, C, W, Φ, ⊤, ⊥, ⊼, or any APL glyph)</span><input type="text" data-sources></label>
        <div class="lf-row">
          <label class="lf-field"><span>sticker</span><select data-sticker><option value="">none</option>${catalogue.map((c) => `<option>${c.name}</option>`).join("")}</select></label>
          <label class="lf-field"><span>paper</span><select data-paper><option value="">none</option>${papers.map((p) => `<option value="${p.id}">${p.authors} ${p.year}</option>`).join("")}</select></label>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;min-height:0">
        <label class="lf-field" style="flex:1;min-height:0"><span>bins — one per line: <code>label | params | body</code> or <code>label | truth 0110</code></span><textarea spellcheck="false" data-targets></textarea></label>
        <div class="lf-error" data-error></div>
        <div class="lf-muted" data-status></div>
      </div>
    </div>
    <div class="lf-row">
      <button class="lf-primary" data-play>▶ save &amp; playtest</button>
      <button data-save>save</button>
      <button data-solve>find smallest recipe</button>
      <button data-delete>delete</button>
      <button data-share>copy share link</button>
      <button data-export>export levels .json</button>
      <label class="lf-file">import .json<input type="file" accept="application/json" data-import></label>
    </div>`
  document.body.appendChild(root)
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(`[${sel}]`)!
  const field = (sel: string) => $<HTMLInputElement>(sel)
  const error = $<HTMLDivElement>("data-error")
  const status = $<HTMLDivElement>("data-status")
  status.style.whiteSpace = "pre-wrap"

  const fill = (l: Level) => {
    field("data-id").value = l.id
    field("data-title").value = l.title
    field("data-blurb").value = l.blurb
    field("data-hint").value = l.hint ?? ""
    field("data-sources").value = l.sources.join(", ")
    $<HTMLSelectElement>("data-sticker").value = l.sticker ?? ""
    $<HTMLSelectElement>("data-paper").value = l.paper ?? ""
    $<HTMLTextAreaElement>("data-targets").value = showTargets(l)
    error.textContent = ""
    status.textContent = ""
  }
  const refreshPicker = (selected?: string) => {
    const levels = library.customLevels()
    $<HTMLSelectElement>("data-pick").innerHTML = levels.length
      ? levels.map((l) => `<option value="${l.id}" ${l.id === selected ? "selected" : ""}>${l.title}</option>`).join("")
      : `<option value="">(none yet)</option>`
  }
  const fields = (): LevelFields => ({
    id: field("data-id").value,
    title: field("data-title").value,
    blurb: field("data-blurb").value,
    hint: field("data-hint").value,
    sources: field("data-sources").value,
    targets: $<HTMLTextAreaElement>("data-targets").value,
    sticker: $<HTMLSelectElement>("data-sticker").value,
    paper: $<HTMLSelectElement>("data-paper").value
  })
  /** The form as a valid Level, or undefined with the problems shown. */
  const read = (): Level | undefined => {
    const v = validateLevel(fields())
    if (!v.ok) {
      error.textContent = v.errors
      return undefined
    }
    error.textContent = ""
    if (v.opaque.length) status.textContent = `opaque atoms (no rule): ${v.opaque.join(" ")}`
    return v.level
  }
  const save = async () => {
    const level = read()
    if (!level) return undefined
    await library.saveCustomLevel(level)
    refreshPicker(level.id)
    host.toast(`saved “${level.title}”`)
    return level
  }

  $("data-save").onclick = () => void save()
  $("data-play").onclick = () => void save().then((l) => l && host.navigate(`combinators/test/${encodeURIComponent(l.id)}`))
  $("data-new").onclick = () => fill(blankLevel())
  $<HTMLSelectElement>("data-pick").onchange = (e) => {
    const l = library.customLevels().find((x) => x.id === (e.target as HTMLSelectElement).value)
    if (l) fill(l)
  }
  $<HTMLSelectElement>("data-copy").onchange = (e) => {
    const src = library.pack.levels.find((x) => x.id === (e.target as HTMLSelectElement).value)
    if (src) fill(new Level({ ...src, id: `${src.id}-copy`, world: "custom", title: `${src.title} (copy)` }))
  }
  $("data-delete").onclick = () => {
    void library.removeCustomLevel(field("data-id").value.trim()).then(() => {
      refreshPicker()
      fill(library.customLevels()[0] ?? blankLevel())
      host.toast("deleted")
    })
  }
  $("data-solve").onclick = () => {
    const level = read()
    if (!level) return
    status.textContent = "searching…"
    // Let the "searching…" text paint before the (synchronous) search runs.
    setTimeout(() => (status.textContent = recipeReport(level)), 20)
  }
  $("data-share").onclick = () => {
    const level = read()
    if (level) void host.share({ type: "levels", data: [encodeLevel(level)] }).then(() => host.toast("share link copied"))
  }
  $("data-export").onclick = () => {
    const blob = new Blob([JSON.stringify(library.customLevels().map((l) => encodeLevel(l)), null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "lambda-factori-levels.json"
    a.click()
    URL.revokeObjectURL(a.href)
  }
  $<HTMLInputElement>("data-import").onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const exit = decodeLevels(JSON.parse(await file.text()))
    if (Exit.isFailure(exit)) {
      error.textContent = String(exit.cause).slice(0, 600)
      return
    }
    for (const l of exit.value) await library.saveCustomLevel(new Level({ ...l, world: "custom" }))
    refreshPicker()
    host.toast(`imported ${exit.value.length} level${exit.value.length === 1 ? "" : "s"}`)
  }
  $("data-close").onclick = () => host.home()

  const existing = library.customLevels()
  refreshPicker(initialId)
  fill(existing.find((l) => l.id === initialId) ?? existing[0] ?? blankLevel())
  return () => root.remove()
}

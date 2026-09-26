import { Exit, Schema } from "effect"
import { Container } from "pixi.js"
import { byName, catalogue } from "@lambda-factori/core/Catalogue.ts"
import { goalOf, Level, satisfies } from "@lambda-factori/core/Level.ts"
import { searchRecipes } from "@lambda-factori/core/Search.ts"
import { parse } from "@lambda-factori/core/Term.ts"
import type { HostApi, Plugin } from "../../engine/Plugin.ts"
import { copyShareLink } from "../../engine/share.ts"
import { label, paperArt, skylineArt } from "../../render/art.ts"
import { ensureOverlayStyles } from "../../render/overlay.ts"
import type { Scene } from "../../render/Scene.ts"
import { DESIGN_H, DESIGN_W, palette } from "../../render/theme.ts"

const decodeLevel = Schema.decodeUnknownExit(Level)
const encodeLevel = Schema.encodeSync(Level)
const decodeLevels = Schema.decodeUnknownExit(Schema.Array(Level))

/** `label | params | body`, or `label | truth 0110`, one bin per line. */
const parseTargets = (text: string) =>
  text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [label = "", a = "", b] = line.split("|").map((p) => p.trim())
    const truth = /^truth\s+([01]+)$/.exec(a)
    if (truth) return { label, truth: truth[1]! }
    return { label, params: a, body: b ?? "" }
  })

const showTargets = (level: Level) =>
  level.targets.map((t) => (t.truth ? `${t.label} | truth ${t.truth}` : `${t.label} | ${t.params ?? ""} | ${t.body ?? ""}`)).join("\n")

const blank = (): Level =>
  new Level({
    id: `my-level-${Math.random().toString(36).slice(2, 6)}`,
    world: "custom",
    title: "my level",
    blurb: "Build something that returns its second argument.",
    sources: ["S", "K"],
    targets: [{ label: "KI", params: "xy", body: "y" }]
  })

/** A calm backdrop for the editor form; the form itself is DOM. */
class EditorScene implements Scene {
  readonly view = new Container()
  private readonly dispose: () => void

  constructor(host: HostApi, initial: string | undefined) {
    this.view.addChild(paperArt(DESIGN_W, DESIGN_H), skylineArt(DESIGN_W, DESIGN_H - 10))
    const t = label("level editor", 72, palette.ink, "700", "left")
    t.position.set(120, 120)
    const sub = label("sources, bins and goals · playtest instantly", 30, palette.inkSoft, "500", "left")
    sub.position.set(124, 190)
    this.view.addChild(t, sub)
    this.dispose = mountForm(host, initial)
  }

  destroy() {
    this.dispose()
    this.view.destroy({ children: true })
  }
}

const mountForm = (host: HostApi, initialId: string | undefined): (() => void) => {
  ensureOverlayStyles()
  const root = document.createElement("div")
  root.className = "lf-panel"
  Object.assign(root.style, { top: "22%", left: "5%", right: "5%", bottom: "5%" })
  const papers = host.services.pack.papers
  root.innerHTML = `
    <header><b>your levels</b>
      <select data-pick></select>
      <button data-new>new</button>
      <select data-copy><option value="">copy a built-in level…</option>${host.services.pack.levels.map((l) => `<option value="${l.id}">${l.title}</option>`).join("")}</select>
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
  const input = (sel: string) => $<HTMLInputElement>(sel)
  const error = $<HTMLDivElement>("data-error")
  const status = $<HTMLDivElement>("data-status")

  const fill = (l: Level) => {
    input("data-id").value = l.id
    input("data-title").value = l.title
    input("data-blurb").value = l.blurb
    input("data-hint").value = l.hint ?? ""
    input("data-sources").value = l.sources.join(", ")
    $<HTMLSelectElement>("data-sticker").value = l.sticker ?? ""
    $<HTMLSelectElement>("data-paper").value = l.paper ?? ""
    $<HTMLTextAreaElement>("data-targets").value = showTargets(l)
    error.textContent = ""
    status.textContent = ""
  }
  const refreshPicker = (selected?: string) => {
    const levels = host.services.customLevels()
    $<HTMLSelectElement>("data-pick").innerHTML = levels.length
      ? levels.map((l) => `<option value="${l.id}" ${l.id === selected ? "selected" : ""}>${l.title}</option>`).join("")
      : `<option value="">(none yet)</option>`
  }

  /** Read the form into a validated Level, reporting every problem found. */
  const read = (): Level | undefined => {
    const raw = {
      id: input("data-id").value.trim(),
      world: "custom",
      title: input("data-title").value.trim(),
      blurb: input("data-blurb").value.trim(),
      ...(input("data-hint").value.trim() ? { hint: input("data-hint").value.trim() } : {}),
      sources: input("data-sources").value.split(",").map((s) => s.trim()).filter(Boolean),
      targets: parseTargets($<HTMLTextAreaElement>("data-targets").value),
      ...($<HTMLSelectElement>("data-sticker").value ? { sticker: $<HTMLSelectElement>("data-sticker").value } : {}),
      ...($<HTMLSelectElement>("data-paper").value ? { paper: $<HTMLSelectElement>("data-paper").value } : {})
    }
    const exit = decodeLevel(raw)
    if (Exit.isFailure(exit)) {
      error.textContent = String(exit.cause).slice(0, 600)
      return undefined
    }
    const problems: Array<string> = []
    if (!/^[\w-]+$/.test(raw.id)) problems.push("id: letters, digits, - and _ only")
    for (const t of raw.targets) {
      try {
        goalOf(t)
        if ("truth" in t && t.truth && (t.truth.length & (t.truth.length - 1)) !== 0) problems.push(`${t.label}: truth table length must be a power of two`)
      } catch (e) {
        problems.push(`${t.label}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    const unknown = raw.sources.filter((s) => !byName.has(s))
    if (unknown.length) status.textContent = `opaque atoms (no rule): ${unknown.join(" ")}`
    if (problems.length) {
      error.textContent = problems.join("\n")
      return undefined
    }
    error.textContent = ""
    return exit.value
  }

  const save = async () => {
    const level = read()
    if (!level) return undefined
    await host.services.saveCustomLevel(level)
    refreshPicker(level.id)
    host.toast(`saved “${level.title}”`)
    return level
  }

  $("data-save").onclick = () => void save()
  $("data-play").onclick = () => void save().then((l) => l && host.navigate(`combinators/test/${encodeURIComponent(l.id)}`))
  $("data-new").onclick = () => fill(blank())
  $<HTMLSelectElement>("data-pick").onchange = (e) => {
    const l = host.services.customLevels().find((x) => x.id === (e.target as HTMLSelectElement).value)
    if (l) fill(l)
  }
  $<HTMLSelectElement>("data-copy").onchange = (e) => {
    const src = host.services.pack.levels.find((x) => x.id === (e.target as HTMLSelectElement).value)
    if (src) fill(new Level({ ...src, id: `${src.id}-copy`, world: "custom", title: `${src.title} (copy)` }))
  }
  $("data-delete").onclick = () => {
    const id = input("data-id").value.trim()
    void host.services.removeCustomLevel(id).then(() => {
      refreshPicker()
      fill(host.services.customLevels()[0] ?? blank())
      host.toast("deleted")
    })
  }
  $("data-solve").onclick = () => {
    const level = read()
    if (!level) return
    status.textContent = "searching…"
    setTimeout(() => {
      const lines = level.targets.map((t) => {
        const goal = goalOf(t)
        const hint = level.hint
        let hintOk = ""
        try {
          if (hint && satisfies(parse(hint), goal)) hintOk = " · hint ✓"
        } catch {
          // A hint in words is fine.
        }
        const r = searchRecipes(goal, level.sources, { maxSize: 7, limit: 2, maxTerms: 250_000 })
        return r.found.length
          ? `${t.label}: ${r.found.join("  or  ")} (size ${r.searchedSize})${hintOk}`
          : `${t.label}: nothing up to size ${r.searchedSize}${r.exhausted ? "" : " (search budget hit)"}${hintOk}`
      })
      status.textContent = lines.join("\n")
    }, 20)
  }
  $("data-share").onclick = () => {
    const level = read()
    if (!level) return
    void copyShareLink({ type: "levels", data: [encodeLevel(level)] }).then(() => host.toast("share link copied"))
  }
  $("data-export").onclick = () => {
    const blob = new Blob([JSON.stringify(host.services.customLevels().map((l) => encodeLevel(l)), null, 2)], { type: "application/json" })
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
    for (const l of exit.value) await host.services.saveCustomLevel(new Level({ ...l, world: "custom" }))
    refreshPicker()
    host.toast(`imported ${exit.value.length} level${exit.value.length === 1 ? "" : "s"}`)
  }
  $("data-close").onclick = () => host.home()
  status.style.whiteSpace = "pre-wrap"

  const existing = host.services.customLevels()
  refreshPicker(initialId)
  fill(existing.find((l) => l.id === initialId) ?? existing[0] ?? blank())
  return () => root.remove()
}

export const plugin: Plugin = {
  id: "editor",
  title: "level editor",
  subtitle: "make and playtest your own levels",
  kind: "tool",
  color: 0x306db5,
  shade: 0x1f4c85,
  open(host, path) {
    host.show(() => new EditorScene(host, path[0]))
  }
}

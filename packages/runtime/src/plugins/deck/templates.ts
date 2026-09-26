/**
 * A minimal valid slide of every core kind, offered by the slide editor's
 * "insert" menu. Pure data (no Pixi), so a test can check each one against the
 * schema. Keyed by the schema's kinds: a new kind won't compile without one.
 */
import type { CoreKind, SlideOf } from "@lambda-factori/contracts/Deck.ts"

export const templates: { readonly [K in CoreKind]: SlideOf<K> } = {
  title: { kind: "title", title: "A new talk", subtitle: "what it is about" },
  section: { kind: "section", title: "A new part", number: "0" },
  bullets: { kind: "bullets", title: "New slide", items: ["First point", "Second point"] },
  quote: { kind: "quote", quote: "Say something memorable.", by: "Someone" },
  dialogue: { kind: "dialogue", title: "A conversation", lines: [{ who: "john", text: "…" }, { who: "bob", text: "…" }] },
  code: { kind: "code", title: "Some code", panes: [{ label: "Example.java", code: ["class Example {", "}"], analyze: true, metrics: true }] },
  modules: { kind: "modules", title: "Deep vs shallow", modules: [{ name: "deep", interface: 2, functionality: 10 }, { name: "shallow", interface: 8, functionality: 3 }] },
  factory: { kind: "factory", title: "Modules as factories", modules: [{ name: "deep", ports: ["open", "read"], inner: 12 }, { name: "shallow", ports: ["a", "b", "c", "d"], inner: 2 }] },
  decisions: { kind: "decisions", title: "Who knows the decision?", decisions: [{ id: "fmt", label: "file format" }], layouts: [ { label: "by time", modules: [{ name: "Reader", knows: ["fmt"] }, { name: "Writer", knows: ["fmt"] }] }, { label: "by knowledge", modules: [{ name: "File", knows: ["fmt"] }] } ], changes: [{ label: "the file format", decision: "fmt" }] },
  line: { kind: "line", title: "An assembly line", machines: [{ name: "parse", icon: "p" }, { name: "count()", icon: "+", state: "n = 0" }], runs: [{ input: "hello", outputs: ["hello", "hello #1"], states: ["", "n = 1"] }] },
  curve: { kind: "curve", title: "Progress over time", series: [{ label: "tactical", shape: "tactical" }, { label: "strategic", shape: "strategic" }] },
  poll: { kind: "poll", question: "Which do you prefer?", options: [{ label: "this" }, { label: "that" }] },
  theater: { kind: "theater", title: "A reduction", term: "S K K x" },
  measure: { kind: "measure", title: "Before / after", before: "before", after: "after", rows: [{ metric: "methods", before: 10, after: 2 }] },
  versus: { kind: "versus", title: "Two positions", left: { name: "one side", points: ["a point"] }, right: { name: "the other", points: ["a point"] } }
}

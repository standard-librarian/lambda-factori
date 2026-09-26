/**
 * The deck format. A deck is plain JSON — a runtime plugin — decoded with
 * Schema, so a typo in a deck file becomes a readable error instead of a
 * crash. Every slide kind is a "mechanic" the engine knows how to animate.
 */
import { Schema } from "effect"

/** A string, or an array of lines (handy for code in JSON). */
const Lines = Schema.Union([Schema.String, Schema.Array(Schema.String)])
export const joinLines = (l: typeof Lines.Type | undefined): string =>
  l === undefined ? "" : typeof l === "string" ? l : l.join("\n")

const Sticky = Schema.Struct({
  text: Schema.String,
  color: Schema.optional(Schema.String),
  /** Where to stick it, in 1920×1080 design coordinates. Defaults to the top right. */
  x: Schema.optional(Schema.Number),
  y: Schema.optional(Schema.Number),
  /** Build step at which it appears (default: with the slide). */
  step: Schema.optional(Schema.Int)
})

const common = {
  title: Schema.optional(Schema.String),
  notes: Schema.optional(Lines),
  sticky: Schema.optional(Sticky)
}

const Title = Schema.Struct({
  kind: Schema.Literal("title"),
  ...common,
  subtitle: Schema.optional(Schema.String),
  byline: Schema.optional(Schema.String),
  date: Schema.optional(Schema.String)
})

const Section = Schema.Struct({
  kind: Schema.Literal("section"),
  ...common,
  number: Schema.optional(Schema.String),
  subtitle: Schema.optional(Schema.String),
  color: Schema.optional(Schema.String)
})

const Bullet = Schema.Union([
  Schema.String,
  Schema.Struct({ text: Schema.String, sub: Schema.optional(Schema.Array(Schema.String)), tag: Schema.optional(Schema.String) })
])

const Bullets = Schema.Struct({
  kind: Schema.Literal("bullets"),
  ...common,
  items: Schema.Array(Bullet),
  /** Reveal items one per step (default true). */
  build: Schema.optional(Schema.Boolean)
})

const Quote = Schema.Struct({
  kind: Schema.Literal("quote"),
  ...common,
  quote: Schema.String,
  by: Schema.String,
  source: Schema.optional(Schema.String)
})

const Speaker = Schema.Struct({ name: Schema.String, color: Schema.optional(Schema.String), initials: Schema.optional(Schema.String) })

const Dialogue = Schema.Struct({
  kind: Schema.Literal("dialogue"),
  ...common,
  /** One or two sentences of setup shown above the conversation. */
  context: Schema.optional(Schema.String),
  lines: Schema.Array(Schema.Struct({ who: Schema.String, text: Schema.String })),
  speakers: Schema.optional(Schema.Record(Schema.String, Speaker))
})

const Pane = Schema.Struct({
  label: Schema.String,
  code: Lines,
  /** Draw call arcs and hidden-state arcs between methods (Java-like code). */
  analyze: Schema.optional(Schema.Boolean),
  metrics: Schema.optional(Schema.Boolean)
})

const CodeStep = Schema.Struct({
  caption: Schema.optional(Schema.String),
  pane: Schema.optional(Schema.Int),
  /** 1-based line ranges to highlight, e.g. "3-9,12". */
  lines: Schema.optional(Schema.String),
  arcs: Schema.optional(Schema.Literals(["none", "calls", "state", "both"]))
})

const Code = Schema.Struct({
  kind: Schema.Literal("code"),
  ...common,
  panes: Schema.Array(Pane),
  steps: Schema.optional(Schema.Array(CodeStep))
})

const Modules = Schema.Struct({
  kind: Schema.Literal("modules"),
  ...common,
  modules: Schema.Array(Schema.Struct({
    name: Schema.String,
    /** Interface cost: what a caller must know (methods, params, rules). */
    interface: Schema.Number,
    /** Functionality hidden behind the interface. */
    functionality: Schema.Number,
    note: Schema.optional(Schema.String),
    color: Schema.optional(Schema.String)
  })),
  caption: Schema.optional(Schema.String)
})

const Factory = Schema.Struct({
  kind: Schema.Literal("factory"),
  ...common,
  modules: Schema.Array(Schema.Struct({
    name: Schema.String,
    ports: Schema.Array(Schema.String),
    /** How many machines work inside (revealed by the x-ray step). */
    inner: Schema.Int,
    /** Override the "N things to learn" label, e.g. "71 methods · 139 params". */
    count: Schema.optional(Schema.String),
    caption: Schema.optional(Schema.String),
    color: Schema.optional(Schema.String)
  })),
  caption: Schema.optional(Schema.String)
})

const Decisions = Schema.Struct({
  kind: Schema.Literal("decisions"),
  ...common,
  decisions: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String, color: Schema.optional(Schema.String) })),
  layouts: Schema.Array(Schema.Struct({
    label: Schema.String,
    modules: Schema.Array(Schema.Struct({
      name: Schema.String,
      knows: Schema.Array(Schema.String),
      /** Decisions it depends on without showing it: unknown unknowns, revealed only when they bite. */
      secretly: Schema.optional(Schema.Array(Schema.String)),
      /** How many units (files, services…) this card stands for; default 1. */
      count: Schema.optional(Schema.Int)
    }))
  })),
  changes: Schema.Array(Schema.Struct({ label: Schema.String, decision: Schema.String })),
  /** What the counter counts, e.g. "file" → "11 files to change". Default "module". */
  unit: Schema.optional(Schema.String),
  caption: Schema.optional(Schema.String)
})

const Curve = Schema.Struct({
  kind: Schema.Literal("curve"),
  ...common,
  xLabel: Schema.optional(Schema.String),
  yLabel: Schema.optional(Schema.String),
  series: Schema.Array(Schema.Struct({
    label: Schema.String,
    color: Schema.optional(Schema.String),
    shape: Schema.Literals(["tactical", "strategic", "linear"])
  })),
  caption: Schema.optional(Schema.String)
})

const Line = Schema.Struct({
  kind: Schema.Literal("line"),
  ...common,
  /** Stations along the belt, left to right. */
  machines: Schema.Array(Schema.Struct({
    name: Schema.String,
    /** Glyph on the machine's stamp (default: the name's first letter). */
    icon: Schema.optional(Schema.String),
    color: Schema.optional(Schema.String),
    /** Initial hidden state; the gauge stays padlocked until an x-ray run. */
    state: Schema.optional(Schema.String)
  })),
  /** One item down the line per step. */
  runs: Schema.Array(Schema.Struct({
    input: Schema.String,
    /** What leaves each machine, one per machine (omit to pass the item through). */
    outputs: Schema.optional(Schema.Array(Schema.String)),
    /** Hidden state per machine after this run ("" = unchanged). */
    states: Schema.optional(Schema.Array(Schema.String)),
    caption: Schema.optional(Schema.String),
    /** Open the gauges from this run on. */
    xray: Schema.optional(Schema.Boolean)
  })),
  caption: Schema.optional(Schema.String)
})

const Poll = Schema.Struct({
  kind: Schema.Literal("poll"),
  ...common,
  question: Schema.String,
  options: Schema.Array(Schema.Struct({ label: Schema.String, color: Schema.optional(Schema.String) }))
})

const Theater = Schema.Struct({
  kind: Schema.Literal("theater"),
  ...common,
  term: Schema.String,
  caption: Schema.optional(Schema.String)
})

const Measure = Schema.Struct({
  kind: Schema.Literal("measure"),
  ...common,
  before: Schema.String,
  after: Schema.String,
  rows: Schema.Array(Schema.Struct({
    metric: Schema.String,
    before: Schema.Number,
    after: Schema.Number,
    note: Schema.optional(Schema.String)
  })),
  caption: Schema.optional(Schema.String)
})

const Side = Schema.Struct({ name: Schema.String, color: Schema.optional(Schema.String), points: Schema.Array(Schema.String) })

const Versus = Schema.Struct({
  kind: Schema.Literal("versus"),
  ...common,
  left: Side,
  right: Side,
  agree: Schema.optional(Schema.Array(Schema.String))
})

/**
 * A slide contributed by a plugin mechanic. Its kind is namespaced
 * ("office/scene") so it can never shadow a core kind; its fields are kept
 * as-is and validated by the plugin that renders it.
 */
const Plugged = Schema.StructWithRest(
  Schema.Struct({ kind: Schema.String.check(Schema.isPattern(/^[a-z0-9-]+\/[a-z0-9-]+$/)), ...common }),
  [Schema.Record(Schema.String, Schema.Unknown)]
)
/** Plugged slides have namespaced kinds, which keeps `kind` narrowing exact for core slides. */
export interface PluggedSlide {
  readonly kind: `${string}/${string}`
  readonly title?: string | undefined
  readonly notes?: typeof Lines.Type | undefined
  readonly sticky?: typeof Sticky.Type | undefined
  readonly [field: string]: unknown
}

const Core = Schema.Union([
  Title, Section, Bullets, Quote, Dialogue, Code, Modules, Factory, Decisions, Line, Curve, Poll, Theater, Measure, Versus
])
export type Slide = typeof Core.Type | PluggedSlide

export const Slide = Schema.Union([Core, Plugged]) as unknown as Schema.Codec<Slide, typeof Core.Encoded | typeof Plugged.Encoded>
export type SlideOf<K extends Slide["kind"]> = Extract<Slide, { kind: K }>

export class Deck extends Schema.Class<Deck>("lambda-factori/deck/Deck")({
  id: Schema.String,
  title: Schema.String,
  subtitle: Schema.optional(Schema.String),
  author: Schema.optional(Schema.String),
  date: Schema.optional(Schema.String),
  slides: Schema.Array(Slide)
}) {}

export interface DeckMeta {
  readonly id: string
  readonly title: string
  readonly subtitle: string
  readonly slides: number
  /** True when the deck has local edits saved in this browser. */
  readonly edited: boolean
}

export const decodeDeck = Schema.decodeUnknownEffect(Deck)
export const DeckJson = Schema.fromJsonString(Deck)

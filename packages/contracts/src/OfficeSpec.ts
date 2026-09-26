import { Schema } from "effect"

const Value = Schema.Union([Schema.Number, Schema.String])

/** An office scene: the room, its desks and tiles, and the worker's program. */
export const OfficeSpec = Schema.Struct({
  kind: Schema.Literal("office/scene"),
  title: Schema.optional(Schema.String),
  caption: Schema.optional(Schema.String),
  /** HRM-format program: one command per line, `name:` for labels, `PAUSE` for presentation beats. */
  program: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
  inbox: Schema.optional(Schema.Array(Value)),
  /** Expected outbox; when given, the boss checks the result like HRM. */
  expect: Schema.optional(Schema.Array(Value)),
  tiles: Schema.optional(Schema.Array(Schema.Struct({ id: Schema.String, value: Schema.optional(Value), label: Schema.optional(Schema.String) }))),
  desks: Schema.optional(Schema.Array(Schema.Struct({
    id: Schema.String,
    label: Schema.optional(Schema.String),
    color: Schema.optional(Schema.String),
    /** What WORK does here: "set:<v>", "stamp:<text>", "double", "inc". */
    work: Schema.optional(Schema.String),
    /** What VISIT hands over. */
    gives: Schema.optional(Value),
    /** A quip the clerk says when visited. */
    says: Schema.optional(Schema.String),
    x: Schema.optional(Schema.Number),
    y: Schema.optional(Schema.Number)
  }))),
  worker: Schema.optional(Schema.Struct({ style: Schema.optional(Schema.Int) })),
  boss: Schema.optional(Schema.Struct({ intro: Schema.optional(Schema.String), success: Schema.optional(Schema.String) })),
  stats: Schema.optional(Schema.Array(Schema.Literals(["steps", "size", "trips", "head"]))),
  speed: Schema.optional(Schema.Number),
  night: Schema.optional(Schema.Boolean),
  hideProgram: Schema.optional(Schema.Boolean),
  /** Play the whole room on arrival (default). false: each PAUSE is a → press. */
  autoplay: Schema.optional(Schema.Boolean),
  notes: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.String)]))
})
export type OfficeSpec = typeof OfficeSpec.Type

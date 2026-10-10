/**
 * What a request asks the system to do, one step at a time. A request type is an ordered list
 * of ops; a component serves some ops (see `Catalogue.ts`), and a token moves from machine to
 * machine until its ops are done. Hides nothing but the vocabulary: the schema and the names
 * every other module agrees on.
 */
import { Schema } from "effect"

/** Numbers the sim divides by or loops on must be finite and above 0, or it would hang or divide by zero. */
export const Positive = Schema.Finite.check(Schema.isGreaterThan(0))
export const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))
/** Rates, multipliers and durations that may be 0 but never negative or infinite. */
export const NonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))

/** Ids are lowercase kebab-case so they survive URLs, JSON keys and CSS classes unchanged. */
export const Id = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*$/))
export type Id = typeof Id.Type

/**
 * Fields every op shares.
 * - `optional`: when no wired component can serve this op, skip it instead of failing the
 *   request (background work such as a feed fan-out that a simple design just doesn't do).
 * - `amp`: how many units of work one request makes the serving machine do (a fan-out of 100
 *   followers is a push with `amp: 100`).
 */
const shared = { optional: Schema.optional(Schema.Boolean), amp: Schema.optional(NonNegative) }

export const Op = Schema.Union([
  /** CPU work. `ms` is pure latency added on top of the queueing at whichever machine serves it. */
  Schema.Struct({ do: Schema.Literal("compute"), ms: NonNegative, ...shared }),
  Schema.Struct({
    do: Schema.Literal("read"),
    dataset: Id,
    consistency: Schema.Literals(["strong", "eventual"]),
    ...shared
  }),
  Schema.Struct({ do: Schema.Literal("write"), dataset: Id, ...shared }),
  /** Ends the client's latency at the queue's ack; the batch carries on as background work. */
  Schema.Struct({ do: Schema.Literal("enqueue"), topic: Id, ...shared }),
  /** Write one request's worth of data to many inboxes (`amp` of them). */
  Schema.Struct({ do: Schema.Literal("push"), channel: Id, ...shared }),
  Schema.Struct({ do: Schema.Literal("geo"), dataset: Id, ...shared }),
  Schema.Struct({ do: Schema.Literal("lock"), resource: Id, ...shared })
])
export type Op = typeof Op.Type

/** The op names a component can serve, derived from `Op` so the two can't drift apart. */
export type OpName = Op["do"]

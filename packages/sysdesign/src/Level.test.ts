/**
 * Pins what a level may say about itself: Schema refuses numbers the sim would hang or divide by
 * zero on, and `check` reports component settings that don't match their kind's schema.
 */
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { configure } from "./Design.ts"
import { check, Level } from "./Level.ts"
import { levels } from "./levels.ts"

const bitly = levels.find((l) => l.id === "bitly")!
const decode = Schema.decodeUnknownSync(Level)

describe("positive numbers", () => {
  it("rejects a token that stands for no requests", () => {
    expect(() => decode({ ...bitly, rpsPerToken: 0 })).toThrow()
    expect(() => decode({ ...bitly, rpsPerToken: -1 })).toThrow()
    expect(() => decode({ ...bitly, rpsPerToken: Number.POSITIVE_INFINITY })).toThrow()
    expect(decode({ ...bitly, rpsPerToken: 1 }).rpsPerToken).toBe(1)
  })

  it("rejects a stage with no duration, and sizes the sim divides by", () => {
    const stages = (durationMs: number) => ({ ...bitly.stages, build: { ...bitly.stages.build, durationMs } })
    expect(() => decode({ ...bitly, stages: stages(0) })).toThrow()
    expect(() => decode({ ...bitly, stages: stages(Number.NaN) })).toThrow()
    expect(() => decode({ ...bitly, datasets: [{ ...bitly.datasets[0]!, objectKb: 0 }] })).toThrow()
    expect(() => decode({ ...bitly, datasets: [{ ...bitly.datasets[0]!, keys: 0 }] })).toThrow()
    expect(() => decode({ ...bitly, datasets: [{ ...bitly.datasets[0]!, fanin: 0 }] })).toThrow()
  })
})

describe("config values", () => {
  const problemsWith = (id: string, patch: Record<string, number | string>) =>
    check({ ...bitly, reference: configure(bitly.reference, id, patch) })

  it("are decoded against the kind's schema", () => {
    expect(problemsWith("api", { instances: "many" })).toEqual([expect.stringContaining("api")])
    expect(problemsWith("urls-db", { partitionKey: "unifrom" })).toEqual([expect.stringContaining("urls-db")])
    expect(problemsWith("urls-db", { shards: "x" })).toEqual([expect.stringContaining("urls-db")])
    expect(problemsWith("api", { instances: 0 })).toHaveLength(1)
    expect(problemsWith("api", { instances: 3 })).toEqual([])
  })
})

/**
 * How a request type's rate moves over a stage: the multiplier on its base rps at time `tMs`
 * of a stage that lasts `durationMs`. Pure, and separate from the sim so the editor can draw
 * the same curve it plays.
 */
import type { Traffic } from "./Level.ts"

export const trafficAt = (traffic: Traffic, tMs: number, durationMs: number): number => {
  switch (traffic.shape) {
    case "steady":
      return 1
    case "ramp":
      return traffic.fromX + (1 - traffic.fromX) * Math.min(1, tMs / durationMs)
    case "spike":
      return tMs >= traffic.atMs && tMs < traffic.atMs + traffic.forMs ? traffic.x : 1
    case "diurnal":
      return 1 + (traffic.peakX - 1) * 0.5 * (1 - Math.cos((2 * Math.PI * tMs) / durationMs))
  }
}

/**
 * The simulation's one source of randomness: xoshiro128** (four 32-bit words), seeded through
 * splitmix32. State is a plain object so a snapshot can clone it; `nextFloat` mutates it, so a
 * sim owns exactly one `Rng` and nothing else draws from it. Also samples Zipf-skewed keys,
 * because key skew is what makes caches and shards behave unlike a uniform world.
 */

/** Plain data: four unsigned 32-bit words. */
export interface Rng {
  readonly s: [number, number, number, number]
}

const splitmix32 = (seed: number): (() => number) => {
  let a = seed | 0
  return () => {
    a = (a + 0x9e3779b9) | 0
    let z = a
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
    return (z ^ (z >>> 16)) >>> 0
  }
}

export const makeRng = (seed: number): Rng => {
  const next = splitmix32(seed)
  return { s: [next(), next(), next(), next()] }
}

const rotl = (x: number, k: number): number => (x << k) | (x >>> (32 - k))

/** A uniform float in [0, 1). Advances `rng`. */
export const nextFloat = (rng: Rng): number => {
  const s = rng.s
  const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0
  const t = s[1] << 9
  s[2] ^= s[0]
  s[3] ^= s[1]
  s[1] ^= s[2]
  s[0] ^= s[3]
  s[2] ^= t
  s[3] = rotl(s[3], 11)
  return result / 4294967296
}

/**
 * A 0-based rank (0 is the hottest key) drawn from a Zipf law with exponent `skew` over `keys`
 * distinct keys, using the continuous inverse CDF so it costs O(1) for any key count.
 */
export const zipfRank = (rng: Rng, keys: number, skew: number): number => {
  const u = nextFloat(rng)
  const upper = keys + 1
  const x = Math.abs(skew - 1) < 1e-6
    ? Math.pow(upper, u)
    : Math.pow(1 + u * (Math.pow(upper, 1 - skew) - 1), 1 / (1 - skew))
  return Math.min(keys - 1, Math.max(0, Math.floor(x) - 1))
}

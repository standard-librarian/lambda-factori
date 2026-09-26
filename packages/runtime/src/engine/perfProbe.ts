/**
 * Opt-in frame statistics for measuring inside embedded webviews (Capacitor,
 * Expo), where there are no dev tools to hand: open the app with `?perf` in the
 * URL and every two seconds a `[lf-perf]` line goes to the console, which the
 * native shells forward to their logs.
 */
export const perfProbe = () => {
  if (typeof location === "undefined" || !new URLSearchParams(location.search).has("perf")) return undefined
  let frames: Array<number> = []
  let renders = 0
  let last = performance.now()
  let windowStart = last
  return {
    frame: (rendered: boolean) => {
      const now = performance.now()
      frames.push(now - last)
      last = now
      if (rendered) renders++
      if (now - windowStart < 2000) return
      const sorted = [...frames].sort((a, b) => a - b)
      const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!.toFixed(1)
      const fps = (frames.length * 1000) / (now - windowStart)
      console.log(`[lf-perf] route=${location.hash || "#/"} fps=${fps.toFixed(1)} p50=${pick(0.5)}ms p95=${pick(0.95)}ms max=${pick(1)}ms renders=${renders}`)
      frames = []
      renders = 0
      windowStart = now
    }
  }
}

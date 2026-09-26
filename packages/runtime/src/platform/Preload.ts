/**
 * Early JSON fetches, started at boot before the renderer is up. A service that
 * later asks for the same URL takes the in-flight request instead of refetching.
 */
const early = new Map<string, Promise<unknown>>()

const get = (url: string): Promise<unknown> =>
  fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))

export const preloadJson = (url: string) => {
  if (early.has(url)) return
  const p = get(url)
  p.catch(() => {}) // a failed preload is reported by whoever takes it
  early.set(url, p)
}

/** Fetch JSON, reusing (once) a preload of the same URL. */
export const fetchJson = (url: string): Promise<unknown> => {
  const p = early.get(url)
  if (!p) return get(url)
  early.delete(url)
  return p
}

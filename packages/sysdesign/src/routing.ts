/**
 * Which component a token may go to next. Hides the graph search: for every (component,
 * request type, op index) it precomputes the wired successors that can still make progress on
 * that op, direct servers first, otherwise strictly closer to one. Pure and built once per (level, design); the sim only looks
 * entries up. Clients and exits are never routed to.
 */
import { catalogue } from "./Catalogue.ts"
import type { Design, Level } from "./Level.ts"

export interface Routes {
  /** Component indexes (into `design.components`) a token of `type` at op `op` may leave `from` for. */
  readonly next: (from: number, type: number, op: number) => ReadonlyArray<number>
}

export const buildRoutes = (level: Level, design: Design): Routes => {
  const index = new Map(design.components.map((c, i) => [c.id, i]))
  const out: Array<Array<{ to: number; only: ReadonlyArray<string> | undefined }>> = design.components.map(() => [])
  for (const w of design.wires) {
    const from = index.get(w.from)
    const to = index.get(w.to)
    if (from !== undefined && to !== undefined) out[from]!.push({ to, only: w.only })
  }
  const routable = (i: number): boolean => {
    const kind = design.components[i]!.kind
    return kind !== "client" && kind !== "exit"
  }
  const serves = (i: number, type: number, op: number): boolean =>
    level.requests[type]!.ops[op]!.do in catalogue[design.components[i]!.kind].serves
  const successors = (from: number, type: number): ReadonlyArray<number> =>
    out[from]!.filter((e) => routable(e.to) && (e.only === undefined || e.only.includes(level.requests[type]!.id))).map((e) => e.to)

  // Hops to the nearest machine that serves each op, by breadth-first search backwards from the
  // servers. A hop must come strictly closer, so no cycle of wires can keep a token circling.
  const hopsToServer = (type: number, op: number): ReadonlyArray<number> => {
    const hops = design.components.map((_, i) => (routable(i) && serves(i, type, op) ? 0 : Infinity))
    for (let frontier = hops.flatMap((h, i) => (h === 0 ? [i] : [])); frontier.length > 0;) {
      const next: Array<number> = []
      for (const to of frontier) {
        design.components.forEach((_, from) => {
          if (hops[from] === Infinity && successors(from, type).includes(to)) {
            hops[from] = hops[to]! + 1
            next.push(from)
          }
        })
      }
      frontier = next
    }
    return hops
  }

  const table = new Map<string, ReadonlyArray<number>>()
  level.requests.forEach((r, type) => {
    r.ops.forEach((_, op) => {
      const hops = hopsToServer(type, op)
      design.components.forEach((_, c) => {
        // A server itself (after a cache miss, say) may pass on to any server that can still be reached.
        const ok = successors(c, type).filter((n) => hops[n]! < Infinity && (hops[c] === 0 || hops[n]! < hops[c]!))
        const direct = ok.filter((n) => hops[n] === 0)
        table.set(`${c}/${type}/${op}`, direct.length > 0 ? direct : ok)
      })
    })
  })
  return { next: (from, type, op) => table.get(`${from}/${type}/${op}`) ?? [] }
}

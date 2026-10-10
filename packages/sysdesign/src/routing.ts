/**
 * Which component a token may go to next. Hides the graph search: for every (component,
 * request type, op index) it precomputes the wired successors that can still make progress on
 * that op, direct servers first. Pure and built once per (level, design); the sim only looks
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

  const memo = new Map<string, boolean>()
  const canFinish = (c: number, type: number, op: number, seen: Set<number>): boolean => {
    if (serves(c, type, op)) return true
    const key = `${c}/${type}/${op}`
    const cached = memo.get(key)
    if (cached !== undefined) return cached
    if (seen.has(c)) return false
    seen.add(c)
    const ok = successors(c, type).some((n) => canFinish(n, type, op, seen))
    seen.delete(c)
    if (ok) memo.set(key, true)
    return ok
  }

  const table = new Map<string, ReadonlyArray<number>>()
  for (let c = 0; c < design.components.length; c++) {
    level.requests.forEach((r, type) => {
      r.ops.forEach((_, op) => {
        const ok = successors(c, type).filter((n) => canFinish(n, type, op, new Set([c])))
        const direct = ok.filter((n) => serves(n, type, op))
        table.set(`${c}/${type}/${op}`, direct.length > 0 ? direct : ok)
      })
    })
  }
  return { next: (from, type, op) => table.get(`${from}/${type}/${op}`) ?? [] }
}

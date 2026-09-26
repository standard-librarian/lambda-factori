/**
 * The factory floor: a grid of cells holding buildings and the wires between
 * their ports. Everything here is pure; edits return a new board.
 */
import { MinHeap } from "./MinHeap.ts"

export interface Cell {
  readonly col: number
  readonly row: number
}

export type BuildingKind = "source" | "apply" | "bin"
export type PortName = "out" | "f" | "x" | "in"

export interface Building {
  readonly id: number
  readonly kind: BuildingKind
  readonly col: number
  readonly row: number
  /** For sources: the atom emitted. */
  readonly atom?: string
  /** For bins: index into the level's targets. */
  readonly target?: number
}

export interface PortRef {
  readonly building: number
  readonly port: PortName
}

export interface Wire {
  readonly id: number
  readonly from: number
  readonly to: PortRef
  readonly path: ReadonlyArray<Cell>
}

export interface Board {
  readonly cols: number
  readonly rows: number
  readonly buildings: ReadonlyArray<Building>
  readonly wires: ReadonlyArray<Wire>
  readonly nextId: number
}

export const COLS = 40
export const ROWS = 25
export const WIDTH = 3
export const HEIGHT = 2

export const cellKey = (c: Cell) => c.row * 1000 + c.col

export const inputsOf = (kind: BuildingKind): ReadonlyArray<PortName> =>
  kind === "apply" ? ["f", "x"] : kind === "bin" ? ["in"] : []

export const hasOutput = (kind: BuildingKind) => kind !== "bin"

/** Ports sit on the cell just outside the building: outputs above, inputs below. */
export const portCell = (b: Building, port: PortName): Cell => {
  switch (port) {
    case "out":
      return { col: b.col + 1, row: b.row - 1 }
    case "f":
      return { col: b.col, row: b.row + HEIGHT }
    case "x":
      return { col: b.col + 2, row: b.row + HEIGHT }
    case "in":
      return { col: b.col + 1, row: b.row + HEIGHT }
  }
}

export const footprint = (b: Pick<Building, "col" | "row">): ReadonlyArray<Cell> => {
  const cells: Array<Cell> = []
  for (let r = 0; r < HEIGHT; r++) for (let c = 0; c < WIDTH; c++) cells.push({ col: b.col + c, row: b.row + r })
  return cells
}

const blockedCells = (board: Board, except?: number): Set<number> => {
  const set = new Set<number>()
  for (const b of board.buildings) if (b.id !== except) for (const c of footprint(b)) set.add(cellKey(c))
  return set
}

export const emptyBoard = (targets: number): Board => {
  const span = targets * (WIDTH + 1) - 1
  const start = Math.floor((COLS - span) / 2)
  const bins: Array<Building> = Array.from({ length: targets }, (_, i) => ({
    id: i + 1,
    kind: "bin",
    col: start + i * (WIDTH + 1),
    row: 1,
    target: i
  }))
  return { cols: COLS, rows: ROWS, buildings: bins, wires: [], nextId: targets + 1 }
}

export const buildingAt = (board: Board, cell: Cell): Building | undefined =>
  board.buildings.find((b) => cell.col >= b.col && cell.col < b.col + WIDTH && cell.row >= b.row && cell.row < b.row + HEIGHT)

export const inBounds = (board: Board, c: Cell) => c.col >= 0 && c.row >= 0 && c.col < board.cols && c.row < board.rows

export const canPlace = (board: Board, kind: BuildingKind, col: number, row: number, except?: number): boolean => {
  // Keep a margin below the bins so their inputs stay reachable.
  if (row < 4) return false
  const probe = { id: -1, kind, col, row }
  const blocked = blockedCells(board, except)
  const otherPorts = new Set(
    board.buildings.filter((b) => b.id !== except).flatMap((b) => portsOf(b).map((p) => cellKey(portCell(b, p))))
  )
  const ports = portsOf(probe).map((p) => portCell(probe, p))
  return (
    footprint(probe).every((c) => inBounds(board, c) && !blocked.has(cellKey(c)) && !otherPorts.has(cellKey(c))) &&
    ports.every((c) => inBounds(board, c) && !blocked.has(cellKey(c)))
  )
}

export const portsOf = (b: Pick<Building, "kind">): ReadonlyArray<PortName> => [
  ...inputsOf(b.kind),
  ...(hasOutput(b.kind) ? (["out"] as const) : [])
]

// ---------------------------------------------------------------------------
// Routing: Dijkstra over grid cells, penalising turns so wires come out tidy.
// ---------------------------------------------------------------------------

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
] as const


export const route = (
  board: Board,
  from: Cell,
  to: Cell,
  avoid: ReadonlyArray<Cell> = []
): ReadonlyArray<Cell> | undefined => {
  const blocked = blockedCells(board)
  for (const c of avoid) blocked.add(cellKey(c))
  if (blocked.has(cellKey(from)) || blocked.has(cellKey(to))) return undefined
  type Node = { cell: Cell; dir: number; cost: number; prev: Node | undefined }
  const best = new Map<number, number>()
  const open = new MinHeap<Node>((n) => n.cost)
  open.push({ cell: from, dir: -1, cost: 0, prev: undefined })
  while (open.size > 0) {
    const node = open.pop()!
    if (node.cell.col === to.col && node.cell.row === to.row) {
      const path: Array<Cell> = []
      for (let n: Node | undefined = node; n; n = n.prev) path.push(n.cell)
      return path.reverse()
    }
    const key = cellKey(node.cell) * 5 + node.dir + 1
    if ((best.get(key) ?? Infinity) < node.cost) continue
    DIRS.forEach(([dc, dr], dir) => {
      const cell = { col: node.cell.col + dc, row: node.cell.row + dr }
      if (!inBounds(board, cell) || blocked.has(cellKey(cell))) return
      const cost = node.cost + 1 + (node.dir !== -1 && node.dir !== dir ? 0.6 : 0)
      const k = cellKey(cell) * 5 + dir + 1
      if ((best.get(k) ?? Infinity) <= cost) return
      best.set(k, cost)
      open.push({ cell, dir, cost, prev: node })
    })
  }
  return undefined
}

/**
 * Route between two ports, preferring to leave an output straight up and to
 * enter an input straight from below, so wires never skim across building icons.
 */
export const routePorts = (board: Board, from: Cell, to: Cell): ReadonlyArray<Cell> | undefined => {
  const up = { col: from.col, row: from.row - 1 }
  const down = { col: to.col, row: to.row + 1 }
  const blocked = blockedCells(board)
  const free = (c: Cell) => inBounds(board, c) && !blocked.has(cellKey(c))
  const far = Math.abs(from.col - to.col) + Math.abs(from.row - to.row) > 2
  if (far && free(up) && free(down)) {
    const inner = route(board, up, down, [from, to])
    if (inner) return [from, ...inner, to]
  }
  return route(board, from, to)
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

export const place = (board: Board, kind: BuildingKind, col: number, row: number, atom?: string): Board => {
  if (!canPlace(board, kind, col, row)) return board
  const b: Building = { id: board.nextId, kind, col, row, ...(atom === undefined ? {} : { atom }) }
  return reroute({ ...board, buildings: [...board.buildings, b], nextId: board.nextId + 1 })
}

export const move = (board: Board, id: number, col: number, row: number): Board => {
  const b = board.buildings.find((x) => x.id === id)
  if (!b || b.kind === "bin" || !canPlace(board, b.kind, col, row, id)) return board
  return reroute({ ...board, buildings: board.buildings.map((x) => (x.id === id ? { ...x, col, row } : x)) })
}

export const remove = (board: Board, id: number): Board => {
  const b = board.buildings.find((x) => x.id === id)
  if (!b || b.kind === "bin") return board
  return {
    ...board,
    buildings: board.buildings.filter((x) => x.id !== id),
    wires: board.wires.filter((w) => w.from !== id && w.to.building !== id)
  }
}

export const removeWire = (board: Board, id: number): Board => ({
  ...board,
  wires: board.wires.filter((w) => w.id !== id)
})

export const connect = (board: Board, from: number, to: PortRef): Board => {
  const src = board.buildings.find((b) => b.id === from)
  const dst = board.buildings.find((b) => b.id === to.building)
  if (!src || !dst || src.id === dst.id || !hasOutput(src.kind) || !inputsOf(dst.kind).includes(to.port)) return board
  const path = routePorts(board, portCell(src, "out"), portCell(dst, to.port))
  if (!path) return board
  // An input accepts a single wire; the newest connection replaces the old one.
  const wires = board.wires.filter((w) => !(w.to.building === to.building && w.to.port === to.port))
  return { ...board, wires: [...wires, { id: board.nextId, from, to, path }], nextId: board.nextId + 1 }
}

/** Re-route every wire after buildings moved; wires that no longer fit are dropped. */
export const reroute = (board: Board): Board => {
  const wires: Array<Wire> = []
  for (const w of board.wires) {
    const src = board.buildings.find((b) => b.id === w.from)
    const dst = board.buildings.find((b) => b.id === w.to.building)
    if (!src || !dst) continue
    const path = routePorts(board, portCell(src, "out"), portCell(dst, w.to.port))
    if (path) wires.push({ ...w, path })
  }
  return { ...board, wires }
}

export const wireAt = (board: Board, cell: Cell): Wire | undefined =>
  [...board.wires].reverse().find((w) => w.path.some((c) => c.col === cell.col && c.row === cell.row))

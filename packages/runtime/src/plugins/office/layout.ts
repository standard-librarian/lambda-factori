/** Where things sit in an office room, in slide coordinates (the program strip starts at `PANEL_X`). */

export interface Pt {
  readonly x: number
  readonly y: number
}

export const ROOM_W = 1400
export const ROOM_H = 1080
export const PANEL_X = 1400
/** The walkable floor inside the walls. */
export const FLOOR = { fx: 150, fy: 170, fw: 1100 }
export const IN_X = 228
export const OUT_X = 1172
export const BELT_TOP = 400
/** Vertical distance between boxes on a belt. */
export const SLOT = 74
/** Where the worker stands to use the inbox / outbox belts. */
export const IN_SPOT: Pt = { x: 322, y: 470 }
export const OUT_SPOT: Pt = { x: 1078, y: 470 }
/** The worker's drawing scale. */
export const WORKER_SCALE = 1.25

export const inSlot = (i: number): Pt => ({ x: IN_X, y: BELT_TOP + i * SLOT })
export const outSlot = (i: number): Pt => ({ x: OUT_X, y: BELT_TOP + i * SLOT })

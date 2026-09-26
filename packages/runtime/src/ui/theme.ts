/** Palette sampled from Word Factori's light theme, plus layout constants. */
export const palette = {
  paper: 0xf1ece3,
  grid: 0xe2dbd0,
  gridMajor: 0xd6cec2,
  tray: 0xd6cab4,
  trayShade: 0xc5b89f,
  skyline: 0xe0d6c4,
  wire: 0xa6b6d5,
  wireShade: 0x8d9ec2,
  token: 0x7492cb,
  bin: 0x7492cb,
  binShade: 0x5872a8,
  binDark: 0x20234b,
  portIn: 0x01cbfe,
  portOut: 0xf76a7a,
  red: 0xac1b2b,
  redShade: 0x73000b,
  blue: 0x306db5,
  yellow: 0xf7bd57,
  green: 0x4cc887,
  greenShade: 0x399871,
  ink: 0x20234b,
  inkSoft: 0x5b5f7d,
  white: 0xffffff,
  cream: 0xf7f3ec,
  bad: 0xe0485a
} as const

export const FONT = "Fredoka, BQN386, sans-serif"
/** BQN386 (dzaima, public domain) covers every APL and BQN glyph. */
export const APL_FONT = "BQN386, Fredoka, sans-serif"

export const DESIGN_W = 1920
export const DESIGN_H = 1080
export const CELL = 40
export const BOARD_W = 1600

export const TICK_MS = 240
export const FAST_FACTOR = 4

/**
 * The office's colours (a warm, dim room seen from above, as in Human Resource
 * Machine), and the two colour helpers the office art shares.
 */

export const office = {
  floor: 0xc58967,
  floorAlt: 0xbd7f5d,
  rug: 0x9b6742,
  rugLine: 0x8a5a38,
  wallBack: 0x5e3b29,
  wallLeft: 0x8b5940,
  wallRight: 0x4b2b1c,
  plank: 0x00000,
  light: 0xffc49a,
  lightCore: 0xffe2c4,
  frame: 0x403229,
  belt: 0x4a382e,
  beltEdge: 0x2c211b,
  sign: 0xd9c7a7,
  signInk: 0x3b2e25,
  box: 0x9ec75f,
  boxTop: 0xbadc80,
  boxShade: 0x74973f,
  boxInk: 0x33421a,
  letter: 0xa9b3e2,
  letterShade: 0x7f89c2,
  letterInk: 0x282c5e,
  paper: 0xbda388,
  paperLight: 0xdcd6b4,
  gutter: 0xa9907c,
  lineNo: 0x7a685a,
  cmdIo: 0x9ec75f,
  cmdIoInk: 0x3f4f1d,
  cmdCopy: 0xd1655b,
  cmdCopyInk: 0x4a2419,
  cmdMath: 0xd9a06c,
  cmdMathInk: 0x4f3219,
  cmdJump: 0x8d8dc1,
  cmdJumpInk: 0x2f3150,
  cmdTalk: 0xe8dcc4,
  cmdTalkInk: 0x4b3f33,
  cmdDesk: 0x6fb0b8,
  cmdDeskInk: 0x173c40,
  arrow: 0x8d8dc1,
  bubble: 0xf3ead8,
  bubbleInk: 0x3b3530,
  skin: 0xf0d2b8,
  skinShade: 0xd9b394,
  ink: 0x1e1a18,
  bad: 0xd94a3d,
  good: 0x7fb24a
} as const
export const mix = (a: number, b: number, k: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

export const shadeOf = (c: number, k: number) =>
  (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k)

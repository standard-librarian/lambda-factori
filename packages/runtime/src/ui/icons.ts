/** Button icons, drawn with Graphics in white on a 30×30 box around the origin. */
import { Graphics } from "pixi.js"
import { palette } from "./theme.ts"

export const icons = {
  play: (g: Graphics) => g.poly([-9, -13, 14, 0, -9, 13]).fill(palette.white),
  fast: (g: Graphics) => g.poly([-16, -12, 0, 0, -16, 12]).poly([0, -12, 16, 0, 0, 12]).fill(palette.white),
  pause: (g: Graphics) => g.roundRect(-11, -13, 8, 26, 3).roundRect(3, -13, 8, 26, 3).fill(palette.white),
  stop: (g: Graphics) => g.roundRect(-11, -11, 22, 22, 4).fill(palette.white),
  menu: (g: Graphics) => g.roundRect(-13, -11, 26, 5, 2).roundRect(-13, -2, 26, 5, 2).roundRect(-13, 7, 26, 5, 2).fill(palette.white),
  back: (g: Graphics) => g.poly([4, -12, -8, 0, 4, 12], false).stroke({ width: 5, color: palette.white, cap: "round", join: "round" }),
  forward: (g: Graphics) => g.poly([-4, -12, 8, 0, -4, 12], false).stroke({ width: 5, color: palette.white, cap: "round", join: "round" }),
  book: (g: Graphics) =>
    g.roundRect(-14, -11, 13, 22, 3).roundRect(1, -11, 13, 22, 3).fill(palette.white).rect(-1, -11, 2, 22).fill(
      palette.ink
    ),
  restart: (g: Graphics) =>
    g.arc(0, 0, 12, -Math.PI * 0.35, Math.PI * 1.35).stroke({ width: 5, color: palette.white, cap: "round" })
      .poly([7, -17, 14, -6, 3, -5]).fill(palette.white),
  close: (g: Graphics) =>
    g.moveTo(-10, -10).lineTo(10, 10).moveTo(10, -10).lineTo(-10, 10).stroke({ width: 5, color: palette.white, cap: "round" }),
  eye: (g: Graphics) =>
    g.ellipse(0, 0, 15, 10).stroke({ width: 4, color: palette.white }).circle(0, 0, 4.5).fill(palette.white),
  pencil: (g: Graphics) =>
    g.poly([-12, 12, -9, 3, 6, -12, 12, -6, -3, 9]).fill(palette.white).poly([-12, 12, -9, 3, -3, 9]).fill(0x20234b),
  scroll: (g: Graphics) =>
    g.roundRect(-11, -14, 22, 28, 3).fill(palette.white)
      .rect(-6, -7, 12, 2.5).rect(-6, -1, 12, 2.5).rect(-6, 5, 8, 2.5).fill(0xc8902c),
  star: (g: Graphics) => g.star(0, 0, 5, 14, 6).fill(palette.white),
  hint: (g: Graphics) => g.circle(0, 0, 13).stroke({ width: 4, color: palette.white }).circle(0, 6, 2).fill(palette.white).rect(-1.5, -7, 3, 9).fill(palette.white)
}

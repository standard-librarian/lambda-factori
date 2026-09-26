/**
 * Headless play-tester: runs a list of actions (in 1920×1080 design coordinates)
 * against the dev server and saves screenshots. Uses a persistent profile so
 * saved boards and progress carry over between runs.
 *
 *   node scripts/drive.ts '[{"shot":"menu"},{"click":[280,330]},{"wait":600},{"shot":"level"}]'
 */
import { chromium } from "playwright"

type Action =
  | { click: [number, number]; button?: "left" | "right" }
  | { drag: [[number, number], [number, number]] }
  | { wait: number }
  | { key: string }
  | { shot: string }
  | { eval: string }

const actions: Array<Action> = JSON.parse(process.argv[2] ?? "[]")
const url = process.env.URL ?? "http://localhost:5317/"
const out = process.env.OUT ?? "/tmp/wf/shots"
const W = Number(process.env.VW ?? 1440)
const H = Number(process.env.VH ?? 810)
const s = Math.min(W / 1920, H / 1080)
const at = ([x, y]: [number, number]) => [x * s, y * s] as const

const ctx = await chromium.launchPersistentContext(process.env.PROFILE ?? "/tmp/wf/profile", {
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  // VIDEO=<dir> records the run as a .webm (for README media).
  ...(process.env.VIDEO ? { recordVideo: { dir: process.env.VIDEO, size: { width: W, height: H } } } : {}),
  // Use the real GPU so frame timings mean something (headless defaults to software GL).
  args: (process.env.CHROME_ARGS ?? "--use-angle=metal --enable-gpu-rasterization --ignore-gpu-blocklist").split(" ")
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log(`[${m.type()}]`, m.text()))
page.on("pageerror", (e) => console.log("[pageerror]", e.message))
// THROTTLE=4 emulates a slower CPU (Chrome DevTools' CPU throttling), for performance work.
if (process.env.THROTTLE) {
  const cdp = await ctx.newCDPSession(page)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.THROTTLE) })
}
// LATENCY=80 adds round-trip latency (ms) to every request, like a real network.
if (process.env.LATENCY) {
  const cdp = await ctx.newCDPSession(page)
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: Number(process.env.LATENCY), downloadThroughput: -1, uploadThroughput: -1 })
  await page.reload()
}
await page.goto(url)
await page.waitForTimeout(1200)

for (const a of actions) {
  if ("click" in a) {
    const [x, y] = at(a.click)
    await page.mouse.click(x, y, { button: a.button ?? "left" })
    await page.waitForTimeout(250)
  } else if ("drag" in a) {
    const [x1, y1] = at(a.drag[0])
    const [x2, y2] = at(a.drag[1])
    await page.mouse.move(x1, y1)
    await page.mouse.down()
    for (let i = 1; i <= 12; i++) await page.mouse.move(x1 + ((x2 - x1) * i) / 12, y1 + ((y2 - y1) * i) / 12)
    await page.mouse.up()
    await page.waitForTimeout(250)
  } else if ("wait" in a) {
    await page.waitForTimeout(a.wait)
  } else if ("key" in a) {
    await page.keyboard.press(a.key)
  } else if ("eval" in a) {
    console.log(JSON.stringify(await page.evaluate(a.eval)))
  } else {
    await page.screenshot({ path: `${out}/${a.shot}.png` })
    console.log(`saved ${out}/${a.shot}.png`)
  }
}
await ctx.close()

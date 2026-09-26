/**
 * Capacitor's `server.appStartPath` must name a file, so it can't carry a query
 * or a hash route. For measurement builds, LF_START="?perf#/deck/…" writes a
 * one-line redirect page into the bundled web build and the app starts there.
 */
import { writeFileSync } from "node:fs"

const start = process.env.LF_START
if (start) {
  const target = `index.html${start.startsWith("?") || start.startsWith("#") ? start : `#${start}`}`
  writeFileSync(new URL("../../web/dist/lf-start.html", import.meta.url), `<!doctype html><script>location.replace(${JSON.stringify(target)})</script>\n`)
  console.log(`start page → ${target}`)
}

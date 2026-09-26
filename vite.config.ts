import type { Plugin } from "vite"
import { defineConfig } from "vitest/config"

/**
 * Preload the UI font files from index.html. Their names are content-hashed at build
 * time, so the links are injected from the bundle; without them the browser only finds
 * the fonts once the app's JavaScript has run.
 */
const preloadFonts = (): Plugin => {
  let base = "/"
  return {
    name: "lambda-factori:preload-fonts",
    configResolved: (config) => void (base = config.base),
    transformIndexHtml: {
      order: "post",
      handler: (_html, ctx) =>
        Object.keys(ctx.bundle ?? {})
          .filter((f) => /fredoka-latin-(500|600|700)-normal-[^/]*\.woff2$/.test(f))
          .map((f) => ({
            tag: "link",
            attrs: { rel: "preload", href: `${base}${f}`, as: "font", type: "font/woff2", crossorigin: "" },
            injectTo: "head" as const
          }))
    }
  }
}

export default defineConfig({
  // BASE=/repo-name/ when serving from a subpath, e.g. GitHub Pages.
  base: process.env.BASE ?? "/",
  plugins: [preloadFonts()],
  test: {
    include: ["src/**/*.test.ts"]
  }
})

/** Builds the example to a single ES module, `dist/hello-plugin.js`, loadable by
 * `#/plugin/<url>` from any origin. `pixi.js` is marked external — this package only
 * `import type`s it, so nothing of it ends up in the bundle; `effect` is small and bundled. */
import { defineConfig } from "vite"

export default defineConfig({
  // Cross-origin so `vite preview` here stands in for hosting this file on any URL: the
  // dev server (a different origin) `import()`s it as `#/plugin/<url>`.
  preview: { cors: true },
  build: {
    target: "es2022",
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "hello-plugin.js"
    },
    rollupOptions: {
      external: ["pixi.js"]
    }
  }
})

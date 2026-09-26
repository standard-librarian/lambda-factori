import type { CapacitorConfig } from "@capacitor/cli"

// The shell adds nothing to the app: it bundles apps/web's production build and
// serves it from capacitor://localhost, so fetch() and ES modules behave as on the web.
const config: CapacitorConfig = {
  appId: "me.mdht.lambdafactori",
  appName: "λ factori",
  webDir: "../web/dist",
  backgroundColor: "#f1ece3",
  ios: { contentInset: "never" },
  // LF_START="?perf#/deck/week1-complexity/22" opens a route with the frame-stats probe on
  // (scripts/start-page.ts writes the redirect page this points at).
  ...(process.env.LF_START ? { server: { appStartPath: "lf-start.html" } } : {})
}

export default config

import { describe, expect, it } from "vitest"
import type { PluginEntry } from "../kernel/Plugin.ts"
import { parseMechanicKind, parseRoute, resolveOwner, segments, shadowsBuiltin } from "./routes.ts"

const entry = (id: string, packTypes?: ReadonlyArray<string>): PluginEntry => ({
  id,
  title: id,
  subtitle: "",
  kind: "tool",
  color: 0,
  shade: 0,
  ...(packTypes ? { packTypes } : {}),
  load: () => Promise.reject(new Error("not used in this test"))
})

describe("segments", () => {
  it("drops the leading hash and empty segments, and decodes each one", () => {
    expect(segments("#/deck/mechanics-tour/1")).toEqual(["deck", "mechanics-tour", "1"])
    expect(segments("#//deck//1")).toEqual(["deck", "1"])
    expect(segments("#/")).toEqual([])
    expect(segments("#")).toEqual([])
    expect(segments("")).toEqual([])
    expect(segments("#/plugin/https%3A%2F%2Fex.com%2Fp.js")).toEqual(["plugin", "https://ex.com/p.js"])
  })
})

describe("parseRoute", () => {
  it("is Home for an empty hash", () => {
    expect(parseRoute("#/")).toEqual({ _tag: "Home" })
    expect(parseRoute("")).toEqual({ _tag: "Home" })
  })

  it("is Open for a share-link payload", () => {
    expect(parseRoute("#/open/abc123")).toEqual({ _tag: "Open", payload: "abc123" })
  })

  it("is Import for a hosted pack URL, rejoining any split segments", () => {
    expect(parseRoute("#/import/https%3A%2F%2Fex.com%2Fx.json")).toEqual({ _tag: "Import", url: "https://ex.com/x.json" })
  })

  it("is ThirdParty for a plugin URL, with the rest of the path preserved", () => {
    expect(parseRoute("#/plugin/https%3A%2F%2Fex.com%2Fp.js/hello/world")).toEqual({
      _tag: "ThirdParty",
      url: "https://ex.com/p.js",
      path: ["hello", "world"]
    })
  })

  it("is Plugin for anything else, id plus its own path", () => {
    expect(parseRoute("#/deck/mechanics-tour/1")).toEqual({ _tag: "Plugin", id: "deck", path: ["mechanics-tour", "1"] })
    expect(parseRoute("#/combinators")).toEqual({ _tag: "Plugin", id: "combinators", path: [] })
  })

  it("falls back to Plugin when a reserved word has no payload", () => {
    expect(parseRoute("#/open")).toEqual({ _tag: "Plugin", id: "open", path: [] })
    expect(parseRoute("#/import")).toEqual({ _tag: "Plugin", id: "import", path: [] })
    expect(parseRoute("#/plugin")).toEqual({ _tag: "Plugin", id: "plugin", path: [] })
  })
})

describe("parseMechanicKind", () => {
  it("splits a plugin kind into id and name", () => {
    expect(parseMechanicKind("office/scene")).toEqual({ id: "office", name: "scene" })
  })

  it("is undefined for a core kind (no slash), left to the deck's own registry", () => {
    expect(parseMechanicKind("line")).toBeUndefined()
  })
})

describe("resolveOwner", () => {
  const entries = [entry("combinators", ["levels"]), entry("deck", ["deck"])]

  it("finds the entry whose packTypes includes the type", () => {
    expect(resolveOwner(entries, "deck")).toBe(entries[1])
    expect(resolveOwner(entries, "levels")).toBe(entries[0])
  })

  it("is undefined when no entry declares the type", () => {
    expect(resolveOwner(entries, "unknown")).toBeUndefined()
    expect(resolveOwner([entry("office")], "deck")).toBeUndefined()
  })
})

describe("shadowsBuiltin", () => {
  it("is true when a third-party plugin's id matches a built-in entry", () => {
    expect(shadowsBuiltin([entry("deck"), entry("office")], "deck")).toBe(true)
  })

  it("is false for an id no built-in entry uses", () => {
    expect(shadowsBuiltin([entry("deck"), entry("office")], "hello")).toBe(false)
  })
})

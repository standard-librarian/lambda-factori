import { Schema } from "effect"

/**
 * Community registries: plain JSON files anyone can host (a GitHub repo, a
 * gist, a static site). Each lists shared decks, level packs and plugins. The
 * built-in one ships in `public/registry.json`; more can be added by URL.
 */
export const RegistryEntry = Schema.Struct({
  kind: Schema.Literals(["deck", "levels", "plugin"]),
  title: Schema.String,
  subtitle: Schema.optional(Schema.String),
  author: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.Array(Schema.String)),
  /** A JSON pack to import (absolute, or relative to the registry file). */
  url: Schema.optional(Schema.String),
  /** Or a route inside the app, e.g. "combinators". */
  route: Schema.optional(Schema.String)
})
export type RegistryEntry = typeof RegistryEntry.Type & { readonly source: string }

const Registry = Schema.Struct({ name: Schema.optional(Schema.String), entries: Schema.Array(RegistryEntry) })
const KEY = "lambda-factori/registries"

export const extraRegistries = (): Array<string> => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

export const addRegistry = (url: string) => localStorage.setItem(KEY, JSON.stringify([...new Set([...extraRegistries(), url])]))

export const loadRegistries = async (): Promise<Array<RegistryEntry>> => {
  const urls = [`${import.meta.env.BASE_URL}registry.json`, ...extraRegistries()]
  const lists = await Promise.all(urls.map(async (url) => {
    try {
      const json: unknown = await fetch(url).then((r) => r.json())
      const reg = Schema.decodeUnknownSync(Registry)(json)
      const base = new URL(url, location.href)
      return reg.entries.map((e) => ({ ...e, ...(e.url ? { url: new URL(e.url, base).href } : {}), source: reg.name ?? base.host }))
    } catch (e) {
      console.warn(`registry ${url} unreadable`, e)
      return []
    }
  }))
  return lists.flat()
}

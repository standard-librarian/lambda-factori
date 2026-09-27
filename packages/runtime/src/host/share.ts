/**
 * Serverless sharing: any pack (a deck, a level pack) is JSON, deflated and
 * base64url-encoded into a link `#/open/<payload>`. Anyone who opens the link
 * gets the pack locally and can play it, keep it, or remix it — like
 * PuzzleScript or Factorio blueprint strings, no backend required. Plugins
 * reach this through `HostApi.share`, implemented by `Host` with
 * `copyShareLink` below; they never import this module directly.
 */
import type { SharedPack } from "@lambda-factori/kernel/Plugin.ts"

const toB64Url = (bytes: Uint8Array) => {
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

const fromB64Url = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"))
  const out = new Uint8Array(new ArrayBuffer(b.length))
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

const pipe = async (bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())

export const encodePack = async (pack: SharedPack): Promise<string> =>
  toB64Url(await pipe(new TextEncoder().encode(JSON.stringify(pack)), new CompressionStream("deflate-raw")))

export const decodePack = async (payload: string): Promise<SharedPack> => {
  const json = new TextDecoder().decode(await pipe(fromB64Url(payload), new DecompressionStream("deflate-raw")))
  const parsed = JSON.parse(json) as { type?: unknown; data?: unknown }
  if (typeof parsed.type !== "string" || !("data" in parsed)) throw new Error("not a λ factori pack")
  return parsed as SharedPack
}

export const shareUrl = async (pack: SharedPack) =>
  `${location.origin}${location.pathname}#/open/${await encodePack(pack)}`

/** Copy a share link to the clipboard; falls back to a prompt when clipboard access is denied. */
export const copyShareLink = async (pack: SharedPack): Promise<string> => {
  const url = await shareUrl(pack)
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    window.prompt("Copy this link to share:", url)
  }
  return url
}

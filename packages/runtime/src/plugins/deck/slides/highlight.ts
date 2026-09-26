/**
 * Syntax highlighting for the code slide, as Pixi tagged-text markup: keywords,
 * strings, numbers, comments (block comments tracked across lines) and
 * type-like identifiers. Java-ish, which is what the talks show.
 */

const KEYWORDS = new Set(
  (
    "abstract boolean break case catch char class const continue default do double else enum extends final " +
    "finally float for func go if implements import int interface long new package private protected public " +
    "return short static struct super switch this throw throws try type var void while nil true false null " +
    "string error range defer select map chan let const fn impl match pub mut use mod"
  ).split(" ")
)

export const TAGS = {
  "k§": { fill: 0x9b3fc0, fontWeight: "700" },
  "s§": { fill: 0x2f8f5b },
  "c§": { fill: 0x8a8f7a, fontStyle: "italic" },
  "n§": { fill: 0xd46a1f },
  "m§": { fill: 0x306db5, fontWeight: "700" },
  "t§": { fill: 0x207a75 }
} as const

/** Wraps tokens of each line in tag markup; tracks block comments across lines. */
export const highlight = (lines: ReadonlyArray<string>): Array<string> => {
  let inBlock = false
  return lines.map((line) => {
    let out = ""
    let i = 0
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf("*/", i)
        const stop = end < 0 ? line.length : end + 2
        out += `<c§>${line.slice(i, stop)}</c§>`
        i = stop
        if (end >= 0) inBlock = false
        continue
      }
      const rest = line.slice(i)
      if (rest.startsWith("//") || rest.startsWith("#") && /^\s*$/.test(line.slice(0, i))) {
        out += `<c§>${rest}</c§>`
        break
      }
      if (rest.startsWith("/*")) {
        inBlock = true
        continue
      }
      const str = /^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)/.exec(rest)
      if (str) {
        out += `<s§>${str[0]}</s§>`
        i += str[0].length
        continue
      }
      const num = /^\d+(\.\d+)?/.exec(rest)
      if (num && !/\w/.test(line[i - 1] ?? "")) {
        out += `<n§>${num[0]}</n§>`
        i += num[0].length
        continue
      }
      const word = /^[A-Za-z_]\w*/.exec(rest)
      if (word) {
        const w = word[0]
        const after = rest.slice(w.length)
        if (KEYWORDS.has(w)) out += `<k§>${w}</k§>`
        else if (/^\s*\(/.test(after)) out += `<m§>${w}</m§>`
        else if (/^[A-Z]/.test(w)) out += `<t§>${w}</t§>`
        else out += w
        i += w.length
        continue
      }
      out += line[i]
      i++
    }
    return out
  })
}

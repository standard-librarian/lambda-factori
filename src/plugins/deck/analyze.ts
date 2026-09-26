/**
 * Static analysis for code slides (Java-like code): method spans, call sites,
 * and writes to shared fields, so the deck can draw entanglement.
 */
// ---------------------------------------------------------------------------

export interface Method {
  readonly name: string
  readonly decl: number
  readonly end: number
}

export interface Analysis {
  readonly methods: ReadonlyArray<Method>
  readonly fields: ReadonlyMap<string, number>
  readonly calls: ReadonlyArray<{ from: number; to: number; caller: string; callee: string }>
  readonly writes: ReadonlyArray<{ line: number; field: string; method: string }>
}

const CONTROL = new Set(["if", "for", "while", "switch", "catch", "synchronized", "return", "new"])

export const analyze = (lines: ReadonlyArray<string>): Analysis => {
  const methods: Array<Method> = []
  const fields = new Map<string, number>()
  let depth = 0
  const code = lines.map((l) => l.replace(/\/\/.*$/, "").replace(/"(?:[^"\\]|\\.)*"/g, '""'))
  for (let i = 0; i < code.length; i++) {
    const l = code[i]!
    if (depth === 1) {
      const m = /^\s*(?:(?:public|private|protected|static|final|synchronized|abstract)\s+)*[\w<>[\],\s]+?\s+(\w+)\s*\([^)]*\)\s*(?:throws [\w, .]+)?\s*\{?\s*$/.exec(l)
      if (m && !CONTROL.has(m[1]!)) {
        // Find the end of the body by brace matching.
        let d = 0
        let end = i
        for (let j = i; j < code.length; j++) {
          for (const ch of code[j]!) {
            if (ch === "{") d++
            else if (ch === "}") d--
          }
          if (d === 0 && j > i) {
            end = j
            break
          }
        }
        methods.push({ name: m[1]!, decl: i, end })
      } else {
        const f = /^\s*(?:(?:private|protected|public|static|final)\s+)+[\w<>[\],\s]+?\s+(\w+)\s*(?:=[^;]*)?;\s*$/.exec(l)
        if (f) fields.set(f[1]!, i)
      }
    }
    for (const ch of l) {
      if (ch === "{") depth++
      else if (ch === "}") depth--
    }
  }
  const names = new Set(methods.map((m) => m.name))
  const calls: Array<Analysis["calls"][number]> = []
  const writes: Array<Analysis["writes"][number]> = []
  for (const m of methods) {
    for (let i = m.decl + 1; i <= m.end; i++) {
      const l = code[i]!
      for (const call of l.matchAll(/\b(\w+)\s*\(/g)) {
        const callee = methods.find((x) => x.name === call[1])
        if (callee && names.has(call[1]!) && callee.name !== m.name) calls.push({ from: i, to: callee.decl, caller: m.name, callee: callee.name })
      }
      for (const field of fields.keys()) {
        const re = new RegExp(`\\b${field}\\s*(?:\\[[^\\]]*\\])?\\s*(?:=(?!=)|\\+=|-=|\\+\\+|--)|\\b${field}\\.(?:add|set|put|remove|clear)\\(`)
        if (re.test(l)) writes.push({ line: i, field, method: m.name })
      }
    }
  }
  return { methods, fields, calls, writes }
}

export const metricsOf = (lines: ReadonlyArray<string>, a: Analysis) => {
  const nonBlank = lines.filter((l) => l.trim().length > 0).length
  let inBlock = false
  let comments = 0
  for (const l of lines) {
    const t = l.trim()
    if (inBlock || t.startsWith("/*") || t.startsWith("*") || t.startsWith("//")) comments++
    if (t.startsWith("/*")) inBlock = !t.includes("*/")
    else if (inBlock && t.includes("*/")) inBlock = false
  }
  const writers = new Map<string, Set<string>>()
  for (const w of a.writes) writers.set(w.field, (writers.get(w.field) ?? new Set()).add(w.method))
  // Longest call chain, from any method.
  const graph = new Map<string, Set<string>>()
  for (const c of a.calls) graph.set(c.caller, (graph.get(c.caller) ?? new Set()).add(c.callee))
  const depthOf = (n: string, seen: Set<string>): number => {
    if (seen.has(n)) return 0
    const next = [...(graph.get(n) ?? [])]
    return 1 + Math.max(0, ...next.map((m) => depthOf(m, new Set([...seen, n]))))
  }
  const depth = Math.max(0, ...a.methods.map((m) => depthOf(m.name, new Set())))
  return {
    lines: nonBlank,
    comments,
    methods: a.methods.length,
    avg: a.methods.length ? Math.round(a.methods.reduce((s, m) => s + (m.end - m.decl + 1), 0) / a.methods.length) : 0,
    shared: [...writers.values()].filter((s) => s.size > 0).length,
    depth
  }
}


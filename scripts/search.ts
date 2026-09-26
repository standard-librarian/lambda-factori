/**
 * Brute-force recipe search for level design, in the spirit of the community
 * Word Factori calculator.
 *
 *   pnpm search Ψ S,K,B,C,W,I 9
 *   pnpm search "w: ÷ (+/ w) (≢ w)" Φ,÷,+/,≢ 4
 *   pnpm search "and: 0001" S,K,I,C 6
 */
import { byName } from "../src/core/Catalogue.ts"
import { type Goal, goalOf } from "../src/core/Level.ts"
import { searchRecipes } from "../src/core/Search.ts"

const [targetArg = "I", basisArg = "S,K", maxArg = "7", limitArg = "5"] = process.argv.slice(2)

const goal: Goal = (() => {
  const known = byName.get(targetArg)
  if (known) return { _tag: "Ext", label: known.name, behaviour: known }
  const [params, body] = targetArg.split(":").map((s) => s.trim())
  if (/^[01]+$/.test(body ?? "")) return goalOf({ label: params ?? "goal", truth: body! })
  return goalOf({ label: "goal", params: params ?? "", body: body ?? "" })
})()

const result = searchRecipes(goal, basisArg.split(",").map((s) => s.trim()), {
  maxSize: Number(maxArg),
  limit: Number(limitArg),
  maxTerms: 50_000_000
})
for (const r of result.found) console.log(r)
if (result.found.length === 0) console.log(`no recipe up to size ${result.searchedSize}`)

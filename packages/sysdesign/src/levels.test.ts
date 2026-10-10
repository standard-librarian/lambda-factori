import { describe, expect, it } from "vitest"
import { check, goalIds, stageNames } from "./Level.ts"
import { levels } from "./levels.ts"
import { runStage } from "./Sim.ts"
import { score } from "./score.ts"

describe("bundled levels", () => {
  it("has the three slice levels with their practice links", () => {
    expect(levels.map((l) => [l.id, l.difficulty, l.practice.name])).toEqual([
      ["bitly", "easy", "Bitly"],
      ["news-feed", "medium", "FB News Feed"],
      ["uber", "hard", "Uber"]
    ])
    for (const l of levels) {
      expect(l.practice.url).toMatch(/^https:\/\/www\.hellointerview\.com\/learn\/system-design\/problem-breakdowns\/[a-z-]+$/)
    }
  })

  for (const level of levels) {
    describe(level.id, () => {
      it("passes check", () => {
        expect(check(level)).toEqual([])
      })

      for (const stage of stageNames) {
        it(`reference passes ${stage}`, () => {
          const result = score(level, stage, level.reference, runStage(level, level.reference, stage))
          expect(result.goals.filter((g) => !g.pass).map((g) => g.reason)).toEqual([])
        })
      }

      for (const naive of level.naive ?? []) {
        it(`naive "${naive.why.slice(0, 40)}" fails exactly ${naive.fails}`, () => {
          const result = score(level, naive.stage, naive.design, runStage(level, naive.design, naive.stage))
          expect(result.goals.filter((g) => !g.pass).map((g) => g.id)).toEqual([naive.fails])
        })
      }

      it("every goal id is reported", () => {
        for (const stage of stageNames) {
          const result = score(level, stage, level.reference, runStage(level, level.reference, stage))
          expect(result.goals.map((g) => g.id)).toEqual(goalIds(level.stages[stage].goals))
        }
      })
    })
  }
})

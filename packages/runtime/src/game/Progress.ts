import { Context, Effect, Layer, Ref, Schema } from "effect"
import type { Board } from "@lambda-factori/core/Board.ts"
import type { Stats } from "@lambda-factori/core/Sim.ts"
import { Storage } from "./Storage.ts"

const Cell = Schema.Struct({ col: Schema.Int, row: Schema.Int })

const BoardSchema = Schema.Struct({
  cols: Schema.Int,
  rows: Schema.Int,
  nextId: Schema.Int,
  buildings: Schema.Array(Schema.Struct({
    id: Schema.Int,
    kind: Schema.Literals(["source", "apply", "bin"]),
    col: Schema.Int,
    row: Schema.Int,
    atom: Schema.optional(Schema.String),
    target: Schema.optional(Schema.Int)
  })),
  wires: Schema.Array(Schema.Struct({
    id: Schema.Int,
    from: Schema.Int,
    to: Schema.Struct({ building: Schema.Int, port: Schema.Literals(["out", "f", "x", "in"]) }),
    path: Schema.Array(Cell)
  }))
})

const StatsSchema = Schema.Struct({ cycles: Schema.Int, machines: Schema.Int, size: Schema.Number })

export class SaveData extends Schema.Class<SaveData>("lambda-factori/game/SaveData")({
  /** Combinator name → every distinct recipe (shown term) the player has built for it. */
  recipes: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  /** Level id → best stats. */
  completed: Schema.Record(Schema.String, StatsSchema),
  stickers: Schema.Array(Schema.String),
  boards: Schema.Record(Schema.String, BoardSchema)
}) {
  static readonly empty = new SaveData({ recipes: {}, completed: {}, stickers: [], boards: {} })
}

const SaveJson = Schema.fromJsonString(SaveData)
const decodeSave = Schema.decodeUnknownEffect(SaveJson)
const encodeSave = Schema.encodeEffect(SaveJson)
const KEY = "lambda-factori/save/v1"

const better = (a: Stats, b: Stats | undefined): Stats =>
  b === undefined
    ? a
    : { cycles: Math.min(a.cycles, b.cycles), machines: Math.min(a.machines, b.machines), size: Math.min(a.size, b.size) }

export class Progress extends Context.Service<Progress, {
  readonly get: Effect.Effect<SaveData>
  /** Records a recipe; succeeds with `true` if it was not known before. */
  recordRecipe(name: string, recipe: string): Effect.Effect<boolean>
  completeLevel(id: string, stats: Stats, sticker: string | undefined): Effect.Effect<{ newSticker: boolean }>
  saveBoard(id: string, board: Board): Effect.Effect<void>
}>()("lambda-factori/game/Progress") {
  static readonly layer = Layer.effect(
    Progress,
    Effect.gen(function*() {
      const storage = yield* Storage
      const raw = yield* storage.get(KEY)
      const initial = raw === undefined
        ? SaveData.empty
        : yield* decodeSave(raw).pipe(
          Effect.tapError((e) => Effect.logWarning("Discarding unreadable save", e.message)),
          Effect.orElseSucceed(() => SaveData.empty)
        )
      const ref = yield* Ref.make(initial)

      const commit = Effect.fnUntraced(function*(f: (s: SaveData) => SaveData) {
        const next = yield* Ref.updateAndGet(ref, f)
        const json = yield* encodeSave(next).pipe(Effect.orDie)
        yield* storage.set(KEY, json)
        return next
      })

      const recordRecipe = Effect.fn("Progress.recordRecipe")(function*(name: string, recipe: string) {
        const before = yield* Ref.get(ref)
        const known = before.recipes[name] ?? []
        if (known.includes(recipe)) return false
        yield* commit((s) => new SaveData({ ...s, recipes: { ...s.recipes, [name]: [...known, recipe] } }))
        return true
      })

      const completeLevel = Effect.fn("Progress.completeLevel")(
        function*(id: string, stats: Stats, sticker: string | undefined) {
          const before = yield* Ref.get(ref)
          const newSticker = sticker !== undefined && !before.stickers.includes(sticker)
          yield* commit((s) =>
            new SaveData({
              ...s,
              completed: { ...s.completed, [id]: better(stats, s.completed[id]) },
              stickers: newSticker ? [...s.stickers, sticker] : s.stickers
            })
          )
          return { newSticker }
        }
      )

      const saveBoard = Effect.fn("Progress.saveBoard")(function*(id: string, board: Board) {
        yield* commit((s) => new SaveData({ ...s, boards: { ...s.boards, [id]: board } }))
      })

      return Progress.of({ get: Ref.get(ref), recordRecipe, completeLevel, saveBoard })
    })
  )
}

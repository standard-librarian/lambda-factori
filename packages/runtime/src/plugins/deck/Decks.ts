/**
 * The deck plugin's `DeckLibrary` backend: decks are runtime plugins, served
 * as JSON and editable in the browser (see the `Decks` class below).
 */
import { Context, Effect, Layer, Schema } from "effect"
import { Deck, DeckJson, type DeckMeta, decodeDeck } from "@lambda-factori/contracts/Deck.ts"
import { fetchJson as fetchPreloaded } from "../../platform/Preload.ts"
import { Storage } from "../../platform/Storage.ts"

export class DeckError extends Schema.TaggedError<DeckError>()("DeckError", {
  id: Schema.String,
  message: Schema.String
}) {}

const KEY = (id: string) => `lambda-factori/deck/${id}`
const LOCAL_INDEX = "lambda-factori/decks/local"
const LocalIndex = Schema.fromJsonString(Schema.Array(Schema.String))

/**
 * Decks are runtime plugins: JSON files served from `public/decks/`, listed in
 * `public/decks/index.json`, plus any deck edited or imported in this browser
 * (kept in storage, and taking precedence over the served file).
 */
export class Decks extends Context.Service<Decks, {
  readonly list: Effect.Effect<ReadonlyArray<DeckMeta>>
  load(id: string): Effect.Effect<Deck, DeckError>
  save(deck: Deck): Effect.Effect<void>
  reset(id: string): Effect.Effect<void>
}>()("lambda-factori/deck/Decks") {
  static readonly layer = Layer.effect(
    Decks,
    Effect.gen(function*() {
      const storage = yield* Storage
      const base = import.meta.env?.BASE_URL ?? "/"

      const fetchJson = Effect.fnUntraced(function*(path: string, id: string) {
        return yield* Effect.tryPromise({
          try: () => fetchPreloaded(`${base}${path}`),
          catch: (e) => new DeckError({ id, message: e instanceof Error ? e.message : String(e) })
        })
      })

      const localIds = storage.get(LOCAL_INDEX).pipe(
        Effect.flatMap((raw) => (raw ? Schema.decodeUnknownEffect(LocalIndex)(raw) : Effect.succeed([] as ReadonlyArray<string>))),
        Effect.orElseSucceed(() => [] as ReadonlyArray<string>)
      )

      const stored = Effect.fnUntraced(function*(id: string) {
        const raw = yield* storage.get(KEY(id))
        if (!raw) return undefined
        return yield* Schema.decodeUnknownEffect(DeckJson)(raw).pipe(
          Effect.tapError((e) => Effect.logWarning(`ignoring unreadable local copy of deck ${id}`, e.message)),
          Effect.orElseSucceed(() => undefined)
        )
      })

      const load = Effect.fn("Decks.load")(function*(id: string) {
        const local = yield* stored(id)
        if (local) return local
        const json = yield* fetchJson(`decks/${id}.json`, id)
        return yield* decodeDeck(json).pipe(Effect.mapError((e) => new DeckError({ id, message: e.message })))
      })

      const meta = (d: Deck, edited: boolean): DeckMeta => ({
        id: d.id,
        title: d.title,
        subtitle: d.subtitle ?? "",
        slides: d.slides.length,
        edited
      })

      const list = Effect.gen(function*() {
        const served = yield* fetchJson("decks/index.json", "index").pipe(
          Effect.flatMap((j) => Schema.decodeUnknownEffect(Schema.Array(Schema.String))(j)),
          Effect.orElseSucceed(() => [] as ReadonlyArray<string>)
        )
        const ids = [...new Set([...served, ...(yield* localIds)])]
        const out: Array<DeckMeta> = []
        for (const id of ids) {
          const local = yield* stored(id)
          const deck = local ?? (yield* load(id).pipe(Effect.orElseSucceed(() => undefined)))
          if (deck) out.push(meta(deck, local !== undefined))
        }
        return out
      })

      const save = Effect.fn("Decks.save")(function*(deck: Deck) {
        const json = yield* Schema.encodeEffect(DeckJson)(deck).pipe(Effect.orDie)
        yield* storage.set(KEY(deck.id), json)
        const ids = yield* localIds
        if (!ids.includes(deck.id)) yield* storage.set(LOCAL_INDEX, JSON.stringify([...ids, deck.id]))
      })

      const reset = Effect.fn("Decks.reset")(function*(id: string) {
        yield* storage.set(KEY(id), "")
      })

      return Decks.of({ list, load, save, reset })
    })
  )
}

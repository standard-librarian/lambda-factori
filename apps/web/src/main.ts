import { Effect, Fiber, Layer, Stream } from "effect"
import { exposeDev } from "@lambda-factori/runtime/platform/devHooks.ts"
import { Host } from "@lambda-factori/runtime/engine/Host.ts"
import { CustomLevels } from "@lambda-factori/runtime/game/CustomLevels.ts"
import { Decks } from "@lambda-factori/runtime/game/Decks.ts"
import { Discovery } from "@lambda-factori/runtime/game/Discovery.ts"
import { GameEvents } from "@lambda-factori/runtime/game/Events.ts"
import { Levels } from "@lambda-factori/runtime/game/Levels.ts"
import { preloadJson } from "@lambda-factori/runtime/game/Preload.ts"
import { Progress } from "@lambda-factori/runtime/game/Progress.ts"
import { Storage } from "@lambda-factori/runtime/game/Storage.ts"
import { loadFonts, Pixi, startFonts } from "@lambda-factori/runtime/render/Pixi.ts"
import { builtinPlugins, type Ports } from "./plugins.ts"

// Kick off the slow, independent downloads before anything else: fonts, and the
// plugin that owns the current route (the host's later import reuses the module).
startFonts()
const [first, second] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent)
let resolvePorts!: (ports: Ports) => void
const ports = new Promise<Ports>((resolve) => (resolvePorts = resolve))
const entries = builtinPlugins(ports)
entries.find((e) => e.id === first)?.load().catch(() => {})
if (first === "deck" && second) preloadJson(`${import.meta.env.BASE_URL}decks/${encodeURIComponent(second)}.json`)
if (!first) preloadJson(`${import.meta.env.BASE_URL}decks/index.json`)

const Services = Layer.mergeAll(Progress.layer, Levels.layer, GameEvents.layer, CustomLevels.layer, Decks.layer).pipe(
  Layer.provide(Storage.localStorage)
)

const AppLayer = Layer.mergeAll(Discovery, Pixi.layer).pipe(Layer.provideMerge(Services))

const main = Effect.gen(function*() {
  yield* loadFonts
  const app = yield* Pixi
  const levels = yield* Levels
  const progress = yield* Progress
  const events = yield* GameEvents
  const custom = yield* CustomLevels
  const decks = yield* Decks
  const services = yield* Effect.context<Progress | GameEvents | CustomLevels | Decks>()
  const run = Effect.runForkWith(services)
  const runSync = Effect.runSyncWith(services)
  const runPromise = <A, E>(eff: Effect.Effect<A, E, never>) => Effect.runPromise(eff)

  resolvePorts({
    combinators: {
      pack: levels.pack,
      progress: () => runSync(progress.get),
      publish: (e) => void run(events.publish(e)),
      saveBoard: (id, board) => void run(progress.saveBoard(id, board)),
      customLevels: () => runSync(custom.all),
      subscribe: (fn) => {
        const fiber = run(events.stream.pipe(Stream.runForEach((e) => Effect.sync(() => fn(e)))))
        return () => run(Fiber.interrupt(fiber))
      },
      saveCustomLevel: (level) => runPromise(custom.save(level))
    },
    editor: {
      pack: levels.pack,
      customLevels: () => runSync(custom.all),
      saveCustomLevel: (level) => runPromise(custom.save(level)),
      removeCustomLevel: (id) => runPromise(custom.remove(id))
    },
    deck: {
      list: () => runPromise(decks.list),
      load: (id) => runPromise(decks.load(id)),
      save: (deck) => runPromise(decks.save(deck)),
      reset: (id) => runPromise(decks.reset(id))
    }
  })

  new Host(app, entries)

  exposeDev("lfApp", app)
  return yield* Effect.never
})

Effect.runFork(
  main.pipe(
    Effect.scoped,
    Effect.provide(AppLayer),
    Effect.tapCause((cause) => Effect.logError("λ factori crashed", cause))
  )
)

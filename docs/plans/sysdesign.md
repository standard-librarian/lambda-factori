# Plan: `sysdesign`, system-design questions as factory puzzles

A new plugin. Requests are tokens on belts, components are machines you place and wire, a level
is an interview question, and a deterministic seeded sim shows the trade-offs: hot spots,
backpressure, cache hit rate, replication lag, and a component failing. Every finished level
opens a deep-dive deck.

Same rules as the other plans: deep modules, the compiler finds the places, effects at the edges,
`pnpm check` exits 0 at the end of every phase, and every phase is its own PR.

## Content rules (from the brief, restated so every phase sees them)
- From hellointerview.com we keep **only** each question's name, difficulty, its company tag
  where the card shows one, and the URL. That's the table below, scraped once on 2026-10-10 from
  the public overview page (`robots.txt`: `User-Agent: * / Allow: /`). We copy no text,
  requirements, numbers, diagrams or solutions. Every level's brief, estimates and reference
  design is written from first principles and from well-known public engineering sources.
- Each level links to its page as "practice this question on Hello Interview".
- No examples from the user's own code or employer.
- All art is procedural Pixi Graphics.
- Any quote is verbatim and is checked mechanically against its source
  (`scripts/verify-quotes.ts`, phase 3).

## The question list

Source: `https://www.hellointerview.com/learn/system-design/problem-breakdowns/overview`. The
difficulty and tag are as the card shows them. All URLs are
`https://www.hellointerview.com/learn/system-design/problem-breakdowns/<slug>`.

| # | Question | Difficulty | Card tag | Slug |
|---|---|---|---|---|
| 1 | Bitly | Easy | Bitly | `bitly` |
| 2 | Dropbox | Easy | Dropbox | `dropbox` |
| 3 | Yelp | Easy | Yelp | `yelp` |
| 4 | Local Delivery Service | Easy | — | `gopuff` |
| 5 | Ticketmaster | Medium | Ticketmaster | `ticketmaster` |
| 6 | Instagram | Medium | Instagram | `instagram` |
| 7 | FB News Feed | Medium | Facebook | `fb-news-feed` |
| 8 | Tinder | Medium | Tinder | `tinder` |
| 9 | LeetCode | Medium | LeetCode | `leetcode` |
| 10 | WhatsApp | Medium | WhatsApp | `whatsapp` |
| 11 | Strava | Medium | Strava | `strava` |
| 12 | Distributed Cache | Medium | Redis | `distributed-cache` |
| 13 | Rate Limiter | Medium | — | `distributed-rate-limiter` |
| 14 | Online Auction | Medium | eBay | `online-auction` |
| 15 | YouTube | Medium | YouTube | `youtube` |
| 16 | Job Scheduler | Medium | Apache Airflow | `job-scheduler` |
| 17 | FB Live Comments | Medium | Facebook Live | `fb-live-comments` |
| 18 | News Aggregator | Medium | Google | `google-news` |
| 19 | Price Tracking Service | Medium | — | `camelcamelcamel` |
| 20 | Notification System | Medium | Twilio | `notification-system` |
| 21 | YouTube Top K | Hard | YouTube | `top-k` |
| 22 | Uber | Hard | Uber | `uber` |
| 23 | Robinhood | Hard | Robinhood | `robinhood` |
| 24 | Google Docs | Hard | Google Drive | `google-docs` |
| 25 | Web Crawler | Hard | Google | `web-crawler` |
| 26 | Ad Click Aggregator | Hard | Google AdSense | `ad-click-aggregator` |
| 27 | FB Post Search | Hard | Facebook | `fb-post-search` |
| 28 | Payment System | Hard | Stripe | `payment-system` |
| 29 | Metrics Monitoring | Hard | Datadog | `metrics-monitoring` |
| 30 | Online Chess | Hard | Lichess | `online-chess` |
| 31 | ChatGPT | Hard | OpenAI | `chatgpt` |
| 32 | Flash Sale | Hard | Nike | `flash-sale` |

## Mechanic designs considered

**A. The floor (chosen as the core).** Like a combinators level. The client press sits on the
left and one exit bin per request type on the right. The player drags machines from the tray
(LB, service, cache, DB, queue, worker, …), wires ports, and taps a machine to set its config
(instances, replicas, shards, partition key, cache size, TTL). Tapping a wire limits it to some
request types ("reads only"). Run plays traffic, and tokens coloured by request type ride the
belts. What it shows:
- a machine's heat tint follows its utilisation;
- tokens pile at an input port when it's saturated (backpressure);
- a dial on each cache shows its hit rate;
- a dashed primary→replica belt shows the lag in ms;
- each exit bin counts what it served;
- SLO meters show p99 against target, throughput, availability and cost against budget.

**B. Tiers.** Fixed columns (edge · gateway · compute · data · async). Cards go into slots and
the wiring is implied by column order. This is easier on a phone and always solvable, but it
can't express a cache-aside side path, fan-out, or a queue that bypasses the database. Rejected
as the core. It might return later as a tutorial.

**C. Knobs.** The architecture is given. The player tunes replicas, shards, cache GB and queue
depth to meet the SLOs at minimum cost, and a cost-vs-p99 curve updates live. It is folded into
A as the **Scale** stage, and as a deck mechanic it's the "what if we double X" slide.

**D. Chaos drill.** The level injects scripted failures: kill a DB primary, slow a shard,
partition an AZ, spike traffic ×10. The player adds redundancy, failover, a queue or a rate
limiter, and is scored on availability. It is folded into A as the **Chaos** stage.

**E. Envelope.** Capacity estimates as a short assembly line. `DAU` → ×actions/day → ÷86 400 s
→ peak ×k gives rps, and ×bytes ×days gives storage. The player picks the order-of-magnitude bin
each result lands in. It's an optional warm-up before a level, and a deck mechanic
(`sysdesign/estimate`). The level's numbers come from the same `estimates` data, so the warm-up
and the sim always agree.

**So:** A, with three stages per level, **Build → Scale → Chaos**. Each stage turns on more
traffic and more goals, and earns one sticker. C and D become those stages, E is a warm-up and
a deck slide, and B is shelved.

## Simulation model (`packages/sysdesign/src/Sim.ts`)
- **Discrete time:** Δ = 10 ms of simulated time per step. A run is 60 simulated seconds, about
  20 s of wall time at 1×. Traffic is **batched**: one token is one batch of requests, and the
  level sets how many requests a token is worth (`rpsPerToken`), so a 1M-rps question still
  draws a readable number of tokens.
- **Requests have ops.** Each request type is an ordered list of ops (`compute`, `read urls`,
  `write urls`, `enqueue clicks`, `push inbox`, `geo drivers`, `lock seat`, `blob media`, …).
  - A machine can serve some ops (see the catalogue). A token moves until its ops are done, then
    leaves by its exit bin. A token that can't progress, overflows a queue or hits a dead
    machine is an error, and it drops into the reject bin.
  - `enqueue` ends the client's latency at once, and the batch continues as background work, so
    async decoupling is visible: p99 drops while the queue fills.
- **Queueing:** each machine instance serves `capacity` rps with a base latency, and keeps a
  bounded FIFO of batches. Waiting time is real FIFO delay, so p99 rises before errors start,
  as it does in real systems.
- **Data is modelled just enough to make the trade-offs real:**
  - **Cache hit rate:** keys are Zipf-skewed with seeded sampling, and the cache holds its
    `cacheGb / avgObjectKb` hottest keys.
  - **Shards:** a partition key routes each batch's key to a shard. A skewed key (a celebrity
    user id) makes one shard hot.
  - **Replicas:** replication lag is a function of the primary's write load, and a read with
    `strong` consistency on a lagging replica counts as stale.
- **Chaos:** scripted events (`kill`, `slow ×k`, `partition`, `spike ×k`) at set times. An LB
  routes around a dead instance after its health-check interval, and failover promotes a replica
  after `failoverMs`. If there's no redundancy, the errors pile up in the reject bin.
- **Deterministic:** the state is a function of (level, design, stage, seed, t). There is one
  seeded PRNG (xorshift128+) owned by the sim. Snapshots every 1 s of sim time make seeking on
  the `PlaybackBar` exact and cheap, the same idea as `lineTimeline.ts`.
- **Scoring** (`score.ts`, pure) maps each goal to a measured value and a pass/fail. Its results
  are the "why you failed" lines, e.g. "redirect p99 = 140 ms > 50 ms; the urls DB is at 180%".
- **Calibration:** latencies and capacities are game numbers, set per component kind in the
  catalogue. They're inspired by public figures, such as the latency table in Peter Norvig's
  "Teach Yourself Programming in Ten Years" and vendor docs for typical Redis, Postgres and
  Kafka throughput. They're cited in the decks and kept round. Tests pin the trade-offs, not the
  exact numbers.

## Level schema (`packages/sysdesign/src/Level.ts`, Effect Schema)

```ts
Id         = String matching /^[a-z][a-z0-9-]*$/
Dataset    = { id: Id, label, objectKb: Number, keys: Number /* distinct keys */, skew: Number /* Zipf s */ }
Op         = TaggedUnion over "do":
               compute{ms} | read{dataset, consistency: "strong"|"eventual"} | write{dataset}
             | enqueue{topic} | push{channel} | geo{dataset} | search{index} | lock{resource} | blob{bucket}
Traffic    = steady | ramp{fromX} | spike{atMs, x, forMs} | diurnal{peakX}
RequestType= { id: Id, label /* "GET /:code" */, color, ops: NonEmptyArray<Op>, rps: Number, traffic: Traffic }
ComponentKind = Literal union, the one list (client, dns, cdn, lb, gateway, rateLimiter, service,
               cache, sqlDb, kvStore, blob, search, queue, worker, websocket, geoIndex, lock, exit, …)
Config     = a mapped type over ComponentKind (each kind has its own Struct; e.g.
             sqlDb{instances, replicas, shards, partitionKey?, failoverMs}, cache{gb, ttlS},
             queue{depth, partitions}, rateLimiter{rps, burst})
Placed     = { id: Id, kind: ComponentKind, at: {col, row}, config: Config[kind], locked?: Boolean }
Wire       = { from: Id, to: Id, only?: Array<Id /* request types */> }
Design     = { components: Array<Placed>, wires: Array<Wire> }
Chaos      = { atMs, event: kill|slow{x}|partition|spike{x}, target: Id | ComponentKind, forMs }
Goals      = { serve: NonEmptyArray<Id>             // functional: these request types must exit
             , p99Ms?: Record<Id, Number>, minServed?: Number /* fraction */,
               availability?: Number, maxStale?: Number, budget?: Number /* $/month */ }
Stage      = { traffic: Number /* × rps */, chaos: Array<Chaos>, goals: Goals }
Level      = {
  id: Id, title /* ours, e.g. "A URL shortener" */, difficulty: "easy"|"medium"|"hard",
  practice: { name /* "Bitly" */, url /* hellointerview.com/... */ },
  brief: String /* our own requirements prose */,
  estimates: Array<{ label, expr, value, unit }>   // the envelope warm-up, our own numbers
  rpsPerToken: Number, seed: Number,
  datasets: Array<Dataset>, requests: NonEmptyArray<RequestType>,
  palette: Array<ComponentKind>, fixed: Design /* client + exits, locked */,
  stages: { build: Stage, scale: Stage, chaos: Stage },
  reference: Design,   // must pass all three stages (test)
  naive?: Array<{ design: Design, fails: Id /* the goal it must fail */ }>,  // pins the lesson (test)
  deck: Id             // apps/web/public/decks/<deck>.json
}
LevelPack  = { version: 1, levels: NonEmptyArray<Level> }
```

Validity checks that Schema can't express go in `check(level)`, a pure function that `Levels.test.ts`
runs on every level:
- every `Id` reference resolves;
- the palette covers the reference design;
- every wire joins ports that exist;
- `fixed` is part of `reference`.

## Where things live (dependency rule)
- **`packages/sysdesign`** (pure, `pure:sysdesign`, imports only `effect`, itself and
  `contracts`):
  - `Catalogue.ts`: the component kinds, which ops each serves, capacity, latency and $/month;
    a `Record<ComponentKind, …>`;
  - `Level.ts`, `Design.ts` (pure edits: place, move, wire, configure, delete);
  - `rng.ts`, `Sim.ts`, `score.ts`, `estimate.ts`;
  - `data/levels.json`;
  - tests.

  It can't import `core`'s `Board` or its `MinHeap` router (rule 9), and it doesn't need them:
  belt routing is a drawing concern.
- **`packages/contracts/src/SysdesignSlide.ts`:** the schemas for the deck mechanics.
- **`runtime/plugins/sysdesign/`:**
  - `manifest.ts`, and `plugin.ts` with its own `SysdesignPort` (levels, progress);
  - scenes: `MenuScene`, `LevelScene` (state and stage), `FloorView`, `FloorEditor`,
    `TrafficAnimator`, `ConfigPanel`, `Gauges` (SLO meters), `belts.ts` (pure belt routing, with
    tests), `componentArt.ts` (new procedural shapes built on `ui/factoryArt`), `LevelComplete`
    (stickers, the Hello Interview link, "deep dive →" to `#/deck/<deck>/0`);
  - `mechanics.ts`.
- **`apps/web/src/plugins.ts`:** one entry, and the only file that names it. The plugin reaches
  the deck by route string only.
- The new UI reuses `PlaybackBar` and `factoryArt`, renders on demand (`animating()` is true
  only while traffic plays or a tween runs), and adds a dev hook `lfSysdesign` (`load(design)`,
  `stage(s)`, `run()`, `state()`) so `scripts/drive.ts` can play every level to the end.

## Phases

### Phase 1: the pure package (PR 1)
- Add `packages/sysdesign` with the catalogue, schemas, design edits, rng, sim, score and
  estimate, and the three slice levels: **Bitly** (easy), **FB News Feed** (medium) and
  **Uber** (hard; WhatsApp is the chat question, but Hello Interview rates it Medium).
- Tests:
  - every level decodes and passes `check`;
  - each reference design passes all three stages;
  - each `naive` design fails the goal it names (Bitly without a cache fails redirect p99, a
    feed with fan-out on read fails p99 at scale, Uber on one location shard fails Scale, and a
    single matcher fails Chaos);
  - the same seed gives byte-identical stats, and seeking to a snapshot equals running from 0;
  - backpressure: a bounded queue at 2× load ends in rejects, not unbounded latency.
- The architecture test covers the new package automatically. The whole suite still runs in
  about a second.

### Phase 2: the playable plugin (PR 2, stacked on PR 1)
- The scenes and the composition-root entry, with the dev hook.
- A home card, and a menu with three level cards showing difficulty, stickers, and the
  "practice on Hello Interview" link (it opens in a new tab).
- Verify: `scripts/drive.ts` loads each reference design, plays Build, Scale and Chaos to
  completion, and screenshots the floor at each stage and the complete panel. We check them
  for overflow, for text sizes like the combinators levels', and at 1920×1080 and 1280×720.

### Phase 3: deep-dive decks and mechanics (PR 3, stacked)
- Mechanics `sysdesign/floor` (a reference design that plays its build steps, read-only, with
  one component added per step and traffic re-run) and `sysdesign/estimate`, with templates
  and a decode test.
- Decks `sd-bitly`, `sd-news-feed` and `sd-uber`, using the existing kinds (`decisions` for
  what each component hides, `versus` for push vs pull, `curve` for cost vs p99) plus the two
  mechanics.
- `scripts/verify-quotes.ts` fetches every quote's `source` and checks it verbatim; it fails if
  any doesn't match.

**Stop here for the user to play the slice.**

### Phases 4–7: the remaining 29 questions, one PR each
Each batch adds the components its questions need. The catalogue is a mapped type, so a new
kind fails to compile until it has art, a config schema and a tray card. Each batch also adds a
deck per level and the drive screenshots.
- **4:** Dropbox, Yelp, Local Delivery Service, Ticketmaster, Instagram, Tinder, LeetCode
  (adds `lock`, a code-runner sandbox pool, `search`).
- **5:** WhatsApp, Strava, Distributed Cache, Rate Limiter, Online Auction, YouTube, Job Scheduler
  (adds `websocket`, a transcode pipeline, a scheduler/timer wheel).
- **6:** FB Live Comments, News Aggregator, Price Tracking Service, Notification System,
  YouTube Top K, Robinhood, Google Docs (adds a stream processor, a pub/sub fan-out, an
  OT/CRDT doc server).
- **7:** Web Crawler, Ad Click Aggregator, FB Post Search, Payment System, Metrics Monitoring,
  Online Chess, ChatGPT, Flash Sale (adds a time-series store, an idempotency ledger, a GPU
  inference pool, a crawl frontier).

## Risks
- **Tuning:** a level must be beatable by more than the reference, and the naive design must
  fail for the right reason. The `naive` tests pin the lesson, and the "why you failed" lines
  come straight from `score.ts`.
- **Sim cost on a phone:** batching and Δ = 10 ms keep it to ~6 000 steps per run, and the sim
  is far ahead of the draw. Measure with `?perf` in phase 2.
- **Belt routing without `core`'s router:** a simpler orthogonal router in `belts.ts`; machines
  snap to a coarser grid than combinators uses.

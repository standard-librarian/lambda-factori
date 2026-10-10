/**
 * The bundled levels, decoded once with the `LevelPack` schema. Importing this fails loudly if
 * `data/levels.json` stops matching the schema.
 */
import { Schema } from "effect"
import pack from "./data/levels.json" with { type: "json" }
import { LevelPack, type Level } from "./Level.ts"

export const levels: ReadonlyArray<Level> = Schema.decodeUnknownSync(LevelPack)(pack).levels

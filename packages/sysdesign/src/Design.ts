/**
 * Pure edits of a `Design`: every function returns a new design (or the same one when the edit
 * is refused or changes nothing), so the editor can keep history and the sim never sees a half
 * edit. Locked components, the part of the question the player doesn't own, can't be moved,
 * removed or reconfigured.
 */
import type { Config } from "./Catalogue.ts"
import type { Design, Placed, Wire } from "./Level.ts"

const isLocked = (design: Design, id: string): boolean => design.components.some((c) => c.id === id && c.locked === true)

/** Adds `placed`; an id that already exists is refused. */
export const place = (design: Design, placed: Placed): Design =>
  design.components.some((c) => c.id === placed.id)
    ? design
    : { ...design, components: [...design.components, placed] }

export const move = (design: Design, id: string, at: Placed["at"]): Design =>
  isLocked(design, id)
    ? design
    : { ...design, components: design.components.map((c) => (c.id === id ? { ...c, at } : c)) }

/** Removes a component and every wire touching it. */
export const remove = (design: Design, id: string): Design =>
  isLocked(design, id)
    ? design
    : {
      components: design.components.filter((c) => c.id !== id),
      wires: design.wires.filter((w) => w.from !== id && w.to !== id)
    }

/** Adds a wire between two existing components; a duplicate `from -> to`, a self-loop or an unknown end is refused. */
export const wire = (design: Design, w: Wire): Design => {
  const known = (id: string) => design.components.some((c) => c.id === id)
  const duplicate = design.wires.some((x) => x.from === w.from && x.to === w.to)
  return w.from === w.to || !known(w.from) || !known(w.to) || duplicate
    ? design
    : { ...design, wires: [...design.wires, w] }
}

export const unwire = (design: Design, from: string, to: string): Design => ({
  ...design,
  wires: design.wires.filter((w) => !(w.from === from && w.to === to))
})

/** Overwrites some of a component's settings; the rest keep their value. */
export const configure = (design: Design, id: string, patch: Config): Design =>
  isLocked(design, id)
    ? design
    : { ...design, components: design.components.map((c) => (c.id === id ? { ...c, config: { ...c.config, ...patch } } : c)) }

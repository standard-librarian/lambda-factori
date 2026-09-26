/** A binary min-heap ordered by a score function (the priority queue behind wire routing). */

export class MinHeap<A> {
  private readonly items: Array<A> = []
  private readonly score: (a: A) => number
  constructor(score: (a: A) => number) {
    this.score = score
  }
  get size() {
    return this.items.length
  }
  push(a: A) {
    const xs = this.items
    xs.push(a)
    let i = xs.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.score(xs[p]!) <= this.score(xs[i]!)) break
      ;[xs[p], xs[i]] = [xs[i]!, xs[p]!]
      i = p
    }
  }
  pop(): A | undefined {
    const xs = this.items
    const top = xs[0]
    const last = xs.pop()
    if (xs.length > 0 && last !== undefined) {
      xs[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < xs.length && this.score(xs[l]!) < this.score(xs[m]!)) m = l
        if (r < xs.length && this.score(xs[r]!) < this.score(xs[m]!)) m = r
        if (m === i) break
        ;[xs[m], xs[i]] = [xs[i]!, xs[m]!]
        i = m
      }
    }
    return top
  }
}

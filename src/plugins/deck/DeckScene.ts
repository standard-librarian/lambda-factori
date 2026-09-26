import { Container, Graphics, Rectangle } from "pixi.js"
import type { HostApi } from "../../engine/Plugin.ts"
import { label, paperArt, relabel, skylineArt } from "../../render/art.ts"
import type { Scene } from "../../render/Scene.ts"
import { DESIGN_H, DESIGN_W, palette } from "../../render/theme.ts"
import { ease, lerp } from "../../render/tween.ts"
import { Button, icons } from "../../render/ui.ts"
import { Schema } from "effect"
import { copyShareLink } from "../../engine/share.ts"
import { Deck, joinLines } from "./Deck.ts"
import { openSlideEditor } from "./editor.ts"
import { ownsChrome, renderSlide, slideTitle } from "./render.ts"
import { MARGIN, para, stickyNote, type SlideView } from "./slides/common.ts"

export type DeckMessage =
  | { readonly type: "state"; readonly deck: string; readonly slide: number; readonly step: number; readonly steps: number; readonly total: number }
  | { readonly type: "cmd"; readonly deck: string; readonly cmd: "next" | "prev" | "sync" | "goto"; readonly slide?: number }

const encodeDeck = Schema.encodeSync(Deck)

export const channelName = (deck: string) => `lambda-factori/deck/${deck}`

/**
 * Plays a deck: one slide at a time, each with its own build steps. Arrow
 * keys, space and presentation clickers (PageUp/PageDown) move through
 * steps, then slides. A presenter window can drive it over a BroadcastChannel.
 */
export class DeckScene implements Scene {
  readonly view = new Container()
  private deck: Deck
  private index: number
  private step = 0
  private current: { view: SlideView; frame: Container } | undefined
  private readonly stage = new Container()
  private readonly chrome = new Container()
  private readonly progress = new Graphics()
  private readonly counter = label("", 24, palette.inkSoft, "700", "right")
  private readonly deckTitle = label("", 22, palette.inkSoft, "600", "left")
  private notes: Container | undefined
  private overview: Container | undefined
  private readonly channel: BroadcastChannel | undefined
  private readonly host: HostApi
  private closeEditor: (() => void) | undefined

  constructor(host: HostApi, deck: Deck, index: number) {
    this.host = host
    this.deck = deck
    this.index = Math.max(0, Math.min(deck.slides.length - 1, index))
    this.view.addChild(this.stage, this.chrome)
    this.chrome.addChild(this.progress, this.counter, this.deckTitle)
    this.counter.position.set(DESIGN_W - 60, DESIGN_H - 36)
    relabel(this.deckTitle, deck.title, "left")
    this.deckTitle.position.set(60, DESIGN_H - 36)
    const nav = (icon: (g: Graphics) => void, x: number, f: () => void) => {
      const b = new Button({ width: 54, height: 46, color: palette.token, shade: palette.binShade, icon, onTap: f }, host.tweens)
      b.position.set(x, DESIGN_H - 40)
      b.alpha = 0.75
      this.chrome.addChild(b)
    }
    nav(icons.back, DESIGN_W - 300, () => this.prev())
    nav(icons.forward, DESIGN_W - 230, () => this.next())
    this.channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(channelName(deck.id))
    this.channel?.addEventListener("message", (e: MessageEvent<DeckMessage>) => {
      const m = e.data
      if (m.type !== "cmd" || m.deck !== this.deck.id) return
      if (m.cmd === "next") this.next()
      else if (m.cmd === "prev") this.prev()
      else if (m.cmd === "goto" && m.slide !== undefined) this.goto(m.slide, 0, 1)
      this.broadcast()
    })
    this.mount(0)
    // Lets the headless play-tester (scripts/drive.ts) jump to any slide and build step.
    if (import.meta.env.DEV) (globalThis as { lfDeck?: DeckScene }).lfDeck = this
  }

  private get slide() {
    return this.deck.slides[this.index]!
  }

  private mount(direction: number) {
    const old = this.current
    const s = this.slide
    const frame = new Container()
    if (!ownsChrome(s)) {
      frame.addChild(paperArt(DESIGN_W, DESIGN_H), skylineArt(DESIGN_W, DESIGN_H + 30, 0xe9e2d6))
      if (s.title && s.kind !== "quote") {
        const t = para(s.title, s.title.length > 48 ? 50 : 62, palette.ink, DESIGN_W - MARGIN * 2 - 380, "700")
        t.position.set(MARGIN - 40, 70)
        frame.addChild(t, new Graphics().roundRect(MARGIN - 40, 70 + t.height + 10, 120, 10, 5).fill(palette.red))
      }
    }
    const view = renderSlide(s, { host: this.host, tweens: this.host.tweens, ticker: this.host.app.ticker })
    frame.addChild(view.view)
    if (s.sticky) {
      const note = stickyNote(s.sticky.text)
      note.position.set(s.sticky.x ?? DESIGN_W - 240, s.sticky.y ?? 40)
      frame.addChild(note)
      const at = s.sticky.step ?? 0
      const baseY = note.y
      const set = view.setStep.bind(view)
      ;(view as { setStep: SlideView["setStep"] }).setStep = (step, animate) => {
        set(step, animate)
        const show = step >= at
        if (show && !note.visible && animate) {
          note.visible = true
          this.host.tweens.add({ target: note, duration: 420, ease: ease.outBack, update: (k) => {
            note.alpha = Math.min(1, k * 2)
            note.y = lerp(baseY - 40, baseY, k)
          } })
        } else note.visible = show
      }
    }
    this.stage.addChild(frame)
    this.step = Math.min(this.step, view.steps)
    view.setStep(this.step, false)
    this.current = { view, frame }
    // Slide transition: new slide glides in from the direction of travel.
    if (old && direction !== 0) {
      frame.alpha = 0
      frame.x = direction * 90
      this.host.tweens.add({ target: frame, duration: 380, ease: ease.outCubic, update: (k) => {
        frame.alpha = k
        frame.x = direction * 90 * (1 - k)
        if (!old.frame.destroyed) {
          old.frame.alpha = 1 - k
          old.frame.x = -direction * 60 * k
        }
      }, done: () => this.dispose(old) })
    } else if (old) this.dispose(old)
    this.drawChrome()
    this.host.replaceRoute(`deck/${encodeURIComponent(this.deck.id)}/${this.index + 1}`)
    this.broadcast()
  }

  private dispose(old: { view: SlideView; frame: Container }) {
    old.view.destroy()
    if (!old.frame.destroyed) old.frame.destroy({ children: true })
  }

  private drawChrome() {
    const n = this.deck.slides.length
    const w = Math.min(900, n * 30)
    const x0 = DESIGN_W / 2 - w / 2
    const g = this.progress.clear()
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.5) * (w / n)
      if (i < n - 1) g.moveTo(x, DESIGN_H - 38).lineTo(x + w / n, DESIGN_H - 38)
    }
    g.stroke({ width: 3, color: palette.binDark, alpha: 0.18 })
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.5) * (w / n)
      const kind = this.deck.slides[i]!.kind
      const on = i === this.index
      g.circle(x, DESIGN_H - 38, on ? 9 : kind === "section" ? 7 : 5).fill(on ? palette.red : i < this.index ? palette.token : 0xc9c2b6)
    }
    relabel(this.counter, `${this.index + 1} / ${n}`, "right")
    this.deckTitle.visible = !this.slide.kind.includes("/")
    const dark = ownsChrome(this.slide) && this.slide.kind === "section"
    this.counter.style.fill = dark ? palette.white : palette.inkSoft
    this.deckTitle.style.fill = dark ? palette.white : palette.inkSoft
  }

  private broadcast() {
    this.channel?.postMessage({
      type: "state",
      deck: this.deck.id,
      slide: this.index,
      step: this.step,
      steps: this.current?.view.steps ?? 0,
      total: this.deck.slides.length
    } satisfies DeckMessage)
  }

  next() {
    const v = this.current?.view
    if (v && this.step < v.steps) {
      this.step++
      v.setStep(this.step, true)
      this.broadcast()
      return
    }
    if (this.index < this.deck.slides.length - 1) this.goto(this.index + 1, 0, 1)
  }

  prev() {
    const v = this.current?.view
    if (v && this.step > 0) {
      this.step--
      v.setStep(this.step, false)
      this.broadcast()
      return
    }
    if (this.index > 0) this.goto(this.index - 1, Number.POSITIVE_INFINITY, -1)
  }

  goto(index: number, step = 0, direction = 0) {
    this.index = Math.max(0, Math.min(this.deck.slides.length - 1, index))
    this.step = step === Number.POSITIVE_INFINITY ? 1e9 : step
    this.mount(direction)
  }

  /** Replace the deck (after an edit) and re-render the current slide. */
  replaceDeck(deck: Deck) {
    this.deck = deck
    this.index = Math.min(this.index, deck.slides.length - 1)
    relabel(this.deckTitle, deck.title, "left")
    this.mount(0)
  }

  // -------------------------------------------------------------------------
  // Overlays
  // -------------------------------------------------------------------------

  private toggleNotes() {
    if (this.notes) {
      this.notes.destroy({ children: true })
      this.notes = undefined
      return
    }
    const text = joinLines(this.slide.notes) || "no speaker notes on this slide"
    const c = new Container()
    const body = para(text, 30, palette.ink, DESIGN_W - 360, "500")
    const h = body.height + 90
    c.addChild(new Graphics().roundRect(120, DESIGN_H - h - 90, DESIGN_W - 240, h, 26).fill({ color: palette.cream, alpha: 0.97 }).stroke({ width: 3, color: palette.trayShade }))
    const head = label("speaker notes · N to hide", 20, palette.red, "700", "left")
    head.position.set(160, DESIGN_H - h - 60)
    body.position.set(160, DESIGN_H - h - 36)
    c.addChild(head, body)
    this.notes = c
    this.view.addChild(c)
  }

  private toggleOverview() {
    if (this.overview) {
      this.overview.destroy({ children: true })
      this.overview = undefined
      return
    }
    const c = new Container()
    c.addChild(new Graphics().rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: palette.ink, alpha: 0.82 }))
    const cols = 6
    const cw = 280
    const ch = 150
    const gap = 22
    const x0 = (DESIGN_W - (cols * cw + (cols - 1) * gap)) / 2
    this.deck.slides.forEach((s, i) => {
      const card = new Container()
      const on = i === this.index
      const fill = s.kind === "section" ? palette.red : s.kind === "title" ? palette.blue : palette.cream
      card.addChild(new Graphics().roundRect(0, 0, cw, ch, 18).fill(fill).stroke({ width: on ? 6 : 0, color: palette.yellow }))
      const dark = s.kind === "section" || s.kind === "title"
      const num = label(`${i + 1}`, 22, dark ? palette.white : palette.red, "700", "left")
      num.position.set(16, 24)
      const kind = label(s.kind, 16, dark ? palette.white : palette.inkSoft, "600", "right")
      kind.position.set(cw - 16, 24)
      const t = para(slideTitle(s, i), 22, dark ? palette.white : palette.ink, cw - 32, "700")
      t.position.set(16, 48)
      if (t.height > ch - 58) t.scale.set((ch - 58) / t.height)
      card.addChild(num, kind, t)
      card.position.set(x0 + (i % cols) * (cw + gap), 70 + Math.floor(i / cols) * (ch + gap))
      card.eventMode = "static"
      card.cursor = "pointer"
      card.hitArea = new Rectangle(0, 0, cw, ch)
      card.on("pointerup", () => {
        this.toggleOverview()
        this.goto(i, 0, i > this.index ? 1 : -1)
      })
      c.addChild(card)
    })
    this.overview = c
    this.view.addChild(c)
  }

  private openPresenter() {
    const url = `${location.origin}${location.pathname}#/deck/${encodeURIComponent(this.deck.id)}/presenter`
    window.open(url, `presenter-${this.deck.id}`, "width=1100,height=760")
    this.host.toast("presenter view opened in a new window")
  }

  private toggleEditor() {
    if (this.closeEditor) {
      this.closeEditor()
      this.closeEditor = undefined
      return
    }
    this.closeEditor = openSlideEditor({
      host: this.host,
      deck: () => this.deck,
      index: () => this.index,
      apply: (deck, index) => {
        this.replaceDeck(deck)
        if (index !== this.index) this.goto(index)
      },
      onClose: () => (this.closeEditor = undefined)
    })
  }

  onKey(e: KeyboardEvent) {
    switch (e.code) {
      case "ArrowRight":
      case "PageDown":
      case "Space":
      case "Enter":
        e.preventDefault()
        return this.next()
      case "ArrowLeft":
      case "PageUp":
      case "Backspace":
        e.preventDefault()
        return this.prev()
      case "Home":
        return this.goto(0, 0, -1)
      case "End":
        return this.goto(this.deck.slides.length - 1, 0, 1)
      case "KeyN":
        return this.toggleNotes()
      case "KeyO":
      case "KeyG":
        return this.toggleOverview()
      case "KeyF":
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen()
        return
      case "KeyP":
        return this.openPresenter()
      case "KeyE":
        return this.toggleEditor()
      case "KeyS":
        void copyShareLink({ type: "deck", data: encodeDeck(this.deck) }).then(() => this.host.toast("share link copied — anyone can play, keep or remix this deck"))
        return
      case "Escape":
        if (this.overview) return this.toggleOverview()
        if (this.notes) return this.toggleNotes()
        if (this.closeEditor) return this.toggleEditor()
        return this.host.home()
    }
  }

  tick(dt: number) {
    this.current?.view.tick?.(dt)
  }

  animating() {
    return this.current?.view.tick !== undefined
  }

  destroy() {
    this.closeEditor?.()
    this.channel?.close()
    if (this.current) this.dispose(this.current)
    this.view.destroy({ children: true })
  }
}

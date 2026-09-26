/**
 * Plays a deck: one slide at a time, each with its own build steps. Arrow
 * keys, space and presentation clickers (PageUp/PageDown) move through steps,
 * then slides, and new slides glide in from the direction of travel. A
 * presenter window can drive it over a BroadcastChannel (`messages.ts`).
 * Other keys: N notes · O overview · F fullscreen · P presenter · E editor ·
 * S share link · Esc home.
 */
import { Schema } from "effect"
import { Container } from "pixi.js"
import { Deck, joinLines } from "@lambda-factori/contracts/Deck.ts"
import { exposeDev } from "../../platform/devHooks.ts"
import type { HostApi } from "../../kernel/Plugin.ts"
import type { Scene } from "../../kernel/Scene.ts"
import type { Mechanic, SlideView } from "../../kernel/Slide.ts"
import { ease } from "../../kernel/tween.ts"
import { DeckChrome } from "./DeckChrome.ts"
import { openSlideEditor } from "./editor.ts"
import { channelName, type DeckMessage } from "./messages.ts"
import { notesPanel, overviewGrid } from "./overlays.ts"
import type { DeckLibrary } from "./plugin.ts"
import { renderSlide } from "./render.ts"
import { frameSlide } from "./slideFrame.ts"

const encodeDeck = Schema.encodeSync(Deck)

export class DeckScene implements Scene {
  readonly view = new Container()
  private deck: Deck
  private index: number
  private step = 0
  private current: { view: SlideView; frame: Container } | undefined
  private readonly stage = new Container()
  private readonly chrome: DeckChrome
  private notes: Container | undefined
  private overview: Container | undefined
  private readonly channel: BroadcastChannel | undefined
  private readonly host: HostApi
  private readonly library: DeckLibrary
  private readonly mechanics: ReadonlyMap<string, Mechanic>
  private closeEditor: (() => void) | undefined

  constructor(o: { host: HostApi; library: DeckLibrary; mechanics: ReadonlyMap<string, Mechanic>; deck: Deck; index: number }) {
    this.host = o.host
    this.library = o.library
    this.mechanics = o.mechanics
    this.deck = o.deck
    this.index = Math.max(0, Math.min(o.deck.slides.length - 1, o.index))
    this.chrome = new DeckChrome(o.host.tweens, { prev: () => this.prev(), next: () => this.next() })
    this.view.addChild(this.stage, this.chrome)
    this.channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(channelName(o.deck.id))
    this.channel?.addEventListener("message", (e: MessageEvent<DeckMessage>) => {
      const m = e.data
      if (m.type !== "cmd" || m.deck !== this.deck.id) return
      if (m.cmd === "next") this.next()
      else if (m.cmd === "prev") this.prev()
      else if (m.cmd === "goto" && m.slide !== undefined) this.goto(m.slide, 0, 1)
      this.broadcast()
    })
    this.mount(0)
    exposeDev("lfDeck", this)
  }

  private get slide() {
    return this.deck.slides[this.index]!
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
    this.mount(0)
  }

  private mount(direction: number) {
    const old = this.current
    const rendered = renderSlide(this.slide, {
      host: this.host,
      tweens: this.host.tweens,
      ticker: this.host.app.ticker,
      syncStep: (step) => {
        this.step = step
        this.broadcast()
      }
    }, this.mechanics)
    const { frame, view } = frameSlide(this.slide, rendered, this.host.tweens, this.mechanics)
    this.stage.addChild(frame)
    this.step = Math.min(this.step, view.steps)
    view.setStep(this.step, false)
    this.current = { view, frame }
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
    this.chrome.draw(this.deck.title, this.deck.slides, this.index)
    this.host.replaceRoute(`deck/${encodeURIComponent(this.deck.id)}/${this.index + 1}`)
    this.broadcast()
  }

  private dispose(old: { view: SlideView; frame: Container }) {
    old.view.destroy()
    if (!old.frame.destroyed) old.frame.destroy({ children: true })
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

  private toggleNotes() {
    if (this.notes) {
      this.notes.destroy({ children: true })
      this.notes = undefined
      return
    }
    this.notes = notesPanel(joinLines(this.slide.notes))
    this.view.addChild(this.notes)
  }

  private toggleOverview() {
    if (this.overview) {
      this.overview.destroy({ children: true })
      this.overview = undefined
      return
    }
    this.overview = overviewGrid(this.deck.slides, this.index, (i) => {
      this.toggleOverview()
      this.goto(i, 0, i > this.index ? 1 : -1)
    })
    this.view.addChild(this.overview)
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
      library: this.library,
      mechanics: this.mechanics,
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
        void this.host.share({ type: "deck", data: encodeDeck(this.deck) }).then(() => this.host.toast("share link copied — anyone can play, keep or remix this deck"))
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
    const v = this.current?.view
    return v?.animating ? v.animating() : v?.tick !== undefined
  }

  destroy() {
    this.closeEditor?.()
    this.channel?.close()
    if (this.current) this.dispose(this.current)
    this.view.destroy({ children: true })
  }
}

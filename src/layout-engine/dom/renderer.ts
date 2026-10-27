import type { LayoutStatus } from "../contract"
import type { CompileLayoutResult, LayoutScope } from "../core"
import type { LayoutRenderReport, LayoutSpeakOptions, LayoutWarnHandler } from "./types"
import morphdom from "morphdom"
import { compileLayout, renderLayoutHtml } from "../core"
import { copyText, SpeakController, TipController, ToggleState } from "./interactions"
import { sanitizeLayoutHtml } from "./sanitize"

/**
 * Renders layouts into a host element's shadow root and keeps them live:
 * each render diffs into the previous one (blocks marked `data-rf-key` keep
 * their place while an answer streams), and the built-in interactions keep
 * their state across renders. When the requested layout cannot render, the
 * fallback sources are tried in order; when none can, the content is cleared
 * and the report says so.
 */

const BASE_CSS = `:host{display:block;position:relative;min-width:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;font-size:14px;line-height:1.5;color:var(--rf-popover-foreground);text-align:start;overflow-wrap:break-word}
:host([hidden]){display:none}
.rf-layout-root{position:relative;min-width:0}
[data-tip-body],[hidden]{display:none !important}
[data-speak]:not([aria-disabled=true]),[data-toggle],[data-copy]{cursor:pointer}
.rf-tip-layer{position:absolute;inset:0;pointer-events:none;z-index:10}
.rf-tip{position:absolute;top:0;left:0;box-sizing:border-box;width:max-content;max-width:min(280px, 100%);padding:6px 9px;border:1px solid var(--rf-border);border-radius:min(var(--rf-radius, 10px), 10px);background:var(--rf-popover);color:var(--rf-popover-foreground);font-size:12px;line-height:1.45;box-shadow:0 6px 20px -6px rgb(0 0 0 / 0.25);white-space:normal;overflow-wrap:anywhere}
.rf-tip[hidden]{display:none}
.rf-tip-arrows{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.rf-tip-arrows path{fill:none;stroke:var(--rf-accent);stroke-width:1.5;stroke-linecap:round}
.rf-tip-arrows .rf-tip-arrowhead{fill:var(--rf-accent);stroke:none}`

// Attributes the interactions set on live elements, kept when a render
// replaces an element's attributes.
const LIVE_ATTRIBUTES = ["data-speak-state", "data-copy-state", "data-tip-state"]

export interface LayoutRenderInput {
  source: string
  scope: LayoutScope
  status: LayoutStatus
  theme: "light" | "dark"
  // Tried in order when `source` cannot render.
  fallbackSources?: readonly string[]
  // A longer `source` is refused (fallbacks are trusted).
  maxSourceLength?: number
}

export interface LayoutRendererOptions {
  speak?: LayoutSpeakOptions
  onWarn?: LayoutWarnHandler
}

const COMPILE_CACHE_SIZE = 16

export class LayoutRenderer {
  private readonly root: ShadowRoot
  private readonly content: HTMLDivElement
  private readonly layoutStyle: { sheet: CSSStyleSheet | null; element: HTMLStyleElement | null }
  private readonly speak: SpeakController
  private readonly toggles: ToggleState
  private readonly tips: TipController
  private readonly compiled = new Map<string, CompileLayoutResult>()
  private readonly userToggledDetails = new WeakSet<Element>()
  private shownSource: string | null = null
  private shownCss: string | null = null
  private status: LayoutStatus | null = null
  private autoplayed = false
  private readonly cleanup: Array<() => void> = []

  constructor(
    private readonly host: HTMLElement,
    private readonly options: LayoutRendererOptions = {},
  ) {
    const doc = host.ownerDocument
    this.root = host.shadowRoot ?? host.attachShadow({ mode: "open" })
    this.root.replaceChildren()

    const frame = doc.createElement("div")
    frame.className = "rf-layout-root"
    this.content = doc.createElement("div")
    this.content.className = "rf-content"
    const layer = doc.createElement("div")
    layer.className = "rf-tip-layer"
    frame.append(this.content, layer)

    this.layoutStyle = this.installStyles(doc)
    this.root.append(frame)

    this.speak = new SpeakController(options.speak, options.onWarn)
    this.toggles = new ToggleState(host)
    this.tips = new TipController(host, this.content, layer)
    this.listen()
  }

  // Constructable stylesheets are not subject to the page's style-src CSP;
  // a `<style>` element is the fallback where they are missing.
  private installStyles(doc: Document) {
    const view = doc.defaultView
    try {
      if (!view || !("adoptedStyleSheets" in this.root)) throw new Error("No adoptedStyleSheets")
      const base = new view.CSSStyleSheet()
      base.replaceSync(BASE_CSS)
      const layout = new view.CSSStyleSheet()
      this.root.adoptedStyleSheets = [base, layout]
      return { sheet: layout, element: null }
    } catch (error) {
      this.options.onWarn?.("constructableStylesheetUnavailable", error)
      const base = doc.createElement("style")
      base.textContent = BASE_CSS
      const layout = doc.createElement("style")
      this.root.append(base, layout)
      return { sheet: null, element: layout }
    }
  }

  private setCss(css: string) {
    if (css === this.shownCss) return
    this.shownCss = css
    if (this.layoutStyle.sheet) this.layoutStyle.sheet.replaceSync(css)
    else if (this.layoutStyle.element) this.layoutStyle.element.textContent = css
  }

  private listen() {
    const root = this.root
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (event: HTMLElementEventMap[K]) => void,
      capture = false,
    ) => {
      root.addEventListener(type, handler as EventListener, capture)
      this.cleanup.push(() => root.removeEventListener(type, handler as EventListener, capture))
    }
    const targetOf = (event: Event) => {
      const target = event.target
      return target instanceof Element && this.content.contains(target) ? target : null
    }

    on("click", (event) => {
      const target = targetOf(event)
      if (!target) return
      if (target.closest("summary")) {
        const details = target.closest("details")
        if (details) this.userToggledDetails.add(details)
      }
      const toggle = target.closest("[data-toggle]")
      if (toggle) {
        this.toggles.toggle(toggle.getAttribute("data-toggle") ?? "", this.content)
        this.tips.refresh()
      }
      const copy = target.closest("[data-copy]")
      if (copy) void copyText(copy, this.options.onWarn)
      const speak = target.closest("[data-speak]")
      if (speak && this.status !== "streaming") this.speak.start(speak)
      // A tap shows a tip; a second tap, or a tap elsewhere, hides it.
      const owner = this.tips.ownerOf(target)
      if (owner && event.pointerType !== "mouse") {
        if (this.tips.shown === owner) this.tips.hide()
        else this.tips.show(owner)
      } else if (!owner) {
        this.tips.hide()
      }
    })
    on("pointerover", (event) => {
      if (event.pointerType !== "mouse") return
      const owner = this.tips.ownerOf(targetOf(event))
      if (owner) this.tips.show(owner)
    })
    on("pointerout", (event) => {
      if (event.pointerType !== "mouse") return
      const next = event.relatedTarget instanceof Element ? event.relatedTarget : null
      if (
        this.tips.ownerOf(next && this.content.contains(next) ? next : null) !== this.tips.shown
      ) {
        this.tips.hide()
      }
    })
    on("focusin", (event) => {
      const owner = this.tips.ownerOf(targetOf(event))
      if (owner) this.tips.show(owner)
    })
    on("focusout", (event) => {
      const next = event.relatedTarget instanceof Element ? event.relatedTarget : null
      if (!next || !this.tips.shown?.contains(next)) this.tips.hide()
    })
    on("keydown", (event) => {
      if (event.key === "Escape") this.tips.hide()
    })
  }

  setSpeak(speak: LayoutSpeakOptions | undefined) {
    this.speak.setOptions(speak)
    this.speak.decorate(this.content)
  }

  private compile(source: string): CompileLayoutResult {
    let result = this.compiled.get(source)
    if (result) {
      // Most recently used last.
      this.compiled.delete(source)
    } else {
      result = compileLayout(source)
    }
    this.compiled.set(source, result)
    if (this.compiled.size > COMPILE_CACHE_SIZE) {
      this.compiled.delete(this.compiled.keys().next().value!)
    }
    return result
  }

  // The source's markup and CSS, or why it cannot render.
  private attempt(source: string, scope: LayoutScope) {
    const compiled = this.compile(source)
    if (!compiled.ok) throw compiled.error
    const html = renderLayoutHtml(compiled.compiled, scope)
    const view = this.host.ownerDocument.defaultView ?? window
    const sanitized = sanitizeLayoutHtml(html, view)
    return {
      fragment: sanitized.fragment,
      css: compiled.compiled.css,
      removed: [...compiled.compiled.cssRemoved, ...sanitized.removed],
    }
  }

  render(input: LayoutRenderInput): LayoutRenderReport {
    const { source, scope, status, theme, fallbackSources = [], maxSourceLength } = input
    this.host.setAttribute("data-status", status)
    this.host.setAttribute("data-theme", theme)
    if (status === "streaming") this.autoplayed = false
    this.status = status

    const candidates = [source, ...fallbackSources.filter((candidate) => candidate !== source)]
    let firstError: Error | null = null
    for (const [index, candidate] of candidates.entries()) {
      try {
        if (index === 0 && maxSourceLength !== undefined && candidate.length > maxSourceLength) {
          throw new Error(
            `The layout is longer than ${maxSourceLength.toLocaleString("en")} characters.`,
          )
        }
        const result = this.attempt(candidate, scope)
        this.show(candidate, result.fragment, result.css)
        this.maybeAutoplay()
        return {
          ...(firstError && { error: { message: firstError.message } }),
          removed: result.removed,
          fellBack: index === 0 ? "none" : "source",
        }
      } catch (error) {
        firstError ??= error instanceof Error ? error : new Error(String(error))
      }
    }

    this.show(null, null, "")
    return {
      error: { message: firstError?.message ?? "The layout could not be rendered." },
      removed: [],
      fellBack: "component",
    }
  }

  private show(source: string | null, fragment: DocumentFragment | null, css: string) {
    if (source !== this.shownSource) {
      this.speak.stop()
      this.tips.hide()
      this.toggles.clear(this.content)
      this.shownSource = source
    }
    this.setCss(css)
    if (!fragment) {
      this.content.replaceChildren()
      return
    }
    const next = this.content.ownerDocument.createElement("div")
    next.append(fragment)
    this.speak.decorate(next)
    morphdom(this.content, next, {
      childrenOnly: true,
      getNodeKey: (node) =>
        node.nodeType === 1
          ? ((node as Element).getAttribute("data-rf-key") ?? undefined)
          : undefined,
      onBeforeElUpdated: (from, to) => {
        for (const name of LIVE_ATTRIBUTES) {
          const value = from.getAttribute(name)
          if (value !== null && !to.hasAttribute(name)) to.setAttribute(name, value)
        }
        if (from.localName === "details" && this.userToggledDetails.has(from)) {
          ;(to as HTMLDetailsElement).open = (from as HTMLDetailsElement).open
        }
        return !from.isEqualNode(to)
      },
    })
    this.toggles.sync(this.content)
    this.speak.decorate(this.content)
    this.tips.refresh()
  }

  // Reads the first `data-speak-autoplay` trigger once per answer, when it is done.
  private maybeAutoplay() {
    if (this.status !== "done" || this.autoplayed || !this.speak.autoplay) return
    this.autoplayed = true
    const trigger = this.content.querySelector("[data-speak-autoplay]")
    if (trigger) queueMicrotask(() => trigger.isConnected && this.speak.start(trigger, true))
  }

  destroy() {
    this.speak.stop()
    this.tips.hide()
    for (const dispose of this.cleanup.splice(0)) dispose()
    this.root.replaceChildren()
    if (this.layoutStyle.sheet) this.root.adoptedStyleSheets = []
  }
}

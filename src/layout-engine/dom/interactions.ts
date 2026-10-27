import type { LayoutSpeakOptions, LayoutWarnHandler } from "./types"

/**
 * The built-in interactions a layout gets without JavaScript, handled by
 * delegation on the shadow root:
 *
 * - `data-speak`: reads the value (or the element's own text) aloud once the
 *   answer is done; `data-speak-lang` names its language. The trigger's
 *   `data-speak-state` is `loading`, then `playing`. `data-speak-autoplay`
 *   reads the first such trigger on its own once the answer is done.
 * - `data-tip` / a hidden `[data-tip-body]` child: a bubble while hovered,
 *   focused or tapped. `data-tip-link="k"` draws arrows to every
 *   `[data-tip-key="k"]` and marks them `data-tip-state=linked`.
 * - `data-toggle="name"`: switches `name` in the host's `data-toggles`, and
 *   sets `aria-pressed` on its triggers.
 * - `data-copy`: copies the value (or the element's own text).
 */

const SVG_NS = "http://www.w3.org/2000/svg"

// The element's text without its tip bodies.
function ownText(element: Element): string {
  const clone = element.cloneNode(true) as Element
  for (const body of clone.querySelectorAll("[data-tip-body]")) body.remove()
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim()
}

function valueOrText(element: Element, attribute: string): string {
  const value = element.getAttribute(attribute)?.trim()
  return value ? value : ownText(element)
}

interface SpeakRun {
  trigger: Element
  abort: AbortController
}

export class SpeakController {
  private run: SpeakRun | null = null

  constructor(
    private options: LayoutSpeakOptions | undefined,
    private readonly onWarn: LayoutWarnHandler | undefined,
  ) {}

  setOptions(options: LayoutSpeakOptions | undefined) {
    this.options = options
  }

  get autoplay(): boolean {
    return this.options?.autoplay ?? false
  }

  // Marks every trigger without a name of its own, and names it by its state.
  decorate(root: ParentNode) {
    const labels = this.options?.labels
    if (!labels) return
    for (const trigger of root.querySelectorAll("[data-speak]")) {
      if (!trigger.hasAttribute("data-rf-speak-label")) {
        if (trigger.hasAttribute("aria-label")) continue
        trigger.setAttribute("data-rf-speak-label", "")
      }
      const state = trigger.getAttribute("data-speak-state")
      const label =
        state === "loading" ? labels.loading : state === "playing" ? labels.playing : labels.speak
      trigger.setAttribute("aria-label", label)
      if (!trigger.hasAttribute("title") || trigger.hasAttribute("data-rf-speak-title")) {
        trigger.setAttribute("title", label)
        trigger.setAttribute("data-rf-speak-title", "")
      }
    }
  }

  private setState(trigger: Element, state: "loading" | "playing" | null) {
    if (state) trigger.setAttribute("data-speak-state", state)
    else trigger.removeAttribute("data-speak-state")
    const parent = trigger.parentNode
    if (parent) this.decorate(parent)
  }

  start(trigger: Element, autoplay = false) {
    const adapter = this.options?.adapter
    if (!adapter || trigger.getAttribute("aria-disabled") === "true") return
    if (this.run?.trigger === trigger) {
      this.stop()
      return
    }
    const text = valueOrText(trigger, "data-speak")
    if (!text) return
    this.stop()

    const abort = new AbortController()
    const run: SpeakRun = { trigger, abort }
    this.run = run
    const lang =
      trigger.getAttribute("data-speak-lang")?.trim() ||
      trigger.closest("[lang]")?.getAttribute("lang")?.trim() ||
      undefined
    this.setState(trigger, "loading")
    const finish = () => {
      if (this.run !== run) return
      this.run = null
      this.setState(trigger, null)
    }
    let playing: Promise<unknown>
    try {
      playing = adapter.play(text, {
        lang,
        signal: abort.signal,
        autoplay,
        onStart: () => {
          if (this.run === run && !abort.signal.aborted) this.setState(trigger, "playing")
        },
      })
    } catch (error) {
      playing = Promise.reject(error)
    }
    playing.then(finish, (error: unknown) => {
      if (!abort.signal.aborted) this.onWarn?.("speakFailed", error)
      finish()
    })
  }

  stop() {
    const run = this.run
    if (!run) return
    this.run = null
    run.abort.abort()
    this.options?.adapter.stop()
    this.setState(run.trigger, null)
  }
}

export class ToggleState {
  private readonly on = new Set<string>()

  constructor(private readonly host: HTMLElement) {}

  toggle(name: string, root: ParentNode) {
    if (this.on.has(name)) this.on.delete(name)
    else this.on.add(name)
    this.sync(root)
  }

  clear(root: ParentNode) {
    this.on.clear()
    this.sync(root)
  }

  sync(root: ParentNode) {
    if (this.on.size > 0) this.host.setAttribute("data-toggles", [...this.on].join(" "))
    else this.host.removeAttribute("data-toggles")
    for (const trigger of root.querySelectorAll("[data-toggle]")) {
      const name = trigger.getAttribute("data-toggle") ?? ""
      trigger.setAttribute("aria-pressed", String(this.on.has(name)))
    }
  }
}

// The element whose tip a target shows: one with `data-tip`, or with a
// `[data-tip-body]` child.
function tipOwner(target: Element | null, root: Element): Element | null {
  for (let element = target; element && element !== root; element = element.parentElement) {
    if (element.hasAttribute("data-tip-body")) continue
    if (element.getAttribute("data-tip")?.trim()) return element
    for (const child of element.children) {
      if (child.hasAttribute("data-tip-body")) return element
    }
  }
  return null
}

export class TipController {
  private owner: Element | null = null
  private readonly bubble: HTMLDivElement
  private readonly arrows: SVGSVGElement

  constructor(
    private readonly host: HTMLElement,
    private readonly content: HTMLElement,
    private readonly layer: HTMLElement,
  ) {
    const doc = layer.ownerDocument
    this.bubble = doc.createElement("div")
    this.bubble.className = "rf-tip"
    this.bubble.setAttribute("role", "tooltip")
    this.bubble.hidden = true
    this.arrows = doc.createElementNS(SVG_NS, "svg")
    this.arrows.setAttribute("class", "rf-tip-arrows")
    this.arrows.setAttribute("aria-hidden", "true")
    layer.append(this.arrows, this.bubble)
  }

  ownerOf(target: Element | null): Element | null {
    return tipOwner(target, this.content)
  }

  get shown(): Element | null {
    return this.owner
  }

  show(owner: Element) {
    if (this.owner === owner) return
    this.hide()
    this.owner = owner
    this.host.setAttribute("data-tip-active", "")
    owner.setAttribute("data-tip-state", "active")
    const link = owner.getAttribute("data-tip-link")
    if (link) {
      for (const linked of this.linked(link)) linked.setAttribute("data-tip-state", "linked")
    }
    const text = owner.getAttribute("data-tip")?.trim()
    if (text) {
      this.bubble.textContent = text
    } else {
      const body = [...owner.children].find((child) => child.hasAttribute("data-tip-body"))
      this.bubble.replaceChildren(
        ...[...(body?.childNodes ?? [])].map((node) => node.cloneNode(true)),
      )
    }
    this.bubble.hidden = false
    this.place()
  }

  hide() {
    const owner = this.owner
    if (!owner) return
    this.owner = null
    this.host.removeAttribute("data-tip-active")
    for (const element of this.content.querySelectorAll("[data-tip-state]")) {
      element.removeAttribute("data-tip-state")
    }
    this.bubble.hidden = true
    this.bubble.replaceChildren()
    this.arrows.replaceChildren()
  }

  // After a re-render: the tip stays on its element while it is still there.
  refresh() {
    const owner = this.owner
    if (!owner) return
    if (!owner.isConnected) {
      this.hide()
      return
    }
    this.place()
  }

  private linked(key: string): Element[] {
    return [...this.content.querySelectorAll("[data-tip-key]")].filter(
      (element) => element.getAttribute("data-tip-key") === key,
    )
  }

  private place() {
    const owner = this.owner
    if (!owner) return
    const frame = this.layer.getBoundingClientRect()
    const box = owner.getBoundingClientRect()
    const bubble = this.bubble.getBoundingClientRect()
    const gap = 6
    const viewportHeight = this.layer.ownerDocument.defaultView?.innerHeight ?? Infinity
    let top = box.bottom - frame.top + gap
    if (box.bottom + gap + bubble.height > viewportHeight && box.top - gap - bubble.height >= 0) {
      top = box.top - frame.top - gap - bubble.height
    }
    const maxLeft = Math.max(0, frame.width - bubble.width)
    const left = Math.min(Math.max(0, box.left - frame.left), maxLeft)
    this.bubble.style.top = `${Math.round(top)}px`
    this.bubble.style.left = `${Math.round(left)}px`
    this.drawArrows(owner, frame)
  }

  private drawArrows(owner: Element, frame: DOMRect) {
    this.arrows.replaceChildren()
    const link = owner.getAttribute("data-tip-link")
    if (!link) return
    const from = owner.getBoundingClientRect()
    const doc = this.layer.ownerDocument
    const defs = doc.createElementNS(SVG_NS, "defs")
    const marker = doc.createElementNS(SVG_NS, "marker")
    marker.setAttribute("id", "rf-tip-arrowhead")
    marker.setAttribute("viewBox", "0 0 8 8")
    marker.setAttribute("refX", "6")
    marker.setAttribute("refY", "4")
    marker.setAttribute("markerWidth", "6")
    marker.setAttribute("markerHeight", "6")
    marker.setAttribute("orient", "auto-start-reverse")
    const head = doc.createElementNS(SVG_NS, "path")
    head.setAttribute("d", "M0 0L8 4L0 8z")
    head.setAttribute("class", "rf-tip-arrowhead")
    marker.append(head)
    defs.append(marker)
    this.arrows.append(defs)
    for (const target of this.linked(link)) {
      const to = target.getBoundingClientRect()
      const x1 = from.left + from.width / 2 - frame.left
      const y1 = from.top - frame.top
      const x2 = to.left + to.width / 2 - frame.left
      const y2 = to.top - frame.top
      const lift = Math.min(28, 10 + Math.abs(x2 - x1) / 6)
      const path = doc.createElementNS(SVG_NS, "path")
      path.setAttribute(
        "d",
        `M${x1} ${y1 - 1}C${x1} ${Math.min(y1, y2) - lift} ${x2} ${Math.min(y1, y2) - lift} ${x2} ${y2 - 2}`,
      )
      path.setAttribute("marker-end", "url(#rf-tip-arrowhead)")
      this.arrows.append(path)
    }
  }
}

export async function copyText(element: Element, onWarn: LayoutWarnHandler | undefined) {
  const text = valueOrText(element, "data-copy")
  const clipboard = element.ownerDocument.defaultView?.navigator.clipboard
  try {
    if (!clipboard) throw new Error("No clipboard")
    await clipboard.writeText(text)
    element.setAttribute("data-copy-state", "copied")
    setTimeout(() => element.removeAttribute("data-copy-state"), 1500)
  } catch (error) {
    onWarn?.("copyFailed", error)
  }
}

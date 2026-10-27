// @vitest-environment jsdom
import type { LayoutScope } from "../core"
import type { SpeakAdapter } from "../dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { defineLayoutHost } from "../contract"
import { buildLayoutScope } from "../core"
import { LayoutRenderer, sanitizeLayoutHtml } from "../dom"

const HOST = defineLayoutHost({
  id: "test",
  ctxKeys: [],
  ctxKeyKinds: {},
  scopeKey: "name",
  maxSourceLength: 500,
})

function scope(
  values: Record<string, unknown> | null,
  status: "streaming" | "done" = "done",
): LayoutScope {
  const fields = Object.keys(values ?? {}).map((name) => ({ id: name, name, type: "string" }))
  return buildLayoutScope({ host: HOST, fields, values, ctx: {}, status })
}

function html(fragment: DocumentFragment) {
  const div = document.createElement("div")
  div.append(fragment)
  return div.innerHTML
}

describe("sanitizeLayoutHtml", () => {
  it("removes scripts, handlers, forms, frames and ids, and says so", () => {
    const { fragment, removed } = sanitizeLayoutHtml(
      '<p id="x" onclick="alert(1)" class="ok">hi<script>alert(1)</script></p><form><input></form><iframe src="https://x"></iframe>',
    )
    expect(html(fragment)).toBe('<p class="ok">hi</p>')
    expect(removed).toEqual(
      expect.arrayContaining(["<script>", "onclick", "id", "<form>", "<iframe>"]),
    )
  })

  it("keeps http(s) links, opening them in a new tab, and data: images only", () => {
    const { fragment } = sanitizeLayoutHtml(
      '<a href="https://example.com">a</a><a href="javascript:alert(1)">b</a><img src="data:image/png;base64,AA"><img src="https://x/y.png">',
    )
    expect(html(fragment)).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">a</a><a target="_blank" rel="noopener noreferrer">b</a><img src="data:image/png;base64,AA">',
    )
  })

  it("keeps lang, dir and type", () => {
    const { fragment, removed } = sanitizeLayoutHtml(
      '<span lang="es" dir="rtl">hola</span><button type="button">b</button>',
    )
    expect(html(fragment)).toBe(
      '<span lang="es" dir="rtl">hola</span><button type="button">b</button>',
    )
    expect(removed).toEqual([])
  })

  it("keeps data-*, aria-* and SVG, and cleans url() out of style attributes", () => {
    const { fragment, removed } = sanitizeLayoutHtml(
      '<span data-tip="t" aria-label="l" style="background:url(https://x)"><svg viewBox="0 0 2 2"><path d="M0 0"/></svg></span>',
    )
    const span = fragment.querySelector("span")!
    expect(span.dataset.tip).toBe("t")
    expect(span.getAttribute("aria-label")).toBe("l")
    expect(span.getAttribute("style")).toBe("background:none")
    expect(fragment.querySelector("svg path")?.getAttribute("d")).toBe("M0 0")
    expect(fragment.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 2 2")
    expect(removed).toContain("url()")
  })

  it("refuses a render past the element limit", () => {
    expect(() => sanitizeLayoutHtml("<b></b>".repeat(3001))).toThrow(/elements/)
  })
})

describe("LayoutRenderer", () => {
  let renderer: LayoutRenderer | null = null
  afterEach(() => {
    renderer?.destroy()
    renderer = null
    document.body.replaceChildren()
  })

  function mount(speak?: SpeakAdapter) {
    const host = document.createElement("div")
    document.body.append(host)
    renderer = new LayoutRenderer(host, {
      speak: speak && {
        adapter: speak,
        labels: { speak: "Speak", loading: "Loading", playing: "Playing" },
        autoplay: true,
      },
    })
    return { host, root: host.shadowRoot! }
  }

  it("renders into a shadow root and marks the host with status and theme", () => {
    const { host, root } = mount()
    const report = renderer!.render({
      source: '<style>.a{color:red}</style><p class="a">{{ v }}</p>',
      scope: scope({ v: "hello" }),
      status: "done",
      theme: "dark",
    })
    expect(report).toEqual({ removed: [], fellBack: "none" })
    expect(root.querySelector("p")?.textContent).toBe("hello")
    expect(host.dataset.status).toBe("done")
    expect(host.dataset.theme).toBe("dark")
  })

  it("falls back to the next source, then to nothing", () => {
    const { root } = mount()
    const fallback = renderer!.render({
      source: "{% if %}",
      scope: scope({}),
      status: "done",
      theme: "light",
      fallbackSources: ["<p>default</p>"],
    })
    expect(fallback.fellBack).toBe("source")
    expect(fallback.error?.message).toBeTruthy()
    expect(root.querySelector("p")?.textContent).toBe("default")

    const none = renderer!.render({
      source: "{% if %}",
      scope: scope({}),
      status: "done",
      theme: "light",
    })
    expect(none.fellBack).toBe("component")
    expect(root.querySelector("p")).toBeNull()
  })

  it("refuses a source past the host's cap", () => {
    mount()
    const report = renderer!.render({
      source: "x".repeat(501),
      scope: scope({}),
      status: "done",
      theme: "light",
      maxSourceLength: 500,
    })
    expect(report.fellBack).toBe("component")
  })

  it("keeps keyed blocks and toggles across re-renders", () => {
    const { host, root } = mount()
    const source =
      '<button type="button" data-toggle="more">More</button><div data-rf-key="body">{{ v }}</div>'
    renderer!.render({
      source,
      scope: scope({ v: "a" }, "streaming"),
      status: "streaming",
      theme: "light",
    })
    const body = root.querySelector('[data-rf-key="body"]')
    root.querySelector("button")!.click()
    expect(host.dataset.toggles).toBe("more")
    renderer!.render({
      source,
      scope: scope({ v: "ab" }, "streaming"),
      status: "streaming",
      theme: "light",
    })
    expect(root.querySelector('[data-rf-key="body"]')).toBe(body)
    expect(body?.textContent).toBe("ab")
    expect(root.querySelector("button")?.getAttribute("aria-pressed")).toBe("true")
    root.querySelector("button")!.click()
    expect(host.hasAttribute("data-toggles")).toBe(false)
  })

  it("speaks a trigger once the answer is done, and autoplays the marked one", async () => {
    let start: () => void = () => {}
    const adapter: SpeakAdapter = {
      play: vi.fn<SpeakAdapter["play"]>((_text, options) => {
        start = options.onStart
        return new Promise(() => {})
      }),
      stop: vi.fn<SpeakAdapter["stop"]>(),
    }
    const { root } = mount(adapter)
    const source =
      '<button type="button" data-speak="{{ v }}" data-speak-lang="en">s</button><span data-speak data-speak-autoplay lang="es">hola</span>'
    renderer!.render({
      source,
      scope: scope({ v: "hi" }, "streaming"),
      status: "streaming",
      theme: "light",
    })
    root.querySelector("button")!.click()
    expect(adapter.play).not.toHaveBeenCalled()

    renderer!.render({ source, scope: scope({ v: "hi" }), status: "done", theme: "light" })
    await Promise.resolve()
    expect(adapter.play).toHaveBeenLastCalledWith(
      "hola",
      expect.objectContaining({ lang: "es", autoplay: true }),
    )

    const button = root.querySelector("button")!
    button.click()
    expect(adapter.stop).toHaveBeenCalled()
    expect(adapter.play).toHaveBeenLastCalledWith(
      "hi",
      expect.objectContaining({ lang: "en", autoplay: false }),
    )
    expect(button.dataset.speakState).toBe("loading")
    expect(button.getAttribute("aria-label")).toBe("Loading")
    start()
    expect(button.dataset.speakState).toBe("playing")
    button.click()
    expect(button.hasAttribute("data-speak-state")).toBe(false)
    expect(button.getAttribute("aria-label")).toBe("Speak")
  })

  it("shows a tip on focus, with links marked, and hides it on blur", () => {
    const { host, root } = mount()
    renderer!.render({
      source:
        '<span tabindex="0" data-tip-link="k">word<span data-tip-body><b>rich</b> tip</span></span> <span data-tip-key="k">head</span>',
      scope: scope({}),
      status: "done",
      theme: "light",
    })
    const owner = root.querySelector<HTMLElement>("[data-tip-link]")!
    owner.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true }))
    expect(host.hasAttribute("data-tip-active")).toBe(true)
    expect(owner.dataset.tipState).toBe("active")
    expect(root.querySelector<HTMLElement>("[data-tip-key]")!.dataset.tipState).toBe("linked")
    const bubble = root.querySelector<HTMLElement>(".rf-tip")!
    expect(bubble.hidden).toBe(false)
    expect(bubble.innerHTML).toBe("<b>rich</b> tip")
    owner.dispatchEvent(new FocusEvent("focusout", { bubbles: true, composed: true }))
    expect(bubble.hidden).toBe(true)
    expect(host.hasAttribute("data-tip-active")).toBe(false)
  })

  it("copies a value", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {})
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    const { root } = mount()
    renderer!.render({
      source: '<button type="button" data-copy="{{ v }}">c</button>',
      scope: scope({ v: "text" }),
      status: "done",
      theme: "light",
    })
    root.querySelector("button")!.click()
    await vi.waitFor(() => expect(root.querySelector("button")?.dataset.copyState).toBe("copied"))
    expect(writeText).toHaveBeenCalledWith("text")
  })
})

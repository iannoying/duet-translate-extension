// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  BLOCK_ATTRIBUTE,
  CONTENT_WRAPPER_CLASS,
  PARAGRAPH_ATTRIBUTE,
} from "@/utils/constants/dom-labels"
import { removeAllTranslatedWrapperNodes } from "../../dom/translation-cleanup"
import { translateNodesBilingualMode } from "../translation-modes"

const { mockTranslateTextForPage } = vi.hoisted(() => ({
  mockTranslateTextForPage: vi.fn<(...args: any[]) => any>(),
}))

vi.mock("@/utils/host/translate/filter-small-paragraph", () => ({
  shouldFilterSmallParagraph: vi.fn<(...args: any[]) => any>().mockResolvedValue(false),
}))

vi.mock("@/utils/host/translate/target-language-skip", () => ({
  shouldSkipAsTargetLanguage: vi.fn<(...args: any[]) => any>().mockResolvedValue(false),
}))

vi.mock("@/utils/host/translate/translate-variants", () => ({
  translateTextForPage: mockTranslateTextForPage,
}))

vi.mock("@/utils/host/translate/ui/decorate-translation", () => ({
  decorateTranslationNode: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
}))

function createParagraph(markup: string): HTMLElement {
  const source = document.createElement("p")
  source.innerHTML = markup
  source.setAttribute(BLOCK_ATTRIBUTE, "")
  source.setAttribute(PARAGRAPH_ATTRIBUTE, "")
  document.body.append(source)
  return source
}

function translatedContent(source: HTMLElement): HTMLElement {
  const wrapper = source.querySelector<HTMLElement>(`.${CONTENT_WRAPPER_CLASS}`)
  expect(wrapper).not.toBeNull()
  return wrapper!.lastElementChild as HTMLElement
}

describe("bilingual translation keeps source links", () => {
  beforeEach(() => {
    document.body.replaceChildren()
    mockTranslateTextForPage.mockReset()
  })

  afterEach(() => {
    removeAllTranslatedWrapperNodes(document)
  })

  it("sends link markers and links the translated words", async () => {
    const source = createParagraph(
      'Read the <a href="https://docs.test/start" class="ext">official documentation</a> before you install it.',
    )
    mockTranslateTextForPage.mockResolvedValue("安装之前，请先阅读<a0>官方文档</a0>。")

    await translateNodesBilingualMode([source], "walk-1", DEFAULT_CONFIG)

    expect(mockTranslateTextForPage.mock.calls[0]![0]).toBe(
      "Read the <a0>official documentation</a0> before you install it.",
    )
    const content = translatedContent(source)
    expect(content.textContent).toBe("安装之前，请先阅读官方文档。")
    const link = content.querySelector("a")!
    expect(link.textContent).toBe("官方文档")
    expect(link.getAttribute("href")).toBe("https://docs.test/start")
    expect(link.className).toBe("ext")
  })

  it("sends no markers when the whole paragraph is one link", async () => {
    const source = createParagraph(
      '<a href="https://docs.test/start">Read the official documentation first</a>',
    )
    mockTranslateTextForPage.mockResolvedValue("请先阅读官方文档")

    await translateNodesBilingualMode([source], "walk-1", DEFAULT_CONFIG)

    expect(mockTranslateTextForPage.mock.calls[0]![0]).toBe("Read the official documentation first")
    expect(source.querySelectorAll("a")).toHaveLength(1)
    expect(source.textContent).toContain("请先阅读官方文档")
  })

  it("keeps the words when the provider breaks the markers", async () => {
    const source = createParagraph(
      'Read the <a href="https://docs.test/start">official documentation</a> before you install it.',
    )
    mockTranslateTextForPage.mockResolvedValue("安装之前，请先阅读<a0>官方文档。")

    await translateNodesBilingualMode([source], "walk-1", DEFAULT_CONFIG)

    const content = translatedContent(source)
    expect(content.querySelector("a")).toBeNull()
    expect(content.textContent).toBe("安装之前，请先阅读官方文档。")
  })
})

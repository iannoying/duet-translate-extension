import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  EBOOK_BRIDGE_HANDSHAKE_TYPE,
  EBOOK_BRIDGE_PAGE_SOURCE,
  EBOOK_BRIDGE_SELECTION_CHANGED_TYPE,
  EBOOK_SELECTION_BRIDGE_PROTOCOL_VERSION,
  ebookBridgePageMessageSchema,
  formatClientContextHeader,
  getBilibiliVideoIdFromUrl,
  getVideoIdFromUrl,
  ISO6393_TO_6391,
  LANG_CODE_ISO6391_OPTIONS,
  LANG_CODE_ISO6393_OPTIONS,
  LANG_CODE_TO_EN_NAME,
  LANG_CODE_TO_LOCALE_NAME,
  latestBlogResponseSchema,
  LOCALE_TO_ISO6393,
  RTL_LANG_CODES,
  speechLanguageFromTag,
} from ".."

describe("languages", () => {
  it("names every language in English and in itself", () => {
    for (const code of LANG_CODE_ISO6393_OPTIONS) {
      expect(LANG_CODE_TO_EN_NAME[code]).toBeTruthy()
      expect(LANG_CODE_TO_LOCALE_NAME[code]).toBeTruthy()
    }
  })

  it("lists exactly the languages the locale files name, in their order", () => {
    const en = readFileSync(resolve(__dirname, "../../locales/en.yml"), "utf8")
    const section = en.slice(en.indexOf("\nlanguages:\n"))
    const keys = [...section.matchAll(/^ {2}([a-zA-Z]+):/gm)].map(([, key]) => key)
    const camel = LANG_CODE_ISO6393_OPTIONS.map((code) => code.replace("-Hant", "Hant"))
    expect(keys.slice(0, camel.length)).toEqual(camel)
  })

  it("maps only to listed ISO 639-1 tags", () => {
    const tags = Object.values(ISO6393_TO_6391).filter((tag) => tag !== undefined)
    for (const tag of tags) expect(LANG_CODE_ISO6391_OPTIONS).toContain(tag)
    for (const code of RTL_LANG_CODES) expect(LANG_CODE_ISO6393_OPTIONS).toContain(code)
  })

  it("reads a tag as the first language listed with it", () => {
    expect(LOCALE_TO_ISO6393.zh).toBe("cmn")
    expect(LOCALE_TO_ISO6393["zh-TW"]).toBe("cmn-Hant")
    expect(LOCALE_TO_ISO6393.en).toBe("eng")
  })
})

describe("speechLanguageFromTag", () => {
  it.each([
    ["es-ES", "spa"],
    ["es", "spa"],
    ["en_US", "eng"],
    ["zh", "cmn"],
    ["zh-CN", "cmn"],
    ["zh-Hans", "cmn"],
    ["zh-TW", "cmn-Hant"],
    ["zh-Hant-HK", "cmn-Hant"],
    ["zh-yue", "yue"],
    ["cmn-Hant", "cmn-Hant"],
    ["yue", "yue"],
    ["jpn", "jpn"],
  ])("reads %s as %s", (tag, code) => {
    expect(speechLanguageFromTag(tag)).toBe(code)
  })

  it("names no language for an unknown or empty tag", () => {
    expect(speechLanguageFromTag("not a language")).toBeUndefined()
    expect(speechLanguageFromTag("")).toBeUndefined()
    expect(speechLanguageFromTag(undefined)).toBeUndefined()
  })
})

describe("getVideoIdFromUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=test123", "test123"],
    ["https://youtu.be/dQw4w9WgXcQ?si=x", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/abc_DEF-123", "abc_DEF-123"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("finds the video in %s", (url, id) => {
    expect(getVideoIdFromUrl(url)).toBe(id)
  })

  it.each([
    "https://www.youtube.com/",
    "https://www.youtube.com/watch",
    "https://www.youtube.com/@channel",
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "not a url",
  ])("finds no video in %s", (url) => {
    expect(getVideoIdFromUrl(url)).toBeNull()
  })

  it("finds a bilibili video only on bilibili", () => {
    expect(getBilibiliVideoIdFromUrl("https://www.bilibili.com/video/BV1JoAszwEfF/")).toBe(
      "BV1JoAszwEfF",
    )
    expect(getBilibiliVideoIdFromUrl("https://example.com/video/BV1JoAszwEfF/")).toBeNull()
    expect(getBilibiliVideoIdFromUrl("https://www.bilibili.com/read/cv1")).toBeNull()
  })
})

describe("formatClientContextHeader", () => {
  it("names the surface, then the guide when the user is in it", () => {
    expect(formatClientContextHeader({ surface: "custom_action" })).toBe("surface=custom_action")
    expect(formatClientContextHeader({ surface: "note_suggestion", isGuide: true })).toBe(
      "surface=note_suggestion, guide",
    )
  })
})

describe("latestBlogResponseSchema", () => {
  it("reads a post's date, and no post as null", () => {
    const post = latestBlogResponseSchema.parse({
      date: "2026-03-20T12:00:00.000Z",
      title: "Spring release",
      url: "/blog/spring-release",
      type: "update",
    })
    expect(post?.date).toEqual(new Date("2026-03-20T12:00:00.000Z"))
    expect(latestBlogResponseSchema.parse(null)).toBeNull()
  })
})

describe("ebookBridgePageMessageSchema", () => {
  const base = {
    source: EBOOK_BRIDGE_PAGE_SOURCE,
    protocolVersion: EBOOK_SELECTION_BRIDGE_PROTOCOL_VERSION,
  }

  it("reads a handshake and a selection", () => {
    expect(
      ebookBridgePageMessageSchema.safeParse({ ...base, type: EBOOK_BRIDGE_HANDSHAKE_TYPE })
        .success,
    ).toBe(true)
    const selection = {
      requestId: "r",
      text: "t",
      contextParagraphs: [],
      rect: { top: 0, left: 0, width: 1, height: 1 },
      anchor: { x: 1, y: 1 },
      direction: "bottom-left",
    }
    expect(
      ebookBridgePageMessageSchema.safeParse({
        ...base,
        type: EBOOK_BRIDGE_SELECTION_CHANGED_TYPE,
        data: selection,
      }).success,
    ).toBe(true)
  })

  it("ignores another protocol version", () => {
    expect(
      ebookBridgePageMessageSchema.safeParse({
        ...base,
        protocolVersion: EBOOK_SELECTION_BRIDGE_PROTOCOL_VERSION + 1,
        type: EBOOK_BRIDGE_HANDSHAKE_TYPE,
      }).success,
    ).toBe(false)
  })
})

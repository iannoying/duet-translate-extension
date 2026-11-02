import { describe, expect, it } from "vitest"
import {
  areLinkMarkersIntact,
  containsLinkMarkerLiteral,
  decodeLinkMarkers,
  hasLinkMarkers,
  linkMarkersFromGoogleHtml,
  linkMarkersToGoogleHtml,
  restoreEscapedLinkMarkers,
  stripLinkMarkers,
} from "../link-markers"

describe("link markers", () => {
  it("detects only complete pairs in the emitted shape", () => {
    expect(hasLinkMarkers("Read the <a0>docs</a0>.")).toBe(true)
    expect(hasLinkMarkers("Read the <a0>docs.")).toBe(false)
    expect(hasLinkMarkers("Use <a href='x'>docs</a>.")).toBe(false)
    expect(hasLinkMarkers("plain text")).toBe(false)
  })

  it("detects marker-shaped literals, spaced or uppercase", () => {
    expect(containsLinkMarkerLiteral("print <A1> here")).toBe(true)
    expect(containsLinkMarkerLiteral("print < /a2 > here")).toBe(true)
    expect(containsLinkMarkerLiteral("print <abbr> here")).toBe(false)
  })

  it("splits a reordered translation into plain and linked runs", () => {
    expect(
      decodeLinkMarkers("在安装<a1>浏览器扩展</a1>之前，请先阅读<a0>官方文档</a0>。", 2),
    ).toEqual([
      { text: "在安装", linkIndex: null },
      { text: "浏览器扩展", linkIndex: 1 },
      { text: "之前，请先阅读", linkIndex: null },
      { text: "官方文档", linkIndex: 0 },
      { text: "。", linkIndex: null },
    ])
  })

  it("tolerates a dropped pair and loose tag spelling", () => {
    expect(decodeLinkMarkers("阅读 < A0 >文档</a0 > 后安装扩展。", 2)).toEqual([
      { text: "阅读 ", linkIndex: null },
      { text: "文档", linkIndex: 0 },
      { text: " 后安装扩展。", linkIndex: null },
    ])
  })

  it.each([
    ["unclosed", "阅读<a0>文档。"],
    ["mismatched close", "阅读<a0>文档</a1>。"],
    ["nested", "<a0>阅读<a1>文档</a1></a0>"],
    ["duplicated", "<a0>阅读</a0><a0>文档</a0>"],
    ["never issued", "阅读<a5>文档</a5>"],
  ])("drops every marker but keeps the words when the structure is %s", (_, text) => {
    const decoded = decodeLinkMarkers(text, 2)
    expect(decoded).toHaveLength(1)
    expect(decoded[0]!.linkIndex).toBeNull()
    expect(decoded[0]!.text).toBe(stripLinkMarkers(text))
    expect(areLinkMarkersIntact("<a0>x</a0> <a1>y</a1>", text)).toBe(false)
  })

  it("accepts a translation that kept or dropped pairs cleanly", () => {
    const source = "Read <a0>docs</a0> and <a1>FAQ</a1>."
    expect(areLinkMarkersIntact(source, "阅读<a0>文档</a0>和<a1>常见问题</a1>。")).toBe(true)
    expect(areLinkMarkersIntact(source, "阅读文档和<a1>常见问题</a1>。")).toBe(true)
  })

  it("round-trips through Google's anchor form", () => {
    const escaped = "a &lt; b, read the &lt;a0&gt;docs&lt;/a0&gt; &amp;lt;a1&amp;gt;"
    expect(linkMarkersToGoogleHtml(escaped)).toBe(
      'a &lt; b, read the <a id="0">docs</a> &amp;lt;a1&amp;gt;',
    )
    // Response captured from translateHtml (en → zh-CN), reordered.
    const response =
      '在电脑上安装<a id="1">浏览器扩展程序</a>之前，请先阅读<a id="0">官方文档</a>。'
    expect(linkMarkersFromGoogleHtml(response)).toBe(
      "在电脑上安装<a1>浏览器扩展程序</a1>之前，请先阅读<a0>官方文档</a0>。",
    )
    expect(linkMarkersFromGoogleHtml('<a href="x">外</a>部')).toBe("外部")
  })

  it("restores escaped markers as raw tags for Microsoft", () => {
    expect(restoreEscapedLinkMarkers("x &lt; y &lt;a0&gt;docs&lt;/a0&gt;")).toBe(
      "x &lt; y <a0>docs</a0>",
    )
  })
})

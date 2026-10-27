import { describe, expect, it } from "vitest"
import { defineLayoutHost, formatFieldRef } from "../contract"
import {
  annotate,
  buildLayoutScope,
  compileLayout,
  getCompiledLayoutCss,
  parseJson,
  renderLayoutHtml,
  sanitizeCss,
} from "../core"

const HOST = defineLayoutHost({
  id: "test",
  ctxKeys: ["selection"],
  ctxKeyKinds: { selection: "string" },
  scopeKey: "name",
  maxSourceLength: 1000,
})

function render(source: string, values: Record<string, unknown> | null = {}, selection = "") {
  const compiled = compileLayout(source)
  if (!compiled.ok) throw compiled.error
  const fields = Object.keys(values ?? {}).map((name) => ({ id: name, name, type: "string" }))
  return renderLayoutHtml(
    compiled.compiled,
    buildLayoutScope({ host: HOST, fields, values, ctx: { selection }, status: "done" }),
  )
}

function enters(text: string, items: unknown, ...keys: string[]) {
  return annotate(text, items, ...keys).flatMap((event) =>
    event.kind === "enter"
      ? [`${event.key}${event.index}@${event.depth}${event.leaf ? "" : "+"}`]
      : [],
  )
}

describe("the host contract", () => {
  it("puts fields first and status last in ctx", () => {
    expect(HOST.ctxKeys).toEqual(["fields", "selection", "status"])
  })

  it("writes field references that survive any name", () => {
    expect(formatFieldRef("the term")).toBe('["the term"]')
    const name = 'a "q" %} }} {{ \\ end'
    expect(render(`{{ ${formatFieldRef(name)} }}`, { [name]: "ok" })).toBe("ok")
  })
})

describe("rendering", () => {
  it("escapes every output, and raw and escape change nothing", () => {
    expect(render("{{ v }}|{{ v | raw }}|{{ v | escape }}", { v: `<b>"it's"</b>` })).toBe(
      "&lt;b&gt;&#34;it&#39;s&#34;&lt;/b&gt;|".repeat(3).slice(0, -1),
    )
  })

  it("keeps line breaks with newline_to_br, escaping the rest", () => {
    expect(render("{{ v | newline_to_br }}", { v: "a<\nb" })).toBe("a&lt;<br>b")
  })

  it("splits lines with lines", () => {
    expect(render("{% assign l = v | lines %}{{ l | join: '|' }}", { v: " a \n\n b\r\nc " })).toBe(
      "a|b|c",
    )
  })

  it("refuses tags and filters outside the contract", () => {
    for (const source of [
      "{% include 'x' %}",
      "{% capture a %}{% endcapture %}",
      "{{ a | date: '%Y' }}",
    ]) {
      expect(compileLayout(source).ok).toBe(false)
    }
  })

  it("reads own properties only", () => {
    expect(render("{{ v.constructor }}{{ v.length }}", { v: "abc" })).toBe("3")
  })

  it("cuts style blocks out of the markup and cleans their CSS", () => {
    const compiled = compileLayout(
      "<style>@import url(x.css);\n.a{background:url(https://x/y.png)}\n.b{background:url(data:image/png;base64,AA)}</style><p>{{ 1 }}</p>",
    )
    if (!compiled.ok) throw compiled.error
    expect(getCompiledLayoutCss(compiled.compiled)).toBe(
      "\n.a{background:none}\n.b{background:url(data:image/png;base64,AA)}",
    )
    expect(compiled.compiled.cssRemoved).toEqual(["@import", "url()"])
    expect(renderLayoutHtml(compiled.compiled, {})).toBe("<p>1</p>")
  })

  it("drops @font-face blocks whole", () => {
    expect(sanitizeCss("@font-face{font-family:x;src:url(a.woff)}.a{color:red}")).toEqual({
      css: ".a{color:red}",
      removed: ["@font-face"],
    })
  })
})

describe("the layout scope", () => {
  it("reads number fields as numbers and blank values as nil", () => {
    const scope = buildLayoutScope({
      host: HOST,
      fields: [
        { id: "n", name: "n", type: "number" },
        { id: "s", name: "s", type: "string" },
        { id: "m", name: "missing", type: "string" },
      ],
      values: { n: " 3 ", s: "  " },
      ctx: { selection: "x" },
      status: "streaming",
    })
    expect(scope.n).toBe(3)
    expect(scope.s).toBeNull()
    const ctx = scope.ctx as { fields: Array<{ pending: boolean }>; status: string }
    expect(ctx.fields.map((field) => field.pending)).toEqual([false, false, true])
    expect(ctx.status).toBe("streaming")
  })

  it("never lets a field take ctx's place", () => {
    const scope = buildLayoutScope({
      host: HOST,
      fields: [{ id: "c", name: "ctx", type: "string" }],
      values: { ctx: "mine" },
      ctx: { selection: "s" },
      status: "done",
    })
    expect((scope.ctx as { selection: string }).selection).toBe("s")
  })
})

describe("parse_json", () => {
  it("parses JSON, unwraps a code fence, and gives nil for anything else", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 })
    expect(parseJson("```json\n[1,2]\n```")).toEqual([1, 2])
    expect(parseJson("not json")).toBeNull()
    expect(parseJson(3)).toBeNull()
    expect(parseJson("x".repeat(100_001))).toBeNull()
  })

  it("returns the completed items of a truncated array", () => {
    expect(parseJson('[{"a":1},{"b":"x, y"},{"c"')).toEqual([{ a: 1 }, { b: "x, y" }])
    expect(parseJson('["one", "tw')).toEqual(["one"])
    expect(parseJson("[")).toEqual([])
  })
})

describe("annotate", () => {
  it("covers the whole text in order, nesting spans", () => {
    const events = annotate("The big dog barked.", [
      { text: "The big dog" },
      { text: "big" },
      { text: "barked" },
    ])
    expect(events.map((event) => (event.kind === "text" ? event.text : event.kind))).toEqual([
      "enter",
      "The ",
      "enter",
      "big",
      "leave",
      " dog",
      "leave",
      " ",
      "enter",
      "barked",
      "leave",
      ".",
    ])
    expect(enters("The big dog barked.", [{ text: "The big dog" }, { text: "big" }])).toEqual([
      "text0@0+",
      "text1@1",
    ])
  })

  it("ignores case, whitespace runs, typographic quotes and dashes", () => {
    expect(enters("It’s  a well—known FACT", [{ text: "it's a well-known fact" }])).toEqual([
      "text0@0",
    ])
  })

  it("lets … stand for skipped words, and picks the nth occurrence", () => {
    const events = annotate("turn it down, turn it up", [
      { text: "turn … up" },
      { text: "turn", occurrence: 2 },
    ])
    expect(events[0]).toEqual({ kind: "text", text: "turn it down, " })
    expect(
      enters("turn it down, turn it up", [{ text: "turn … up" }, { text: "turn", occurrence: 2 }]),
    ).toEqual(["text0@0+", "text1@1"])
    expect(enters("a b a b", [{ text: "b", occurrence: 2 }])).toEqual(["text0@0"])
    const second = annotate("a b a b", [{ text: "b", occurrence: 2 }])
    expect(second[0]).toEqual({ kind: "text", text: "a b a " })
  })

  it("prefers whole words and drops spans that partly overlap or match nothing", () => {
    expect(annotate("certified if", [{ text: "if" }])[0]).toEqual({
      kind: "text",
      text: "certified ",
    })
    expect(
      enters("one two three", [{ text: "one two" }, { text: "two three" }, { text: "four" }]),
    ).toEqual(["text0@0"])
  })

  it("links a second key to the nearest match", () => {
    expect(
      enters(
        "the report that I read, the report",
        [{ text: "that I read", head: "report" }],
        "text",
        "head",
      ),
    ).toEqual(["head0@0", "text0@0"])
    const events = annotate(
      "the report that I read, the report",
      [{ text: "that I read", head: "report" }],
      "text",
      "head",
    )
    expect(events[0]).toEqual({ kind: "text", text: "the " })
  })

  it("gives plain text for anything it cannot read", () => {
    expect(annotate("abc", null)).toEqual([{ kind: "text", text: "abc" }])
    expect(annotate(null, [{ text: "a" }])).toEqual([])
    expect(annotate("x".repeat(20_001), [{ text: "x" }])).toHaveLength(1)
  })
})

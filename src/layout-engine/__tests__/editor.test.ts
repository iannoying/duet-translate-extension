import { describe, expect, it } from "vitest"
import { defineLayoutHost } from "../contract"
import { analyzeLayout, lintLayout, renameLayoutFieldRefs } from "../editor"

const HOST = defineLayoutHost({
  id: "test",
  ctxKeys: ["selection"],
  ctxKeyKinds: { selection: "string" },
  scopeKey: "name",
  maxSourceLength: 200,
})

const FIELDS = [
  { id: "a", name: "Term", type: "string" },
  { id: "b", name: "the note", type: "string" },
]

function codes(source: string, fields = FIELDS) {
  return lintLayout(source, HOST, fields).map((diagnostic) => diagnostic.code)
}

describe("lintLayout", () => {
  it("passes a layout that shows every field", () => {
    expect(codes('<p title="{{ Term }}">{{ ["the note"] | upcase }}</p>')).toEqual([])
  })

  it("reports syntax errors with their place", () => {
    const [diagnostic] = lintLayout("ab {% if x %}", HOST, [])
    expect(diagnostic).toMatchObject({ code: "parseError", severity: "error", from: 3 })
  })

  it("reports names that read nothing, and unknown ctx keys", () => {
    expect(
      codes("{{ Term }}{{ ['the note'] }}{{ Nope }}{{ ctx.side }}{{ ctx['selection'] }}"),
    ).toEqual(["unknownField", "unknownContextKey"])
  })

  it("never takes locals, loop variables or forloop for fields", () => {
    expect(
      codes(
        "{% assign x = Term %}{% for f in ctx.fields %}{{ f.name }}{{ forloop.index }}{% endfor %}{{ x }}",
      ),
    ).toEqual([])
  })

  it("reports a local that hides a field", () => {
    expect(codes('{% assign Term = "x" %}{{ Term }}{{ ["the note"] }}')).toContain(
      "fieldShadowedByLocal",
    )
  })

  it("lists fields the layout never shows, unless it walks ctx.fields", () => {
    expect(lintLayout("{{ Term }}", HOST, FIELDS).at(-1)).toMatchObject({
      code: "fieldNotShown",
      severity: "info",
      params: ["the note"],
    })
    expect(codes("{% for f in ctx.fields %}{% endfor %}")).toEqual([])
  })

  it("reports Liquid in style blocks, style blocks in conditions, and CSS that is dropped", () => {
    expect(
      codes(
        "{% if Term %}<style>@import 'x';@font-face{} .a{color:{{ c }}}</style>{% endif %}{{ ['the note'] }}",
      ),
    ).toEqual(["styleInConditional", "cssImport", "cssFontFace", "liquidInStyle"])
  })

  it("reports unquoted attribute outputs and misplaced filters", () => {
    expect(codes("<p title={{ Term }}>{{ ['the note'] | newline_to_br | upcase }}</p>")).toEqual([
      "unquotedAttributeOutput",
      "newlineToBrNotLast",
    ])
    expect(codes("{% for t in Term | split: ',' %}{% endfor %}{{ ['the note'] }}")).toEqual([
      "filterIgnored",
    ])
  })

  it("skips raw and comment bodies", () => {
    expect(
      codes(
        "{% raw %}{{ Nope }}{% endraw %}{% comment %}{{ Nope }}{% endcomment %}{{ Term }}{{ ['the note'] }}",
      ),
    ).toEqual([])
  })

  it("reports a layout past the host's cap and a reserved field name", () => {
    expect(codes(`{{ Term }}{{ ["the note"] }}${" ".repeat(200)}`)).toEqual(["tooLong"])
    expect(codes("{{ ctx.selection }}", [{ id: "c", name: "ctx", type: "string" }])).toEqual([
      "reservedFieldName",
    ])
  })
})

describe("analyzeLayout", () => {
  it("lists the names a layout reads and whether it walks ctx.fields", () => {
    const analysis = analyzeLayout('{{ Term }}{% if ["the note"] %}{% endif %}{{ ctx.selection }}')
    expect(analysis.refs.map((ref) => ref.name)).toEqual(["Term", "the note"])
    expect(analysis.usesCtxFields).toBe(false)
    expect(analysis.parseError).toBeNull()
    expect(analyzeLayout("{% for f in ctx.fields %}{% endfor %}").usesCtxFields).toBe(true)
    expect(analyzeLayout("{% if %}").parseError).not.toBeNull()
  })
})

describe("renameLayoutFieldRefs", () => {
  it("moves bare and bracketed references, and nothing else", () => {
    const source = '{{ Term }}{{ ["Term"] | size }}{{ ctx.Term }}{{ f.Term }}"Term"'
    expect(renameLayoutFieldRefs(source, [{ from: "Term", to: "New name" }], HOST)).toEqual({
      source: '{{ ["New name"] }}{{ ["New name"] | size }}{{ ctx.Term }}{{ f.Term }}"Term"',
      changed: true,
    })
  })

  it("skips a rename onto a local's name, and a layout that does not parse", () => {
    expect(
      renameLayoutFieldRefs("{% assign x = 1 %}{{ Term }}", [{ from: "Term", to: "x" }], HOST),
    ).toMatchObject({ changed: false, skipped: "shadowed" })
    expect(renameLayoutFieldRefs("{% if Term %}", [{ from: "Term", to: "y" }], HOST)).toMatchObject(
      {
        changed: false,
        skipped: "parseError",
      },
    )
  })
})

/**
 * The layout engine's contract: the words a host and a layout share. Kept
 * free of dependencies, because the presets and the config constants that
 * every entrypoint bundles import it.
 *
 * A layout is HTML with Liquid. A host (such as custom actions) says which
 * fields a layout can read, by which key, and what `ctx` carries next to the
 * built-in `ctx.fields` and `ctx.status`.
 */

export type LayoutStatus = "streaming" | "done" | "error"

// A field a layout can read: its stable id, the name layouts write, and its type.
export interface LayoutField {
  id: string
  name: string
  type: string
  description?: string
}

export type LayoutCtxKeyKind = "string" | "number" | "object" | "array"

export interface LayoutHost {
  readonly id: string
  // Every key of `ctx`, in order: `fields`, the host's own, then `status`.
  readonly ctxKeys: readonly string[]
  readonly ctxKeyKinds: Readonly<Record<string, LayoutCtxKeyKind>>
  // Whether the answer's values are keyed by field name or by field id.
  readonly scopeKey: "name" | "id"
  readonly maxSourceLength: number
}

export interface LayoutHostDefinition {
  id: string
  ctxKeys: readonly string[]
  ctxKeyKinds: Readonly<Record<string, LayoutCtxKeyKind>>
  scopeKey: "name" | "id"
  maxSourceLength: number
}

// The root every host value hangs off: `{{ ctx.selection }}`.
export const LAYOUT_CTX_ROOT = "ctx"

// Names a field cannot be read by at the top level of a layout: `ctx` is the
// host's, `forloop` belongs to every `for` tag.
export const LAYOUT_RESERVED_FIELD_NAMES = [LAYOUT_CTX_ROOT, "forloop"] as const

export function defineLayoutHost(definition: LayoutHostDefinition): LayoutHost {
  const own = definition.ctxKeys.filter((key) => key !== "fields" && key !== "status")
  return Object.freeze({
    id: definition.id,
    ctxKeys: Object.freeze(["fields", ...own, "status"]),
    ctxKeyKinds: Object.freeze({
      fields: "array",
      ...definition.ctxKeyKinds,
      status: "string",
    } satisfies Record<string, LayoutCtxKeyKind>),
    scopeKey: definition.scopeKey,
    maxSourceLength: definition.maxSourceLength,
  })
}

// A field reference that works for any name: `["the term"]`. `%`, `{` and `}`
// are written as `\u` escapes, so a name can never close the tag around it.
export function formatFieldRef(name: string): string {
  const literal = JSON.stringify(name)
    .replaceAll("%", "\\u0025")
    .replaceAll("{", "\\u007b")
    .replaceAll("}", "\\u007d")
  return `[${literal}]`
}

// Liquid tags a layout may use. `#` is the inline comment, `{% # note %}`.
// Everything that reaches outside the template (include, render, layout),
// writes output out of order (capture, echo, cycle) or keeps state across
// renders (increment) is left out.
export const LAYOUT_ALLOWED_TAGS = [
  "assign",
  "if",
  "elsif",
  "else",
  "unless",
  "case",
  "when",
  "for",
  "break",
  "continue",
  "comment",
  "raw",
  "#",
] as const

// Filters a layout may use: the standard text, number and list filters, plus
// the engine's own (`parse_json`, `lines`, `annotate`, `newline_to_br`).
export const LAYOUT_FILTER_NAMES = [
  "abs",
  "append",
  "at_least",
  "at_most",
  "capitalize",
  "ceil",
  "compact",
  "concat",
  "default",
  "divided_by",
  "downcase",
  "escape",
  "first",
  "floor",
  "join",
  "last",
  "lstrip",
  "map",
  "minus",
  "modulo",
  "plus",
  "prepend",
  "raw",
  "remove",
  "remove_first",
  "replace",
  "replace_first",
  "reverse",
  "round",
  "rstrip",
  "size",
  "slice",
  "sort",
  "sort_natural",
  "split",
  "strip",
  "strip_html",
  "strip_newlines",
  "sum",
  "times",
  "truncate",
  "truncatewords",
  "uniq",
  "upcase",
  "where",
  "newline_to_br",
  "parse_json",
  "lines",
  "annotate",
] as const

export type LayoutFilterName = (typeof LAYOUT_FILTER_NAMES)[number]

// Theme variables a layout reads as `var(--rf-<token>)`; the host page
// defines them for light and dark mode.
export const LAYOUT_THEME_TOKENS = [
  "popover",
  "popover-foreground",
  "muted",
  "muted-foreground",
  "secondary",
  "accent",
  "border",
  "ring",
  "radius",
] as const

// Limits on one render. A layout that breaks one falls back.
export const LAYOUT_MAX_RENDERED_LENGTH = 200_000
export const LAYOUT_MAX_ELEMENTS = 3_000
export const LAYOUT_DEFAULT_RENDER_BUDGET = { renderLimitMs: 200 } as const

// `parse_json` gives nil for text longer than this.
export const LAYOUT_PARSE_JSON_MAX_LENGTH = 100_000
// `annotate` reads at most this many items, and marks nothing in longer text.
export const LAYOUT_ANNOTATE_MAX_ITEMS = 200
export const LAYOUT_ANNOTATE_MAX_TEXT_LENGTH = 20_000

export type LayoutLintCode =
  | "parseError"
  | "unknownField"
  | "unknownContextKey"
  | "fieldShadowedByLocal"
  | "liquidInStyle"
  | "styleInConditional"
  | "cssImport"
  | "cssFontFace"
  | "unquotedAttributeOutput"
  | "filterIgnored"
  | "newlineToBrNotLast"
  | "tooLong"
  | "fieldNotShown"
  | "reservedFieldName"

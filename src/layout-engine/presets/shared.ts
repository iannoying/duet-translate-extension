import { FIELD_ROW_CSS, SPEAK_BUTTON_ICONS, TYPE_ICON } from "./default-layout"

/**
 * Pieces the generated cards share. A card finds its fields by id in
 * `ctx.fields`, never by name: names are localized and editable, ids are
 * stable. Fields the card has no place for follow it as plain rows, like the
 * default layout's.
 */

// A double-quoted Liquid string literal. `%`, `{` and `}` are `\u` escapes,
// since liquidjs ends a tag at the first `%}` even inside quotes.
export function liquidString(text: string): string {
  const escaped = text
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("%", "\\u0025")
    .replaceAll("{", "\\u007b")
    .replaceAll("}", "\\u007d")
  return `"${escaped}"`
}

// `f.id` is one of `ids`, compared exactly.
function isOneOf(ids: readonly string[]): string {
  if (ids.length === 0) return "false"
  return ids.map((id) => `f.id == ${liquidString(id)}`).join(" or ")
}

/**
 * Assigns each slot's field entry (`{id, name, type, value, pending}`) to a
 * local: `{"d_term": "default-dictionary-term"}` → `d_term`. A slot without
 * a field stays nil.
 */
export function assignSlots(locals: Readonly<Record<string, string | undefined>>): string {
  const branches = Object.entries(locals).flatMap(([local, id]) =>
    id === undefined
      ? []
      : [`{%- if f.id == ${liquidString(id)} -%}{%- assign ${local} = f -%}{%- endif -%}`],
  )
  if (branches.length === 0) return ""
  return `{%- for f in ctx.fields -%}${branches.join("")}{%- endfor -%}\n`
}

// The text a card marks up: a field that holds the selection, else ctx's.
export type CardSource = { fieldId: string } | { ctxKey: "selection" }

export function assignSource(local: string, source: CardSource): string {
  const fromCtx = `{%- assign ${local} = ctx.selection -%}`
  if ("ctxKey" in source) return `${fromCtx}\n`
  // The field has the selection from the first frame; ctx's covers a copy
  // whose field was emptied.
  const field = `${local}_f`
  return `${fromCtx}${assignSlots({ [field]: source.fieldId }).trimEnd()}{%- if ${field}.value != blank -%}{%- assign ${local} = ${field}.value -%}{%- endif -%}\n`
}

export const TAIL_CSS = `${FIELD_ROW_CSS}
.rf-tail{display:flex;flex-direction:column;gap:12px}`

// Rows for every field but `known`, in schema order, under the card.
export function tailRows(known: readonly string[]): string {
  return `{%- assign rf_tail = false -%}
{%- for f in ctx.fields -%}{%- unless ${isOneOf(known)} -%}{%- assign rf_tail = true -%}{%- endunless -%}{%- endfor -%}
{%- if rf_tail %}
<div class="rf-tail">
  {%- for f in ctx.fields -%}{%- unless ${isOneOf(known)} %}
  <section class="rf-field" data-rf-key="{{ f.id }}">
    <div class="rf-head"><span class="rf-label">${TYPE_ICON}<span class="rf-name">{{ f.name }}</span></span></div>
    <div class="rf-value">{% if f.pending %}…{% elsif f.value == blank %}—{% else %}{{ f.value }}{% endif %}</div>
  </section>
  {%- endunless -%}{%- endfor %}
</div>
{%- endif %}`
}

// A speak button reading `expression` (a Liquid expression), disabled while
// it is blank. Needs LAYOUT_SPEAK_BUTTON_CSS.
export function speakButton(expression: string, extraClass = ""): string {
  const className = extraClass ? `rf-speak ${extraClass}` : "rf-speak"
  return `<button type="button" class="${className}" data-speak="{{ ${expression} }}"{% if ${expression} == blank %} aria-disabled="true"{% endif %}>${SPEAK_BUTTON_ICONS}</button>`
}

import type { CardSource } from "./shared"
import { LAYOUT_SPEAK_BUTTON_CSS } from "./default-layout"
import { assignSlots, assignSource, liquidString, speakButton, TAIL_CSS, tailRows } from "./shared"

/**
 * The sentence analysis card: the sentence with every annotated span
 * underlined in its role's color, one line per nesting level, clauses
 * bracketed and named, and hard spots tinted. Hovering a span tips its role,
 * form, sense, hard spot, plain word order and note, with an arrow to the
 * word it modifies. Toggles focus the hard spots, the main clause's skeleton,
 * or the breaks between its parts. Hard spots are listed under the sentence,
 * then the translation. The card's words come from ctx, in the reader's
 * language; the answer only holds the language-neutral values.
 */

export type SentenceAnalysisSlot = "annotations" | "translation"

export interface SentenceAnalysisLayoutOptions {
  slots: Partial<Record<SentenceAnalysisSlot, string>>
  // Where in ctx the host puts the card's words (SentenceAnalysisLayoutLabels).
  labels: { ctxKey: string }
  // The sentence: a field holding the selection, or ctx's selection.
  source: CardSource
}

const ROLE_COLORS = {
  subject: ["0.58 0.15 255", "0.75 0.12 255"],
  predicate: ["0.58 0.19 25", "0.74 0.15 25"],
  object: ["0.6 0.14 150", "0.76 0.13 150"],
  complement: ["0.62 0.12 190", "0.77 0.11 190"],
  attributive: ["0.68 0.15 75", "0.8 0.13 80"],
  adverbial: ["0.57 0.16 305", "0.75 0.13 305"],
  appositive: ["0.6 0.14 345", "0.76 0.12 345"],
  connector: ["0.55 0.02 260", "0.72 0.02 260"],
} as const

const roleVariables = (theme: 0 | 1) =>
  Object.entries(ROLE_COLORS)
    .map(([role, colors]) => `--sa-${role}:oklch(${colors[theme]})`)
    .join(";")

const roleRules = Object.keys(ROLE_COLORS)
  .map((role) => `.sa-s[data-type=${role}]{--c:var(--sa-${role})}`)
  .join("\n")

const CARD_CSS = `:host{${roleVariables(0)};--sa-hard:oklch(0.66 0.17 45)}
:host([data-theme=dark]){${roleVariables(1)};--sa-hard:oklch(0.76 0.14 50)}
@keyframes sa-pulse{50%{opacity:0.45}}
.sa{display:flex;flex-direction:column;gap:10px}
.sa-top{display:flex;align-items:flex-start;gap:6px}
.sa-text{flex:1;min-width:0;margin:0;font-size:15px;line-height:2.5;overflow-wrap:anywhere}
.sa-s{--c:var(--sa-connector);--d:0;text-decoration-line:underline;text-decoration-color:var(--c);text-decoration-thickness:2px;text-decoration-skip-ink:none;text-underline-offset:calc(3px + var(--d) * 4px);border-radius:3px;cursor:help;outline:none;transition:background-color 150ms, color 150ms, opacity 150ms}
${roleRules}
.sa-s[data-d="1"]{--d:1}
.sa-s[data-d="2"]{--d:2}
.sa-s[data-d="3"]{--d:3}
.sa-s[data-type=predicate]{font-weight:600}
.sa-s[data-type=connector]{text-decoration-style:dotted;font-style:italic}
.sa-s[data-form=clause]::before{content:"[";color:var(--c);font-weight:500}
.sa-s[data-form=clause]::after{content:"]";color:var(--c);font-weight:500}
.sa-s[data-obstacle]{background:color-mix(in oklab, var(--sa-hard) 16%, transparent)}
.sa-s:hover,.sa-s:focus-visible,.sa-s[data-tip-state=active]{background:color-mix(in oklab, var(--c) 18%, transparent)}
.sa-chip{display:inline-block;margin:0 3px 0 1px;padding:0 4px;border-radius:4px;font-size:10px;line-height:14px;font-weight:600;font-style:normal;vertical-align:4px;color:var(--c);background:color-mix(in oklab, var(--c) 14%, transparent)}
.sa-head{border-radius:3px;box-shadow:inset 0 -1px 0 var(--rf-ring)}
.sa-head[data-tip-state=linked]{background:color-mix(in oklab, var(--rf-accent) 20%, transparent)}
.sa-slash{display:none;margin:0 4px;color:var(--rf-muted-foreground);font-weight:600}
:host([data-toggles~=slashes]) .sa-slash{display:inline}
:host([data-toggles~=hard]) .sa-s:not([data-obstacle]){text-decoration-color:transparent;background:none}
:host([data-toggles~=hard]) .sa-s:not([data-obstacle]) > .sa-chip{opacity:0.35}
:host([data-toggles~=hard]) .sa-s[data-obstacle]{background:color-mix(in oklab, var(--sa-hard) 32%, transparent)}
:host([data-toggles~=trunk]) .sa-text{color:color-mix(in oklab, var(--rf-popover-foreground) 40%, transparent)}
:host([data-toggles~=trunk]) .sa-s[data-d="0"]:is([data-type=subject],[data-type=predicate],[data-type=object],[data-type=complement]){color:var(--rf-popover-foreground)}
:host([data-toggles~=trunk]) .sa-s .sa-s{color:color-mix(in oklab, var(--rf-popover-foreground) 40%, transparent);text-decoration-color:transparent}
:host([data-toggles~=trunk]) .sa-s:not([data-d="0"]) .sa-chip,:host([data-toggles~=trunk]) .sa-s .sa-s .sa-chip{display:none}
:host([data-toggles~=trunk]) .sa-s:not([data-d="0"]){text-decoration-color:transparent}
.sa-tip{display:flex;flex-direction:column;gap:2px}
.sa-tip-role{font-weight:600}
.sa-tip-hard{color:var(--sa-hard);font-weight:600}
.sa-tip-restore,.sa-tip-note{color:var(--rf-muted-foreground)}
.sa-bar{display:flex;flex-wrap:wrap;gap:4px}
.sa-toggle{display:inline-flex;align-items:center;height:24px;padding:0 8px;border:1px solid var(--rf-border);border-radius:999px;background:transparent;color:var(--rf-muted-foreground);font:inherit;font-size:12px;cursor:pointer;transition:all 150ms}
.sa-toggle:hover{background:var(--rf-secondary)}
.sa-toggle[aria-pressed=true]{border-color:var(--rf-accent);background:color-mix(in oklab, var(--rf-accent) 14%, transparent);color:var(--rf-popover-foreground)}
.sa-toggle:focus-visible{outline:2px solid var(--rf-ring);outline-offset:1px}
.sa-hard{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;font-size:13px;line-height:19px}
.sa-hard li{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 6px}
.sa-hard-tag{flex:none;padding:0 6px;border-radius:999px;font-size:11px;line-height:18px;font-weight:600;color:var(--sa-hard);background:color-mix(in oklab, var(--sa-hard) 14%, transparent)}
.sa-hard-text{font-weight:500}
.sa-hard-restore{flex-basis:100%;color:var(--rf-muted-foreground)}
.sa-tr{margin:0;padding-top:10px;border-top:1px solid var(--rf-border);color:var(--rf-muted-foreground);line-height:21px;white-space:pre-wrap;overflow-wrap:anywhere}
.sa-skel{display:inline-block;width:70%;height:10px;border-radius:4px;background:var(--rf-muted);animation:sa-pulse 1.2s ease-in-out infinite}`

// What a span is, in the card's words: a clause by its kind (an adverbial
// clause by its sense), anything else by its role, then a phrase's form and
// an adverbial's sense.
const SPAN_LABEL = `{%- if it.form == "clause" -%}
{%- if it.type == "adverbial" and it.sense != blank and sa_l.adverbialClauses[it.sense] != blank -%}{{ sa_l.adverbialClauses[it.sense] }}
{%- elsif sa_l.clauses[it.type] != blank -%}{{ sa_l.clauses[it.type] }}
{%- else -%}{{ sa_l.clauses.clause | default: it.type }}{%- endif -%}
{%- else -%}{{ sa_l.roles[it.type] | default: it.type }}{%- endif -%}`

const CHIP_LABEL = `{%- if it.form == "clause" -%}${SPAN_LABEL}
{%- elsif it.form != blank -%}{{ sa_l.forms[it.form] | default: it.form }}{%- endif -%}`

const TIP_BODY = `<span data-tip-body><span class="sa-tip"><span class="sa-tip-role">${SPAN_LABEL}
{%- if it.form != blank and it.form != "clause" %} · {{ sa_l.forms[it.form] | default: it.form }}{% endif -%}
{%- if it.sense != blank and it.form != "clause" %} · {{ sa_l.senses[it.sense] | default: it.sense }}{% endif -%}
</span>
{%- if it.obstacle != blank %}<span class="sa-tip-hard">{{ sa_l.obstacles[it.obstacle] | default: it.obstacle }}</span>{% endif -%}
{%- if it.restore != blank %}<span class="sa-tip-restore">{{ sa_l.restore }} {{ it.restore }}</span>{% endif -%}
{%- if it.note != blank %}<span class="sa-tip-note">{{ it.note }}</span>{% endif -%}
</span></span>`

// The card for the given slots; null without an annotations field.
export function buildSentenceAnalysisLayout({
  slots,
  labels,
  source,
}: SentenceAnalysisLayoutOptions): string | null {
  if (!slots.annotations) return null
  const known = [
    slots.annotations,
    slots.translation,
    "fieldId" in source ? source.fieldId : undefined,
  ].filter((id): id is string => id !== undefined)

  return `<style>
${LAYOUT_SPEAK_BUTTON_CSS}
${TAIL_CSS}
${CARD_CSS}
</style>
${assignSlots({ sa_ann: slots.annotations, sa_tr: slots.translation })}${assignSource("sa_text", source)}{%- assign sa_l = ctx[${liquidString(labels.ctxKey)}] -%}
{%- assign sa_items = sa_ann.value | parse_json -%}
{%- assign sa_events = sa_text | annotate: sa_items, "text", "head" -%}
{%- assign sa_count = 0 -%}{%- assign sa_hard = 0 -%}
{%- for it in sa_items -%}{%- if it.text != blank -%}{%- assign sa_count = sa_count | plus: 1 -%}{%- if it.obstacle != blank -%}{%- assign sa_hard = sa_hard | plus: 1 -%}{%- endif -%}{%- endif -%}{%- endfor -%}
<div class="sa">
  {%- if sa_count > 0 %}
  <div class="sa-bar" role="group">
    {%- if sa_hard > 0 %}<button type="button" class="sa-toggle" data-toggle="hard">{{ sa_l.hard }}</button>{% endif -%}
    <button type="button" class="sa-toggle" data-toggle="trunk">{{ sa_l.trunk }}</button>
    <button type="button" class="sa-toggle" data-toggle="slashes">{{ sa_l.slashes }}</button>
  </div>
  {%- endif %}
  <div class="sa-top" data-rf-key="sa-sentence">
    <p class="sa-text">
      {%- assign sa_top = 0 -%}
      {%- for e in sa_events -%}
      {%- assign it = e.item -%}
      {%- if e.kind == "text" -%}{{ e.text }}
      {%- elsif e.key == "head" -%}
      {%- if e.kind == "enter" -%}<span class="sa-head" data-tip-key="sa{{ e.index }}">{%- else -%}</span>{%- endif -%}
      {%- elsif e.kind == "enter" -%}
      {%- if e.depth == 0 -%}{%- if sa_top > 0 -%}<span class="sa-slash" aria-hidden="true">/</span>{%- endif -%}{%- assign sa_top = sa_top | plus: 1 -%}{%- endif -%}
      <span class="sa-s" tabindex="0" data-type="{{ it.type }}" data-d="{% if e.depth > 3 %}3{% else %}{{ e.depth }}{% endif %}"
      {%- if it.form != blank %} data-form="{{ it.form }}"{% endif -%}
      {%- if it.obstacle != blank %} data-obstacle="{{ it.obstacle }}"{% endif -%}
      {%- if it.head != blank %} data-tip-link="sa{{ e.index }}"{% endif %}>${TIP_BODY}
      {%- if it.form != blank -%}<span class="sa-chip" aria-hidden="true">${CHIP_LABEL}</span>{%- endif -%}
      {%- else -%}</span>
      {%- endif -%}
      {%- endfor -%}
    </p>
    ${speakButton("sa_text")}
  </div>
  {%- if sa_hard > 0 %}
  <ul class="sa-hard" data-rf-key="sa-hard">
    {%- for it in sa_items -%}{%- if it.text != blank and it.obstacle != blank %}
    <li><span class="sa-hard-tag">{{ sa_l.obstacles[it.obstacle] | default: it.obstacle }}</span><span class="sa-hard-text">{{ it.text }}</span>
      {%- if it.restore != blank %}<span class="sa-hard-restore">{{ sa_l.restore }} {{ it.restore }}</span>{% endif -%}
    </li>
    {%- endif -%}{%- endfor %}
  </ul>
  {%- endif %}
  {%- if sa_tr.value != blank %}
  <p class="sa-tr" data-rf-key="sa-translation">{{ sa_tr.value }}</p>
  {%- elsif sa_tr.pending %}
  <p class="sa-tr"><span class="sa-skel"></span></p>
  {%- endif %}
  ${tailRows(known)}
</div>
`
}

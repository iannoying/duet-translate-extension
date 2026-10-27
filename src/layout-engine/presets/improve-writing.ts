import type { CardSource } from "./shared"
import { assignSlots, assignSource, liquidString, TAIL_CSS, tailRows } from "./shared"
import { IMPROVE_WRITING_TIERS } from "./vocabularies"

/**
 * The Improve Writing card, marked up like a teacher's pen: the setting the
 * text is judged against, a chip per tier with its count (pressing one hides
 * that tier's marks), and the writer's text with every mark colored by tier.
 * A short fix is written above its words; a longer one, and every note, sits
 * in the mark's tip and in the numbered notes below, which arrows tie to the
 * mark. "Hide fixes" lets the writer try first. Then the improved text, its
 * changes highlighted, with a copy button, and the summary. The card's words
 * come from ctx, in the reader's language.
 */

export type ImproveWritingSlot = "setting" | "annotations" | "improved" | "summary"

export interface ImproveWritingLayoutOptions {
  slots: Partial<Record<ImproveWritingSlot, string>>
  // Where in ctx the host puts the card's words (ImproveWritingLayoutLabels).
  labels: { ctxKey: string }
  // The writer's text: a field holding the selection, or ctx's selection.
  source: CardSource
}

// A fix up to this many characters is written above its words.
const SHORT_FIX_LENGTH = 24

const TIER_ORDER = ["error", "awkward", "good"] as const

const CARD_CSS = `:host{--iw-error:oklch(0.6 0.2 25);--iw-awkward:oklch(0.7 0.15 70);--iw-good:oklch(0.62 0.15 150)}
:host([data-theme=dark]){--iw-error:oklch(0.72 0.16 25);--iw-awkward:oklch(0.8 0.13 80);--iw-good:oklch(0.76 0.14 150)}
@keyframes iw-pulse{50%{opacity:0.45}}
.iw{display:flex;flex-direction:column;gap:10px}
.iw-top{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.iw-setting{margin-right:auto;padding:0 8px;border-radius:999px;font-size:12px;line-height:22px;color:var(--rf-muted-foreground);background:var(--rf-muted)}
.iw-chip,.iw-btn{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border:1px solid var(--rf-border);border-radius:999px;background:transparent;color:var(--rf-popover-foreground);font:inherit;font-size:12px;cursor:pointer;transition:all 150ms}
.iw-chip:hover,.iw-btn:hover{background:var(--rf-secondary)}
.iw-chip:focus-visible,.iw-btn:focus-visible{outline:2px solid var(--rf-ring);outline-offset:1px}
.iw-chip i{width:8px;height:8px;border-radius:50%;background:var(--t)}
.iw-chip[aria-pressed=true]{color:var(--rf-muted-foreground);text-decoration:line-through}
.iw-chip[aria-pressed=true] i{background:transparent;box-shadow:inset 0 0 0 1.5px var(--t)}
.iw-btn[aria-pressed=true]{border-color:var(--rf-accent);background:color-mix(in oklab, var(--rf-accent) 14%, transparent)}
[data-tier=error]{--t:var(--iw-error)}
[data-tier=awkward]{--t:var(--iw-awkward)}
[data-tier=good]{--t:var(--iw-good)}
.iw-text{margin:0;font-size:15px;line-height:2.4;overflow-wrap:anywhere}
.iw-m{border-radius:3px;cursor:help;outline:none;text-decoration:underline 2px var(--t);text-underline-offset:4px;transition:background-color 150ms}
ruby.iw-m{white-space:nowrap}
.iw-m[data-tier=awkward]{text-decoration-style:wavy;text-decoration-thickness:1.5px}
.iw-m[data-tier=good]{text-decoration-style:double}
.iw-m:hover,.iw-m:focus-visible,.iw-m[data-tip-state=active]{background:color-mix(in oklab, var(--t) 16%, transparent)}
.iw-m.iw-del .iw-old{text-decoration:line-through 1.5px var(--t)}
.iw-m rt{font-size:11px;line-height:1.2;font-weight:600;color:var(--t);text-align:center}
.iw-pen{position:relative}
.iw-pen::after{content:"✎";margin-left:1px;font-size:11px;color:var(--t);vertical-align:6px}
.iw-n{display:inline-block;margin-left:1px;font-size:10px;font-weight:600;color:var(--t);vertical-align:7px;line-height:1}
.iw-hint{display:none;margin:0;font-size:12px;color:var(--rf-muted-foreground)}
:host([data-toggles~=hide-fixes]) .iw-m rt,:host([data-toggles~=hide-fixes]) .iw-fix,:host([data-toggles~=hide-fixes]) .iw-improved,:host([data-toggles~=hide-fixes]) .iw-pen::after{display:none}
:host([data-toggles~=hide-fixes]) .iw-hint{display:block}
:host([data-toggles~=hide-fixes][data-toggles~=show-improved]) .iw-improved{display:flex}
.iw-show{display:none}
:host([data-toggles~=hide-fixes]) .iw-show{display:inline-flex}
${TIER_ORDER.map(
  (
    tier,
  ) => `:host([data-toggles~=off-${tier}]) [data-tier=${tier}]:is(.iw-m,.iw-note){text-decoration-color:transparent;background:none}
:host([data-toggles~=off-${tier}]) .iw-m[data-tier=${tier}] rt,:host([data-toggles~=off-${tier}]) .iw-n[data-tier=${tier}],:host([data-toggles~=off-${tier}]) .iw-note[data-tier=${tier}]{display:none}`,
).join("\n")}
.iw-notes{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;font-size:13px;line-height:19px}
.iw-note{display:grid;grid-template-columns:auto 1fr;gap:0 8px;padding:6px 8px;border-radius:calc(var(--rf-radius, 10px) - 2px);background:color-mix(in oklab, var(--rf-muted) 70%, transparent);box-shadow:inset 3px 0 0 var(--t);transition:opacity 150ms}
.iw-note-n{font-weight:600;color:var(--t)}
.iw-note-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 6px}
.iw-type{font-weight:600}
.iw-tag{padding:0 5px;border-radius:4px;font-size:11px;color:var(--t);background:color-mix(in oklab, var(--t) 14%, transparent)}
.iw-fix{color:var(--rf-muted-foreground)}
.iw-fix b{font-weight:600;color:var(--rf-popover-foreground)}
.iw-note-text{grid-column:2;color:var(--rf-muted-foreground)}
:host([data-tip-active]) .iw-note:not([data-tip-state]){opacity:0.45}
.iw-improved{display:flex;align-items:flex-start;gap:6px;padding:8px 6px 8px 10px;border-radius:calc(var(--rf-radius, 10px) - 2px);box-shadow:inset 0 0 0 1px var(--rf-border)}
.iw-improved-body{flex:1;min-width:0}
.iw-label{margin:0 0 2px;font-size:12px;font-weight:500;color:var(--rf-muted-foreground)}
.iw-improved-text{margin:0;line-height:22px;overflow-wrap:anywhere}
.iw-changed{border-radius:3px;background:color-mix(in oklab, var(--iw-good) 18%, transparent)}
.iw-copy{display:inline-flex;align-items:center;justify-content:center;flex:none;height:24px;padding:0 8px;border:1px solid var(--rf-border);border-radius:999px;background:transparent;color:var(--rf-muted-foreground);font:inherit;font-size:12px;cursor:pointer}
.iw-copy:hover{background:var(--rf-secondary)}
.iw-copy[data-copy-state=copied]{border-color:var(--iw-good);color:var(--iw-good)}
.iw-summary{margin:0;padding-top:10px;border-top:1px solid var(--rf-border);line-height:21px;white-space:pre-wrap;overflow-wrap:anywhere}
.iw-unchanged{margin:0;color:var(--iw-good);font-weight:500}
.iw-skel{display:inline-block;width:70%;height:10px;border-radius:4px;background:var(--rf-muted);animation:iw-pulse 1.2s ease-in-out infinite}`

// `iw_tier` for the mark `m`: error, awkward or good; an unknown type is awkward.
const ASSIGN_TIER = `{%- if iw_good contains m.type -%}{%- assign iw_tier = "good" -%}
{%- elsif iw_errors contains m.type -%}{%- assign iw_tier = "error" -%}
{%- else -%}{%- assign iw_tier = "awkward" -%}{%- endif -%}`

const TYPE_LABEL = "{{ iw_l.types[m.type] | default: m.type }}"

// The card for the given slots; null without an annotations field.
export function buildImproveWritingLayout({
  slots,
  labels,
  source,
}: ImproveWritingLayoutOptions): string | null {
  if (!slots.annotations) return null
  const known = [
    slots.setting,
    slots.annotations,
    slots.improved,
    slots.summary,
    "fieldId" in source ? source.fieldId : undefined,
  ].filter((id): id is string => id !== undefined)

  const chips = TIER_ORDER.map(
    (tier) =>
      `{%- if iw_n_${tier} > 0 %}<button type="button" class="iw-chip" data-tier="${tier}" data-toggle="off-${tier}"><i></i>{{ iw_l.tiers.${tier} }} {{ iw_n_${tier} }}</button>{% endif -%}`,
  ).join("\n    ")

  return `<style>
${TAIL_CSS}
${CARD_CSS}
</style>
${assignSlots({
  iw_setting: slots.setting,
  iw_ann: slots.annotations,
  iw_improved: slots.improved,
  iw_summary: slots.summary,
})}${assignSource("iw_text", source)}{%- assign iw_l = ctx[${liquidString(labels.ctxKey)}] -%}
{%- assign iw_errors = ${liquidString(IMPROVE_WRITING_TIERS.error.join("|"))} | split: "|" -%}
{%- assign iw_good = "good" | split: "|" -%}
{%- assign iw_marks = iw_ann.value | parse_json -%}
{%- assign iw_events = iw_text | annotate: iw_marks -%}
{%- assign iw_n_error = 0 -%}{%- assign iw_n_awkward = 0 -%}{%- assign iw_n_good = 0 -%}{%- assign iw_count = 0 -%}
{%- for e in iw_events -%}{%- if e.kind == "enter" -%}{%- assign m = e.item -%}${ASSIGN_TIER}
{%- assign iw_count = iw_count | plus: 1 -%}
{%- if iw_tier == "error" -%}{%- assign iw_n_error = iw_n_error | plus: 1 -%}{%- elsif iw_tier == "good" -%}{%- assign iw_n_good = iw_n_good | plus: 1 -%}{%- else -%}{%- assign iw_n_awkward = iw_n_awkward | plus: 1 -%}{%- endif -%}
{%- endif -%}{%- endfor -%}
<div class="iw">
  <div class="iw-top" data-rf-key="iw-top">
    {%- if iw_setting.value != blank %}<span class="iw-setting">{{ iw_setting.value }}</span>{% elsif iw_setting.pending %}<span class="iw-setting"><span class="iw-skel" style="width:72px"></span></span>{% endif -%}
    ${chips}
    {%- if iw_n_error > 0 or iw_n_awkward > 0 %}<button type="button" class="iw-btn" data-toggle="hide-fixes">{{ iw_l.hideFixes }}</button>{% endif -%}
  </div>
  <p class="iw-text" data-rf-key="iw-text">
    {%- assign iw_i = 0 -%}
    {%- for e in iw_events -%}
    {%- assign m = e.item -%}
    {%- if e.kind == "text" -%}{{ e.text }}
    {%- else -%}${ASSIGN_TIER}
    {%- if e.kind == "enter" -%}
    {%- assign iw_i = iw_i | plus: 1 -%}
    {%- if iw_tier == "good" or m.fix == nil -%}
    <span class="iw-m" tabindex="0" data-tier="{{ iw_tier }}" data-tip-link="iw{{ e.index }}"><span data-tip-body>${TYPE_LABEL}{% if m.note != blank %}: {{ m.note }}{% endif %}</span>
    {%- elsif m.fix == "" or m.fix.size <= ${SHORT_FIX_LENGTH} -%}
    <ruby class="iw-m{% if m.fix == "" %} iw-del{% endif %}" tabindex="0" data-tier="{{ iw_tier }}" data-tip-link="iw{{ e.index }}"><span data-tip-body>${TYPE_LABEL}{% if m.note != blank %}: {{ m.note }}{% endif %}</span><span class="iw-old">
    {%- else -%}
    <span class="iw-m iw-pen" tabindex="0" data-tier="{{ iw_tier }}" data-tip-link="iw{{ e.index }}"><span data-tip-body>→ {{ m.fix }}{% if m.note != blank %} · {{ m.note }}{% endif %}</span>
    {%- endif -%}
    {%- else -%}
    {%- if iw_tier == "good" or m.fix == nil -%}</span>
    {%- elsif m.fix == "" -%}</span><rt>{{ iw_l.remove }}</rt></ruby>
    {%- elsif m.fix.size <= ${SHORT_FIX_LENGTH} -%}</span><rt>{{ m.fix }}</rt></ruby>
    {%- else -%}</span>
    {%- endif -%}
    <sup class="iw-n" data-tier="{{ iw_tier }}" aria-hidden="true">{{ iw_i }}</sup>
    {%- endif -%}
    {%- endif -%}
    {%- endfor -%}
  </p>
  <p class="iw-hint">{{ iw_l.hiddenHint }}</p>
  {%- if iw_count > 0 %}
  <ol class="iw-notes" data-rf-key="iw-notes">
    {%- assign iw_i = 0 -%}
    {%- for e in iw_events -%}{%- if e.kind == "enter" -%}
    {%- assign m = e.item -%}${ASSIGN_TIER}
    {%- assign iw_i = iw_i | plus: 1 %}
    <li class="iw-note" data-tier="{{ iw_tier }}" data-tip-key="iw{{ e.index }}">
      <span class="iw-note-n">{{ iw_i }}</span>
      <span class="iw-note-head"><span class="iw-type">${TYPE_LABEL}</span>
        {%- if m.tag != blank %}<span class="iw-tag">{{ m.tag }}</span>{% endif -%}
        {%- if iw_tier != "good" and m.fix != nil %}<span class="iw-fix">{{ m.text }} → <b>{% if m.fix == "" %}{{ iw_l.remove }}{% else %}{{ m.fix }}{% endif %}</b></span>{% endif -%}
      </span>
      {%- if m.note != blank %}<span class="iw-note-text">{{ m.note }}</span>{% endif %}
    </li>
    {%- endif -%}{%- endfor %}
  </ol>
  {%- elsif ctx.status == "done" and iw_marks.size == 0 and iw_ann.value != blank %}
  <p class="iw-unchanged">{{ iw_l.unchanged }}</p>
  {%- endif %}
  {%- if iw_improved.value != blank and iw_improved.value != iw_text %}
  <button type="button" class="iw-btn iw-show" data-toggle="show-improved">{{ iw_l.showImproved }}</button>
  {%- assign iw_fixes = iw_improved.value | annotate: iw_marks, "fix" %}
  <div class="iw-improved" data-rf-key="iw-improved">
    <div class="iw-improved-body">
      <p class="iw-label">{{ iw_l.improved }}</p>
      <p class="iw-improved-text">
        {%- for e in iw_fixes -%}
        {%- if e.kind == "enter" -%}<span class="iw-changed">
        {%- elsif e.kind == "leave" -%}</span>
        {%- else -%}{{ e.text }}{%- endif -%}
        {%- endfor -%}
      </p>
    </div>
    <button type="button" class="iw-copy" data-copy="{{ iw_improved.value }}">{{ iw_l.copy }}</button>
  </div>
  {%- elsif iw_improved.pending and iw_count > 0 %}
  <p class="iw-improved-text"><span class="iw-skel"></span></p>
  {%- endif %}
  {%- if iw_summary.value != blank %}
  <p class="iw-summary" data-rf-key="iw-summary">{{ iw_summary.value }}</p>
  {%- endif %}
  ${tailRows(known)}
</div>
`
}

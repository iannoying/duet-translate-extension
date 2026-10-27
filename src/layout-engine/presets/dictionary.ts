import { LAYOUT_SPEAK_BUTTON_CSS } from "./default-layout"
import { assignSlots, speakButton, TAIL_CSS, tailRows } from "./shared"

/**
 * The dictionary card: the headword with a speak button and its CEFR level,
 * the phonetic and part of speech, the definition, the sentence it was found
 * in with the word marked (its quotes are annotations, never shown as text),
 * the sentence's translation, and the memory tips one per line.
 */

export type DictionarySlot =
  | "term"
  | "phonetic"
  | "partOfSpeech"
  | "definition"
  | "context"
  | "contextTerm"
  | "contextTranslation"
  | "difficulty"
  | "memoryTips"

export interface DictionaryLayoutOptions {
  // The id of the field that fills each slot.
  slots: Partial<Record<DictionarySlot, string>>
}

const LOCAL_BY_SLOT: Record<DictionarySlot, string> = {
  term: "d_term",
  phonetic: "d_phonetic",
  partOfSpeech: "d_pos",
  definition: "d_def",
  context: "d_context",
  contextTerm: "d_context_term",
  contextTranslation: "d_context_tr",
  difficulty: "d_level",
  memoryTips: "d_tips",
}

const CARD_CSS = `:host{--dc-a:oklch(0.6 0.13 155);--dc-b:oklch(0.58 0.14 255);--dc-c:oklch(0.6 0.18 28);--dc-mark:oklch(0.78 0.15 85)}
:host([data-theme=dark]){--dc-a:oklch(0.76 0.13 155);--dc-b:oklch(0.74 0.12 255);--dc-c:oklch(0.74 0.15 28);--dc-mark:oklch(0.72 0.13 85)}
@keyframes dc-pulse{50%{opacity:0.45}}
.dc{display:flex;flex-direction:column;gap:10px}
.dc-head{display:flex;align-items:center;gap:6px;min-height:28px}
.dc-term{font-size:20px;line-height:28px;font-weight:650;letter-spacing:-0.01em;overflow-wrap:anywhere}
.dc-level{--lv:var(--rf-muted-foreground);margin-left:auto;flex:none;padding:0 8px;border-radius:999px;font-size:11px;line-height:18px;font-weight:600;color:var(--lv);background:color-mix(in oklab, var(--lv) 14%, transparent)}
.dc-level[data-band=a]{--lv:var(--dc-a)}
.dc-level[data-band=b]{--lv:var(--dc-b)}
.dc-level[data-band=c]{--lv:var(--dc-c)}
.dc-meta{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin-top:-6px;font-size:13px;line-height:18px;color:var(--rf-muted-foreground)}
.dc-pos{font-style:italic}
.dc-def{margin:0;font-size:15px;line-height:22px;white-space:pre-wrap;overflow-wrap:anywhere}
.dc-example{display:flex;align-items:flex-start;gap:4px;margin:0;padding:8px 6px 8px 10px;border-radius:calc(var(--rf-radius, 10px) - 2px);background:color-mix(in oklab, var(--rf-muted) 70%, transparent);box-shadow:inset 3px 0 0 var(--rf-ring)}
.dc-example-body{flex:1;min-width:0}
.dc-sentence{margin:0;line-height:21px;overflow-wrap:anywhere}
.rf-d-mark{font-weight:600;background:linear-gradient(transparent 60%, color-mix(in oklab, var(--dc-mark) 45%, transparent) 60%)}
.dc-trans{margin:4px 0 0;font-size:13px;line-height:19px;color:var(--rf-muted-foreground);overflow-wrap:anywhere}
.dc-tips{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none;font-size:13px;line-height:19px}
.dc-tips li{position:relative;padding-left:14px;overflow-wrap:anywhere}
.dc-tips li::before{content:"";position:absolute;left:3px;top:7px;width:5px;height:5px;border-radius:50%;background:var(--dc-mark)}
.dc-skel{display:inline-block;width:60%;height:10px;border-radius:4px;background:var(--rf-muted);animation:dc-pulse 1.2s ease-in-out infinite}
.dc-skel-term{width:96px;height:18px}`

// The card for the given slots; null without a term or a definition.
export function buildDictionaryLayout({ slots }: DictionaryLayoutOptions): string | null {
  if (!slots.term || !slots.definition) return null
  const locals = Object.fromEntries(
    (Object.keys(LOCAL_BY_SLOT) as DictionarySlot[]).map((slot) => [
      LOCAL_BY_SLOT[slot],
      slots[slot],
    ]),
  )
  const known = Object.values(slots).filter((id): id is string => id !== undefined)

  return `<style>
${LAYOUT_SPEAK_BUTTON_CSS}
${TAIL_CSS}
${CARD_CSS}
</style>
${assignSlots(locals)}<div class="dc">
  <div class="dc-head" data-rf-key="dc-head">
    {%- if d_term.value != blank -%}
    <span class="dc-term">{{ d_term.value }}</span>${speakButton("d_term.value")}
    {%- elsif d_term.pending or ctx.status == "streaming" -%}
    <span class="dc-skel dc-skel-term"></span>
    {%- endif -%}
    {%- if d_level.value != blank -%}
    <span class="dc-level" data-band="{{ d_level.value | strip | slice: 0 | downcase }}">{{ d_level.value }}</span>
    {%- endif -%}
  </div>
  {%- if d_phonetic.value != blank or d_pos.value != blank %}
  <div class="dc-meta">
    {%- if d_phonetic.value != blank %}<span class="dc-phonetic">{{ d_phonetic.value }}</span>{% endif -%}
    {%- if d_pos.value != blank %}<span class="dc-pos">{{ d_pos.value }}</span>{% endif -%}
  </div>
  {%- endif %}
  {%- if d_def.value != blank %}
  <p class="dc-def" data-rf-key="dc-def">{{ d_def.value }}</p>
  {%- elsif d_def.pending %}
  <p class="dc-def"><span class="dc-skel"></span></p>
  {%- endif %}
  {%- if d_context.value != blank %}
  {%- assign d_quotes = d_context_term.value | parse_json -%}
  {%- assign d_parts = d_context.value | annotate: d_quotes %}
  <figure class="dc-example" data-rf-key="dc-example">
    <div class="dc-example-body">
      <p class="dc-sentence">
        {%- for e in d_parts -%}
        {%- if e.kind == "enter" -%}<b class="rf-d-mark">
        {%- elsif e.kind == "leave" -%}</b>
        {%- else -%}{{ e.text }}{%- endif -%}
        {%- endfor -%}
      </p>
      {%- if d_context_tr.value != blank %}
      <p class="dc-trans">{{ d_context_tr.value }}</p>
      {%- endif %}
    </div>
    ${speakButton("d_context.value")}
  </figure>
  {%- endif %}
  {%- assign d_tip_lines = d_tips.value | lines -%}
  {%- if d_tip_lines.size > 0 %}
  <ul class="dc-tips" data-rf-key="dc-tips">
    {%- for line in d_tip_lines %}
    <li>{{ line }}</li>
    {%- endfor %}
  </ul>
  {%- endif %}
  ${tailRows(known)}
</div>
`
}

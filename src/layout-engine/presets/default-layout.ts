/**
 * The default layout: each field's name above its value, the list custom
 * actions showed before layouts existed. It walks `ctx.fields` and never names
 * a field, so it fits every action. The speak button pieces below are what
 * the layout editor inserts for a field that should be read aloud.
 *
 * Icons: Tabler Icons, MIT License, Copyright (c) 2020-2026 Paweł Kuna,
 * https://github.com/tabler/tabler-icons
 */

// The rules behind `.rf-speak`: one icon per state (idle, loading, playing).
export const LAYOUT_SPEAK_BUTTON_CSS = `@keyframes rf-spin{to{transform:rotate(360deg)}}
.rf-speak{box-sizing:border-box;display:inline-flex;flex:none;align-items:center;justify-content:center;width:24px;height:24px;margin:0;padding:0;border:1px solid transparent;border-radius:min(calc(var(--rf-radius, 10px) - 2px), 10px);background:transparent;background-clip:padding-box;color:var(--rf-muted-foreground);font:inherit;outline:none;user-select:none;transition:all 150ms cubic-bezier(0.4, 0, 0.2, 1)}
.rf-speak:hover{background-color:var(--rf-secondary)}
:host([data-theme=dark]) .rf-speak:hover{background-color:color-mix(in oklab, var(--rf-secondary) 50%, transparent)}
.rf-speak:focus-visible{border-color:var(--rf-ring);box-shadow:0 0 0 3px color-mix(in oklab, var(--rf-ring) 50%, transparent)}
.rf-speak:active{transform:translateY(1px)}
.rf-speak[aria-disabled=true]{opacity:0.5;pointer-events:none}
.rf-speak svg{flex:none;width:12px;height:12px;pointer-events:none}
.rf-speak .rf-i-load,.rf-speak .rf-i-stop,.rf-speak[data-speak-state=loading] .rf-i-vol,.rf-speak[data-speak-state=playing] .rf-i-vol{display:none}
.rf-speak[data-speak-state=loading] .rf-i-load{display:block;animation:rf-spin 1s linear infinite}
.rf-speak[data-speak-state=playing] .rf-i-stop{display:block}`

// The idle, loading and playing icons a `.rf-speak` button holds.
export const SPEAK_BUTTON_ICONS = `<svg class="rf-i-vol" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 8a5 5 0 0 1 0 8"/><path d="M17.7 5a9 9 0 0 1 0 14"/><path d="M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5"/></svg><svg class="rf-i-load" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg><svg class="rf-i-stop" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="none" aria-hidden="true"><path d="M17 4h-10a3 3 0 0 0 -3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3 -3v-10a3 3 0 0 0 -3 -3z"/></svg>`

export const FIELD_ROW_CSS = `.rf-head{display:flex;align-items:center;gap:2px;height:24px}
.rf-label{display:inline-flex;align-items:center;gap:2px;min-width:0;font-size:12px;line-height:16px;font-weight:500;color:var(--rf-muted-foreground)}
.rf-label svg{flex:none;width:12px;height:12px}
.rf-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rf-value{font-size:14px;line-height:20px;white-space:pre-wrap;overflow-wrap:anywhere}`

export const TYPE_ICON = `{%- if f.type == "number" -%}<svg class="rf-i-hash" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9l14 0"/><path d="M5 15l14 0"/><path d="M11 4l-4 16"/><path d="M17 4l-4 16"/></svg>{%- else -%}<svg class="rf-i-type" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l3 0"/><path d="M14 20l7 0"/><path d="M6.9 15l6.9 0"/><path d="M10.2 6.3l5.8 13.7"/><path d="M5 20l6 -16l2 0l7 16"/></svg>{%- endif -%}`

export const DEFAULT_LAYOUT = `<style>
${FIELD_ROW_CSS}
.rf-fields{display:flex;flex-direction:column;gap:12px}
</style>
<div class="rf-fields">
  {%- for f in ctx.fields %}
  <section class="rf-field" data-rf-key="{{ f.id }}">
    <div class="rf-head">
      <span class="rf-label">
        ${TYPE_ICON}
        <span class="rf-name">{{ f.name }}</span>
      </span>
    </div>
    <div class="rf-value">{% if f.pending %}…{% elsif f.value == blank %}—{% else %}{{ f.value }}{% endif %}</div>
  </section>
  {%- endfor %}
</div>
`

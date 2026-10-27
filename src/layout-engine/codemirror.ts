import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete"
import type { Diagnostic } from "@codemirror/lint"
import type { Extension, Range } from "@codemirror/state"
import type { DecorationSet, ViewUpdate } from "@codemirror/view"
import type { LayoutField, LayoutHost } from "./contract"
import type { LayoutDiagnostic } from "./editor"
import { liquid, liquidCompletionSource } from "@codemirror/lang-liquid"
import { LanguageSupport } from "@codemirror/language"
import { linter } from "@codemirror/lint"
import { StateEffect } from "@codemirror/state"
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view"
import {
  formatFieldRef,
  LAYOUT_ALLOWED_TAGS,
  LAYOUT_CTX_ROOT,
  LAYOUT_FILTER_NAMES,
} from "./contract"
import { findFieldRefs, lintLayout } from "./editor"
import { scanLayout } from "./editor/scan"

/**
 * CodeMirror support for layouts: lang-liquid's language with completions
 * that know the host (field names, ctx keys, the allowed tags and filters),
 * a linter running the editor's checks, and field pills.
 */

export type LayoutCompletionSource = (context: CompletionContext) => CompletionResult | null

export interface LayoutLanguageOptions {
  host: LayoutHost
  getFields: () => readonly LayoutField[]
  // The detail shown next to a field's completion, e.g. its type.
  describeField?: (field: LayoutField) => string
}

// lang-liquid's own words that a layout cannot use.
const ALLOWED_TAG_WORDS = new Set<string>([
  ...LAYOUT_ALLOWED_TAGS,
  ...LAYOUT_ALLOWED_TAGS.map((tag) => `end${tag}`),
])
const ALLOWED_FILTERS = new Set<string>(LAYOUT_FILTER_NAMES)
const STOCK_WORDS_OUT = new Set(["tablerowloop", "with", "as"])

const LIQUID_TAGS =
  "cycle comment endcomment raw endraw echo increment decrement liquid if elsif else endif unless endunless case endcase for endfor tablerow endtablerow break continue assign capture endcapture render include".split(
    " ",
  )

function keep(option: Completion): boolean {
  if (STOCK_WORDS_OUT.has(option.label)) return false
  if (option.type === "function") return ALLOWED_FILTERS.has(option.label)
  if (option.type === "keyword" && LIQUID_TAGS.includes(option.label)) {
    return ALLOWED_TAG_WORDS.has(option.label)
  }
  return true
}

function layoutCompletionSource({
  host,
  getFields,
  describeField,
}: LayoutLanguageOptions): LayoutCompletionSource {
  const ownFilters: Completion[] = ["parse_json", "lines", "annotate"].map((label) => ({
    label,
    type: "function",
  }))
  const ctxKeys = (): Completion[] => host.ctxKeys.map((label) => ({ label, type: "property" }))

  return (context) => {
    const fieldOptions: Completion[] = getFields().map((field) => ({
      label: field.name,
      apply: formatFieldRef(field.name),
      type: "variable",
      ...(describeField && { detail: describeField(field) }),
    }))
    const locals = [
      ...new Set(scanLayout(context.state.doc.toString()).locals.map((local) => local.name)),
    ]
    const source = liquidCompletionSource({
      variables: [
        ...fieldOptions,
        { label: LAYOUT_CTX_ROOT, type: "variable" },
        ...locals.map((label): Completion => ({ label, type: "variable" })),
      ],
      filters: ownFilters,
      properties: (path) => (path.length === 1 && path[0] === LAYOUT_CTX_ROOT ? ctxKeys() : []),
    })
    const result = source(context)
    if (!result) return null
    const options = result.options.filter(keep)
    return options.length > 0 ? { ...result, options } : null
  }
}

// lang-liquid's support with its completion source swapped for the host's.
export function layoutLanguage(options: LayoutLanguageOptions): Extension {
  const stock = liquid()
  const [base, , closeBraces, closePercent] = stock.support as Extension[]
  return new LanguageSupport(stock.language, [
    base!,
    stock.language.data.of({ autocomplete: layoutCompletionSource(options) }),
    closeBraces!,
    closePercent!,
  ])
}

export interface LayoutLinterOptions {
  host: LayoutHost
  getFields: () => readonly LayoutField[]
  message: (diagnostic: LayoutDiagnostic) => string
  // Codes not marked in the text.
  ignore?: readonly string[]
}

export function layoutLinter({
  host,
  getFields,
  message,
  ignore = [],
}: LayoutLinterOptions): Extension {
  const ignored = new Set(ignore)
  return linter(
    (view) => {
      const doc = view.state.doc
      return lintLayout(doc.toString(), host, getFields())
        .filter((diagnostic) => !ignored.has(diagnostic.code))
        .map((diagnostic): Diagnostic => {
          const from = Math.min(diagnostic.from, doc.length)
          return {
            from,
            to: Math.max(from, Math.min(diagnostic.to, doc.length)),
            severity: diagnostic.severity,
            message: message(diagnostic),
          }
        })
    },
    { delay: 300 },
  )
}

// ---------------------------------------------------------------------------
// Field pills

const refreshPills = StateEffect.define()

class FieldPillWidget extends WidgetType {
  constructor(private readonly name: string) {
    super()
  }

  override eq(other: FieldPillWidget): boolean {
    return other.name === this.name
  }

  toDOM(): HTMLElement {
    const pill = document.createElement("span")
    pill.className = "cm-rf-field-pill"
    pill.textContent = this.name
    return pill
  }

  override ignoreEvent(): boolean {
    return false
  }
}

export interface FieldPillsOptions {
  host: LayoutHost
  getFields: () => readonly LayoutField[]
}

const pillTheme = EditorView.baseTheme({
  ".cm-rf-field-pill": {
    display: "inline-block",
    padding: "0 5px",
    borderRadius: "4px",
    backgroundColor: "var(--rf-field-pill-background, rgba(59, 130, 246, 0.16))",
    color: "var(--rf-field-pill-foreground, inherit)",
    fontFamily: "inherit",
    lineHeight: "1.3",
  },
})

/**
 * Shows each reference to a known field (`["Term"]` or a bare `Term`) as a
 * pill with the field's name; the text keeps the reference. Pills are
 * atomic: the cursor steps over one and Backspace deletes it whole.
 */
export function fieldPills({ host, getFields }: FieldPillsOptions): Extension {
  const build = (view: EditorView): DecorationSet => {
    const names = new Set(getFields().map((field) => field[host.scopeKey]))
    const ranges: Range<Decoration>[] = []
    for (const ref of findFieldRefs(view.state.doc.toString())) {
      if (!names.has(ref.name) || ref.from >= ref.to) continue
      ranges.push(
        Decoration.replace({ widget: new FieldPillWidget(ref.name) }).range(ref.from, ref.to),
      )
    }
    return Decoration.set(ranges, true)
  }

  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = build(view)
      }

      update(update: ViewUpdate) {
        const refreshed = update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(refreshPills)),
        )
        if (update.docChanged || refreshed) this.decorations = build(update.view)
      }
    },
    {
      decorations: (value) => value.decorations,
      provide: (value) =>
        EditorView.atomicRanges.of((view) => view.plugin(value)?.decorations ?? Decoration.none),
    },
  )
  return [plugin, pillTheme]
}

// Rebuilds the pills after the fields change.
export function refreshFieldPills(view: EditorView) {
  view.dispatch({ effects: refreshPills.of(null) })
}

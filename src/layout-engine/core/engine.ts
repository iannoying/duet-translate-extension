import type { Template } from "liquidjs"
import type { CssRemoval } from "./css"
import type { LayoutScope } from "./scope"
import { Liquid } from "liquidjs"
import {
  LAYOUT_ALLOWED_TAGS,
  LAYOUT_DEFAULT_RENDER_BUDGET,
  LAYOUT_FILTER_NAMES,
  LAYOUT_MAX_RENDERED_LENGTH,
} from "../contract"
import { annotate } from "./annotate"
import { findStyleBlocks, sanitizeCss, splitStyles } from "./css"
import { parseJson } from "./parse-json"

/**
 * Compiling and rendering a layout: liquidjs with only the tags and filters
 * the contract lists, every output HTML-escaped, and limits on time and size.
 * The result is markup, not yet sanitized: the DOM layer does that.
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&#34;",
  "'": "&#39;",
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value)) return value.map(stringify).join("")
  switch (typeof value) {
    case "string":
      return value
    case "number":
    case "boolean":
    case "bigint":
      return String(value)
    case "object":
      return JSON.stringify(value)
    default:
      return ""
  }
}

export function escapeHtml(value: unknown): string {
  return stringify(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!)
}

function lines(value: unknown): string[] {
  if (value === null || value === undefined) return []
  return stringify(value)
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function createEngine(): Liquid {
  const engine = new Liquid({
    outputEscape: escapeHtml,
    ownPropertyOnly: true,
    strictFilters: true,
    strictVariables: false,
    renderLimit: LAYOUT_DEFAULT_RENDER_BUDGET.renderLimitMs,
    memoryLimit: 16_000_000,
    parseLimit: 1_000_000,
    // Nothing is read from disk: include, render and layout are gone anyway.
    relativeReference: false,
    globals: {},
  })

  const allowedTags = new Set<string>(LAYOUT_ALLOWED_TAGS)
  for (const name of Object.keys(engine.tags)) {
    if (!allowedTags.has(name)) delete engine.tags[name]
  }

  const allowedFilters = new Set<string>(LAYOUT_FILTER_NAMES)
  for (const name of Object.keys(engine.filters)) {
    if (!allowedFilters.has(name)) delete engine.filters[name]
  }

  // Every output is escaped: `raw` and `escape` change nothing, so neither
  // can let markup through or double-escape it.
  engine.registerFilter("raw", (value: unknown) => value)
  engine.registerFilter("escape", (value: unknown) => value)
  // Escapes the value itself and keeps its line breaks; the output is then
  // left as it is, which only works when this is the last filter.
  engine.registerFilter("newline_to_br", {
    handler: (value: unknown) => escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>"),
    raw: true,
  })
  engine.registerFilter("parse_json", parseJson)
  engine.registerFilter("lines", lines)
  engine.registerFilter("annotate", annotate)
  return engine
}

let sharedEngine: Liquid | null = null

function getEngine(): Liquid {
  sharedEngine ??= createEngine()
  return sharedEngine
}

export interface CompiledLayout {
  readonly source: string
  readonly templates: Template[]
  readonly css: string
  // What the CSS sanitizer took out of the style blocks.
  readonly cssRemoved: readonly CssRemoval[]
}

export type CompileLayoutResult =
  | { ok: true; compiled: CompiledLayout }
  | { ok: false; error: Error }

export function compileLayout(source: string): CompileLayoutResult {
  const { markup, css } = splitStyles(source)
  try {
    const templates = getEngine().parse(markup)
    const sanitized = sanitizeCss(css)
    return {
      ok: true,
      compiled: { source, templates, css: sanitized.css, cssRemoved: sanitized.removed },
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

export function getCompiledLayoutCss(compiled: CompiledLayout): string {
  return compiled.css
}

export class LayoutLimitError extends Error {
  override name = "LayoutLimitError"
}

// The layout's markup for `scope`. Throws when the layout fails to render or
// renders past the length limit.
export function renderLayoutHtml(compiled: CompiledLayout, scope: LayoutScope): string {
  const html = getEngine().renderSync(compiled.templates, scope) as string
  if (html.length > LAYOUT_MAX_RENDERED_LENGTH) {
    throw new LayoutLimitError(
      `The layout rendered more than ${LAYOUT_MAX_RENDERED_LENGTH.toLocaleString("en")} characters.`,
    )
  }
  return html
}

export interface LayoutSyntaxError {
  message: string
  from: number
  to: number
}

// The first syntax error in `source`, with its place in the source, or null.
// Style blocks are blanked rather than cut, so offsets stay put.
export function checkLayoutSyntax(source: string): LayoutSyntaxError | null {
  let blanked = source
  for (const block of findStyleBlocks(source)) {
    blanked =
      blanked.slice(0, block.from) + " ".repeat(block.to - block.from) + blanked.slice(block.to)
  }
  try {
    getEngine().parse(blanked)
    return null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const token = (error as { token?: { begin?: number; end?: number } }).token
    const from = typeof token?.begin === "number" ? token.begin : 0
    const to = typeof token?.end === "number" ? token.end : from
    return { message: message.replace(/, line:\d+, col:\d+$/, ""), from, to }
  }
}

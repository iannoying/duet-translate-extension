import type { LayoutField, LayoutHost, LayoutLintCode } from "../contract"
import type { LayoutScan } from "./scan"
import { LAYOUT_RESERVED_FIELD_NAMES } from "../contract"
import { checkLayoutSyntax } from "../core/engine"
import { ctxRefs, fieldCandidateRefs, scanLayout } from "./scan"

/**
 * What the layout editor points out: syntax errors, names that read nothing,
 * Liquid where it never runs, CSS the sanitizer will drop, outputs that can
 * break out of an attribute, and fields the layout never shows.
 */

export type LayoutDiagnosticSeverity = "error" | "warning" | "info"

export interface LayoutDiagnostic {
  code: LayoutLintCode
  severity: LayoutDiagnosticSeverity
  from: number
  to: number
  params?: string[]
}

const BLOCK_TAGS = new Set(["if", "unless", "case", "for"])

// The source with Liquid blanked out, so HTML can be read around it.
function htmlOnly(source: string, scan: LayoutScan): string {
  let out = ""
  let position = 0
  for (const segment of scan.segments) {
    out += source.slice(position, segment.from) + " ".repeat(segment.to - segment.from)
    position = segment.to
  }
  return out + source.slice(position)
}

// Whether the output at `from` is an unquoted attribute value: inside an
// open tag, right after `=`.
function isUnquotedAttribute(html: string, from: number): boolean {
  const before = html.slice(0, from)
  const open = before.lastIndexOf("<")
  if (open === -1 || before.lastIndexOf(">") > open || !/[A-Za-z]/.test(html[open + 1] ?? "")) {
    return false
  }
  return /=\s*$/.test(before)
}

// The `@import` and `@font-face` rules of the style blocks.
function cssDiagnostics(scan: LayoutScan): LayoutDiagnostic[] {
  const diagnostics: LayoutDiagnostic[] = []
  for (const block of scan.styleBlocks) {
    for (const match of block.content.matchAll(/@(import|font-face)\b/gi)) {
      const from = block.contentFrom + match.index
      diagnostics.push({
        code: match[1]!.toLowerCase() === "import" ? "cssImport" : "cssFontFace",
        severity: "warning",
        from,
        to: from + match[0].length,
      })
    }
  }
  return diagnostics
}

// Style blocks inside an `if`, `unless`, `case` or `for`: they apply anyway.
function styleInConditional(scan: LayoutScan): LayoutDiagnostic[] {
  const diagnostics: LayoutDiagnostic[] = []
  const stack: string[] = []
  const events = [
    ...scan.segments
      .filter((segment) => segment.kind === "tag" && !segment.inStyle)
      .map((segment) => ({ at: segment.from, segment, block: undefined })),
    ...scan.styleBlocks.map((block) => ({ at: block.from, segment: undefined, block })),
  ].sort((a, b) => a.at - b.at)

  let skipping: string | null = null
  for (const event of events) {
    if (event.segment) {
      const { name } = event.segment
      if (skipping) {
        if (name === `end${skipping}`) skipping = null
        continue
      }
      if (name === "raw" || name === "comment") skipping = name
      else if (BLOCK_TAGS.has(name)) stack.push(name)
      else if (name.startsWith("end") && BLOCK_TAGS.has(name.slice(3))) stack.pop()
    } else if (event.block && stack.length > 0 && !skipping) {
      diagnostics.push({
        code: "styleInConditional",
        severity: "info",
        from: event.block.from,
        to: event.block.from + "<style".length,
        params: [stack.at(-1)!],
      })
    }
  }
  return diagnostics
}

export function lintLayout(
  source: string,
  host: LayoutHost,
  fields: readonly LayoutField[],
): LayoutDiagnostic[] {
  const diagnostics: LayoutDiagnostic[] = []

  if (source.length > host.maxSourceLength) {
    diagnostics.push({
      code: "tooLong",
      severity: "error",
      from: host.maxSourceLength,
      to: source.length,
      params: [host.maxSourceLength.toLocaleString("en")],
    })
  }

  const syntax = checkLayoutSyntax(source)
  if (syntax) {
    diagnostics.push({
      code: "parseError",
      severity: "error",
      from: syntax.from,
      to: syntax.to,
      params: [syntax.message],
    })
  }

  const scan = scanLayout(source)
  const fieldNames = new Set(fields.map((field) => field[host.scopeKey]))
  const ctxKeys = new Set(host.ctxKeys)

  for (const segment of scan.segments) {
    if (segment.inStyle) {
      diagnostics.push({
        code: "liquidInStyle",
        severity: "warning",
        from: segment.from,
        to: segment.to,
      })
    }
  }
  diagnostics.push(...styleInConditional(scan), ...cssDiagnostics(scan))

  for (const local of scan.locals) {
    if (fieldNames.has(local.name)) {
      diagnostics.push({
        code: "fieldShadowedByLocal",
        severity: "warning",
        from: local.from,
        to: local.to,
        params: [local.name],
      })
    }
  }

  const candidates = fieldCandidateRefs(scan)
  for (const ref of candidates) {
    if (fieldNames.has(ref.root)) continue
    diagnostics.push({
      code: "unknownField",
      severity: "warning",
      from: ref.rootFrom,
      to: ref.rootTo,
      params: [ref.root],
    })
  }

  for (const ref of ctxRefs(scan)) {
    if (ref.firstKey && !ctxKeys.has(ref.firstKey.name)) {
      diagnostics.push({
        code: "unknownContextKey",
        severity: "warning",
        from: ref.firstKey.from,
        to: ref.firstKey.to,
        params: [ref.firstKey.name],
      })
    }
  }

  for (const filter of scan.filters) {
    const { segment } = filter
    if (segment.kind === "tag" && (segment.name === "for" || segment.name === "when")) {
      diagnostics.push({
        code: "filterIgnored",
        severity: "warning",
        from: filter.from,
        to: filter.to,
        params: [segment.name],
      })
    } else if (
      segment.kind === "output" &&
      filter.name === "newline_to_br" &&
      filter.position < filter.count - 1
    ) {
      diagnostics.push({
        code: "newlineToBrNotLast",
        severity: "warning",
        from: filter.from,
        to: filter.to,
      })
    }
  }

  const html = htmlOnly(source, scan)
  for (const segment of scan.segments) {
    if (segment.kind === "output" && !segment.inStyle && isUnquotedAttribute(html, segment.from)) {
      diagnostics.push({
        code: "unquotedAttributeOutput",
        severity: "warning",
        from: segment.from,
        to: segment.to,
      })
    }
  }

  const reserved = new Set<string>(LAYOUT_RESERVED_FIELD_NAMES)
  for (const field of fields) {
    if (reserved.has(field.name)) {
      diagnostics.push({
        code: "reservedFieldName",
        severity: "warning",
        from: 0,
        to: 0,
        params: [field.name],
      })
    }
  }

  // A layout reading `ctx.fields` may show any field, and one that does not
  // parse cannot tell.
  const usesCtxFields = ctxRefs(scan).some((ref) => ref.firstKey?.name === "fields")
  if (!syntax && !usesCtxFields) {
    const shown = new Set(candidates.map((ref) => ref.root))
    for (const field of fields) {
      const key = field[host.scopeKey]
      if (!shown.has(key) && !reserved.has(key)) {
        diagnostics.push({
          code: "fieldNotShown",
          severity: "info",
          from: 0,
          to: 0,
          params: [field.name],
        })
      }
    }
  }

  return diagnostics.sort((a, b) => a.from - b.from || a.to - b.to)
}

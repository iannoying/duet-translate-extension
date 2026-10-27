import type { LayoutHost } from "../contract"
import type { LayoutScan } from "./scan"
import { formatFieldRef } from "../contract"
import { checkLayoutSyntax } from "../core/engine"
import { ctxRefs, fieldCandidateRefs, scanLayout } from "./scan"

/**
 * What a layout reads, for the editor around it: the field names it names
 * (with where), and whether it walks `ctx.fields` (then it may show any).
 */

export interface LayoutFieldRef {
  name: string
  from: number
  to: number
  // Written `["name"]` rather than bare.
  bracket: boolean
}

export interface LayoutAnalysis {
  parseError: string | null
  usesCtxFields: boolean
  refs: LayoutFieldRef[]
}

export function analyzeLayout(source: string): LayoutAnalysis {
  const scan = scanLayout(source)
  return {
    parseError: checkLayoutSyntax(source)?.message ?? null,
    usesCtxFields: ctxRefs(scan).some((ref) => ref.firstKey?.name === "fields"),
    refs: toFieldRefs(scan),
  }
}

function toFieldRefs(scan: LayoutScan): LayoutFieldRef[] {
  return fieldCandidateRefs(scan).map((ref) => ({
    name: ref.root,
    from: ref.rootFrom,
    to: ref.rootTo,
    bracket: ref.bracket,
  }))
}

// Every name the layout may read a field by (bare or bracketed), known or
// not, without the syntax check: what field pills look at on every edit.
export function findFieldRefs(source: string): LayoutFieldRef[] {
  return toFieldRefs(scanLayout(source))
}

export interface FieldRename {
  from: string
  to: string
}

export interface RenameLayoutFieldRefsResult {
  source: string
  changed: boolean
  // Why some references were left as they are: the layout does not parse, so
  // its references cannot be told apart from text, or a local already has
  // the new name.
  skipped?: "parseError" | "shadowed"
}

/**
 * The layout with its references to renamed fields moved to the new names:
 * `["Old"]` and a bare `Old` both become `["New"]`, which reads any name.
 * Locals and ctx are never touched.
 */
export function renameLayoutFieldRefs(
  source: string,
  renames: readonly FieldRename[],
  // Fields are renamed by name; the host is taken for hosts that key otherwise.
  _host: LayoutHost,
): RenameLayoutFieldRefsResult {
  const active = renames.filter((rename) => rename.from !== rename.to)
  if (active.length === 0) return { source, changed: false }
  if (checkLayoutSyntax(source)) {
    const named = findFieldRefs(source).some((ref) =>
      active.some((rename) => rename.from === ref.name),
    )
    return { source, changed: false, ...(named && { skipped: "parseError" as const }) }
  }

  const scan = scanLayout(source)
  const localNames = new Set(scan.locals.map((local) => local.name))
  const toByFrom = new Map(active.map((rename) => [rename.from, rename.to]))
  let skipped: RenameLayoutFieldRefsResult["skipped"]
  const edits: Array<{ from: number; to: number; text: string }> = []
  for (const ref of fieldCandidateRefs(scan)) {
    const to = toByFrom.get(ref.root)
    if (to === undefined) continue
    if (localNames.has(to)) {
      skipped = "shadowed"
      continue
    }
    edits.push({ from: ref.rootFrom, to: ref.rootTo, text: formatFieldRef(to) })
  }

  let next = source
  for (const edit of edits.toSorted((a, b) => b.from - a.from)) {
    next = next.slice(0, edit.from) + edit.text + next.slice(edit.to)
  }
  return {
    source: next,
    changed: next !== source,
    ...(skipped && { skipped }),
  }
}

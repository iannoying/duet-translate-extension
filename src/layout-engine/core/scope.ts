import type { LayoutField, LayoutHost, LayoutStatus } from "../contract"
import { LAYOUT_RESERVED_FIELD_NAMES } from "../contract"

/**
 * The data a layout renders: each field's value at the top level, under the
 * key the host reads fields by, and `ctx` with every field in order
 * (`ctx.fields`), the host's own keys, and the status.
 */

export type LayoutScope = Record<string, unknown>

export interface LayoutFieldEntry {
  id: string
  name: string
  type: string
  value: string | number | null
  // Streaming, and the answer has not reached this field yet.
  pending: boolean
}

export interface BuildLayoutScopeInput {
  host: LayoutHost
  fields: readonly LayoutField[]
  // The answer so far, keyed like `host.scopeKey`; null before there is one.
  values: Readonly<Record<string, unknown>> | null
  ctx: Readonly<Record<string, unknown>>
  status: LayoutStatus
}

/**
 * A field's value as layouts see it: text, a number for a number field, or
 * undefined when it is empty. A number field's numeric text is read as a
 * number; blank text, `null` and anything unreadable are empty.
 */
export function formatLayoutFieldValue(value: unknown, type: string): string | number | undefined {
  if (value === null || value === undefined) return undefined
  if (type === "number") {
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (trimmed === "") return undefined
      const number = Number(trimmed)
      return Number.isFinite(number) ? number : trimmed
    }
  }
  if (typeof value === "string") return value.trim() === "" ? undefined : value
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "boolean") return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

function defineOwn(target: Record<string, unknown>, key: string, value: unknown) {
  // A field named `__proto__` must stay an own key.
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

const RESERVED = new Set<string>(LAYOUT_RESERVED_FIELD_NAMES)

export function buildLayoutScope({
  host,
  fields,
  values,
  ctx,
  status,
}: BuildLayoutScopeInput): LayoutScope {
  const scope: LayoutScope = {}
  const entries: LayoutFieldEntry[] = fields.map((field) => {
    const key = field[host.scopeKey]
    const present = values !== null && Object.hasOwn(values, key)
    const value = present ? formatLayoutFieldValue(values[key], field.type) : undefined
    const entry: LayoutFieldEntry = {
      id: field.id,
      name: field.name,
      type: field.type,
      value: value ?? null,
      pending: status === "streaming" && !present,
    }
    // The first field wins a name two fields share.
    if (!RESERVED.has(key) && !Object.hasOwn(scope, key)) defineOwn(scope, key, entry.value)
    return entry
  })

  const context: Record<string, unknown> = { fields: entries }
  for (const [key, value] of Object.entries(ctx)) {
    if (key !== "fields" && key !== "status") defineOwn(context, key, value)
  }
  context.status = status
  defineOwn(scope, "ctx", context)
  return scope
}

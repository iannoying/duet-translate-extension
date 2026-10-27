import { LAYOUT_PARSE_JSON_MAX_LENGTH } from "../contract"

/**
 * The `parse_json` filter: JSON text → data, nil when it isn't JSON. A JSON
 * array cut off mid-stream gives the items completed so far, so a list grows
 * item by item while the answer streams. A value that is already data passes
 * through.
 */

const FENCE = /^```[a-z]*\s*\n?([\s\S]*?)\n?```$/i

// The longest prefix of a truncated array that ends after a complete item,
// closed: `[{"a":1},{"b"` → `[{"a":1}]`.
function completedArrayPrefix(text: string): string | null {
  let depth = 0
  let inString = false
  let escaped = false
  let lastEnd = -1
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') {
        inString = false
        if (depth === 1) lastEnd = i + 1
      }
      continue
    }
    if (char === '"') inString = true
    else if (char === "[" || char === "{") depth++
    else if (char === "]" || char === "}") {
      depth--
      if (depth === 1) lastEnd = i + 1
      if (depth <= 0) return null
    } else if (char === "," && depth === 1) lastEnd = i
  }
  if (lastEnd === -1) return "[]"
  return `${text.slice(0, lastEnd).replace(/,\s*$/, "")}]`
}

export function parseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return typeof value === "object" && value !== null ? value : null
  }
  if (value.length > LAYOUT_PARSE_JSON_MAX_LENGTH) return null
  let text = value.trim()
  const fenced = FENCE.exec(text)
  if (fenced) text = fenced[1]!.trim()
  if (text === "") return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    if (!text.startsWith("[")) return null
    const prefix = completedArrayPrefix(text)
    if (prefix === null) return null
    try {
      return JSON.parse(prefix) as unknown
    } catch {
      return null
    }
  }
}

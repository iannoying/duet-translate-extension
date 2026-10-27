import type { StyleBlock } from "../core/css"
import { LAYOUT_CTX_ROOT, LAYOUT_RESERVED_FIELD_NAMES } from "../contract"
import { findStyleBlocks } from "../core/css"

/**
 * A static read of a layout's Liquid, for the editor: where every output and
 * tag sits, which names it reads, which locals it assigns, and which filters
 * it applies. It never runs the layout. Liquid inside `<style>` blocks,
 * `{% raw %}` and comments is not code, so it is left out.
 */

export interface LiquidSegment {
  kind: "output" | "tag"
  // The whole `{{ … }}` / `{% … %}`.
  from: number
  to: number
  // Its content, between the delimiters and any `-` trim markers.
  contentFrom: number
  content: string
  // A tag's name: `if`, `endfor`, `#`.
  name: string
  // Inside a `<style>` block, where Liquid never runs.
  inStyle: boolean
  closed: boolean
}

export type ExpressionTokenKind =
  | "identifier"
  | "string"
  | "number"
  | "punct"
  | "operator"
  | "range"
  | "unknown"

export interface ExpressionToken {
  kind: ExpressionTokenKind
  text: string
  // The string's value, for a string token.
  value?: string
  from: number
  to: number
}

// A read of a variable: its root, as `Term` or `["the term"]`, and the key
// right after it (`ctx.selection` → "selection").
export interface VariableRef {
  root: string
  rootFrom: number
  rootTo: number
  bracket: boolean
  firstKey?: { name: string; from: number; to: number }
  segment: LiquidSegment
}

export interface FilterUse {
  name: string
  from: number
  to: number
  segment: LiquidSegment
  // Its place among the segment's filters, and how many there are.
  position: number
  count: number
}

export interface LocalDefinition {
  name: string
  from: number
  to: number
  tag: "assign" | "for"
}

export interface LayoutScan {
  segments: LiquidSegment[]
  styleBlocks: StyleBlock[]
  variables: VariableRef[]
  filters: FilterUse[]
  locals: LocalDefinition[]
}

const OPEN_DELIMITERS = /\{\{|\{%/g

function readTo(source: string, from: number, delimiter: string, respectQuotes: boolean): number {
  let quote: string | null = null
  for (let i = from; i < source.length; i++) {
    const char = source[i]!
    if (quote) {
      if (char === quote) quote = null
      continue
    }
    if (respectQuotes && (char === '"' || char === "'")) {
      quote = char
      continue
    }
    if (source.startsWith(delimiter, i)) return i
  }
  return -1
}

function inside(position: number, blocks: readonly StyleBlock[]): boolean {
  return blocks.some((block) => position >= block.contentFrom && position < block.contentTo)
}

function segmentAt(
  source: string,
  from: number,
  kind: "output" | "tag",
  styleBlocks: readonly StyleBlock[],
): LiquidSegment {
  const close = kind === "output" ? "}}" : "%}"
  let contentFrom = from + 2
  if (source[contentFrom] === "-") contentFrom++
  const end = readTo(source, contentFrom, close, kind === "output")
  const closed = end !== -1
  let contentTo = closed ? end : source.length
  if (closed && source[contentTo - 1] === "-" && contentTo - 1 >= contentFrom) contentTo--
  const content = source.slice(contentFrom, contentTo)
  const name = kind === "tag" ? (/^\s*(#|[A-Za-z_]\w*)/.exec(content)?.[1] ?? "") : ""
  return {
    kind,
    from,
    to: closed ? end + 2 : source.length,
    contentFrom,
    content,
    name,
    inStyle: inside(from, styleBlocks),
    closed,
  }
}

function findSegments(source: string, styleBlocks: readonly StyleBlock[]): LiquidSegment[] {
  const segments: LiquidSegment[] = []
  OPEN_DELIMITERS.lastIndex = 0
  for (let match = OPEN_DELIMITERS.exec(source); match; match = OPEN_DELIMITERS.exec(source)) {
    const segment = segmentAt(
      source,
      match.index,
      match[0] === "{{" ? "output" : "tag",
      styleBlocks,
    )
    segments.push(segment)
    let next = segment.to
    // The body of `raw` and `comment` is text, up to its end tag.
    if (
      segment.kind === "tag" &&
      !segment.inStyle &&
      (segment.name === "raw" || segment.name === "comment")
    ) {
      const endTag = new RegExp(`\\{%-?\\s*end${segment.name}\\s*-?%\\}`, "g")
      endTag.lastIndex = next
      const end = endTag.exec(source)
      if (!end) break
      segments.push(segmentAt(source, end.index, "tag", styleBlocks))
      next = end.index + end[0].length
    }
    OPEN_DELIMITERS.lastIndex = next
  }
  return segments
}

const IDENTIFIER = /[A-Za-z_][\w-]*\??/y
const NUMBER = /-?\d+(?:\.\d+)?/y
const OPERATOR = /==|!=|<>|<=|>=|<|>/y

export function lexExpression(content: string, offset: number): ExpressionToken[] {
  const tokens: ExpressionToken[] = []
  let i = 0
  while (i < content.length) {
    const char = content[i]!
    if (/\s/.test(char)) {
      i++
      continue
    }
    const from = offset + i
    if (char === '"' || char === "'") {
      const end = content.indexOf(char, i + 1)
      const stop = end === -1 ? content.length : end + 1
      const raw = content.slice(i + 1, end === -1 ? content.length : end)
      tokens.push({
        kind: "string",
        text: content.slice(i, stop),
        value: unescape(raw),
        from,
        to: offset + stop,
      })
      i = stop
      continue
    }
    if (content.startsWith("..", i)) {
      tokens.push({ kind: "range", text: "..", from, to: from + 2 })
      i += 2
      continue
    }
    for (const [pattern, kind] of [
      [NUMBER, "number"],
      [IDENTIFIER, "identifier"],
      [OPERATOR, "operator"],
    ] as const) {
      pattern.lastIndex = i
      const match = pattern.exec(content)
      if (match) {
        tokens.push({ kind, text: match[0], from, to: from + match[0].length })
        i += match[0].length
        break
      }
    }
    if (tokens.at(-1)?.from === from) continue
    tokens.push({
      kind: "[].|:,=()".includes(char) ? "punct" : "unknown",
      text: char,
      from,
      to: from + 1,
    })
    i++
  }
  return tokens
}

// liquidjs's escapes in a quoted string: `\"`, `\\`, `\n`, `%`…
function unescape(raw: string): string {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, escape: string) => {
    if (escape.length === 5) return String.fromCharCode(Number.parseInt(escape.slice(1), 16))
    return ({ n: "\n", r: "\r", t: "\t" } as Record<string, string>)[escape] ?? escape
  })
}

const KEYWORDS = new Set([
  "true",
  "false",
  "nil",
  "null",
  "empty",
  "blank",
  "and",
  "or",
  "not",
  "contains",
  "in",
  "reversed",
  "else",
])

// The index after the bracket that closes the one at `open`.
function closingBracket(tokens: readonly ExpressionToken[], open: number): number {
  let depth = 0
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i]!.text === "[") depth++
    else if (tokens[i]!.text === "]") {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return tokens.length
}

interface ExpressionRead {
  variables: VariableRef[]
  filters: Array<{ name: string; from: number; to: number }>
}

// The variables and filters of an expression's tokens.
function readExpression(
  tokens: readonly ExpressionToken[],
  segment: LiquidSegment,
): ExpressionRead {
  const variables: VariableRef[] = []
  const filters: Array<{ name: string; from: number; to: number }> = []
  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]!
    const next = tokens[i + 1]
    if (token.text === "|") {
      if (next?.kind === "identifier") {
        filters.push({ name: next.text, from: next.from, to: next.to })
        i += 2
      } else i++
      continue
    }
    // A named argument's key (`limit: 2`) or a hash key.
    if (token.kind === "identifier" && next?.text === ":") {
      i += 2
      continue
    }
    const isRoot =
      (token.kind === "identifier" && !KEYWORDS.has(token.text)) ||
      (token.text === "[" && tokens[i + 1]?.kind === "string" && tokens[i + 2]?.text === "]")
    if (!isRoot) {
      i++
      continue
    }

    let root: string
    let rootTo: number
    let end: number
    if (token.kind === "identifier") {
      root = token.text
      rootTo = token.to
      end = i + 1
    } else {
      root = tokens[i + 1]!.value ?? ""
      rootTo = tokens[i + 2]!.to
      end = i + 3
    }
    const ref: VariableRef = {
      root,
      rootFrom: token.from,
      rootTo,
      bracket: token.kind !== "identifier",
      segment,
    }
    // The accessor chain: `.key`, `[…]`.
    let first = true
    while (end < tokens.length) {
      const accessor = tokens[end]!
      if (accessor.text === "." && tokens[end + 1]?.kind === "identifier") {
        const key = tokens[end + 1]!
        if (first) ref.firstKey = { name: key.text, from: key.from, to: key.to }
        end += 2
      } else if (accessor.text === "[") {
        const close = closingBracket(tokens, end)
        const inner = tokens.slice(end + 1, close - 1)
        if (first && inner.length === 1 && inner[0]!.kind === "string") {
          ref.firstKey = { name: inner[0]!.value ?? "", from: inner[0]!.from, to: inner[0]!.to }
        }
        // Names inside a dynamic key are reads of their own.
        variables.push(...readExpression(inner, segment).variables)
        end = close
      } else break
      first = false
    }
    variables.push(ref)
    i = end
  }
  return { variables, filters }
}

export function scanLayout(source: string): LayoutScan {
  const styleBlocks = findStyleBlocks(source)
  const segments = findSegments(source, styleBlocks)
  const variables: VariableRef[] = []
  const filters: FilterUse[] = []
  const locals: LocalDefinition[] = []

  let skipping: string | null = null
  for (const segment of segments) {
    if (segment.inStyle) continue
    if (skipping) {
      if (segment.kind === "tag" && segment.name === `end${skipping}`) skipping = null
      continue
    }
    if (segment.kind === "tag" && (segment.name === "raw" || segment.name === "comment")) {
      skipping = segment.name
      continue
    }
    if (segment.kind === "tag" && segment.name === "#") continue

    let tokens = lexExpression(segment.content, segment.contentFrom)
    if (segment.kind === "tag") {
      // Drop the tag's name.
      tokens = tokens.slice(1)
      if (segment.name === "assign" || segment.name === "for") {
        const target = tokens[0]
        if (target?.kind === "identifier") {
          locals.push({ name: target.text, from: target.from, to: target.to, tag: segment.name })
          // `name =` or `name in`.
          tokens = tokens.slice(2)
        }
      }
    }
    const read = readExpression(tokens, segment)
    variables.push(...read.variables)
    read.filters.forEach((filter, position) =>
      filters.push({ ...filter, segment, position, count: read.filters.length }),
    )
  }
  return { segments, styleBlocks, variables, filters, locals }
}

const RESERVED = new Set<string>(LAYOUT_RESERVED_FIELD_NAMES)

// The reads that may be fields: not locals, keywords or reserved roots.
export function fieldCandidateRefs(scan: LayoutScan): VariableRef[] {
  const localNames = new Set(scan.locals.map((local) => local.name))
  return scan.variables.filter((ref) => !RESERVED.has(ref.root) && !localNames.has(ref.root))
}

export function ctxRefs(scan: LayoutScan): VariableRef[] {
  return scan.variables.filter((ref) => ref.root === LAYOUT_CTX_ROOT)
}

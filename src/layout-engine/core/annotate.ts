import { LAYOUT_ANNOTATE_MAX_ITEMS, LAYOUT_ANNOTATE_MAX_TEXT_LENGTH } from "../contract"

/**
 * The `annotate` filter: finds, in a text, the span each item quotes, and
 * returns events that cover the whole text in order, so one flat `for` loop
 * can draw the text with every span marked:
 *
 *   {kind: "text", text}                     a plain stretch
 *   {kind: "enter" | "leave", item, index,   around a found span
 *    depth, leaf, key}
 *
 * The first key (default "text") quotes the item's own span. Every further
 * key (such as "head") quotes a word that belongs with the item; it is found
 * nearest to the item's own span and marked the same way, with its key.
 *
 * Matching ignores case, runs of whitespace, and typographic quotes and
 * dashes. "…" (or "...") in a quote stands for skipped words. An item's
 * `occurrence: n` picks the nth match; otherwise the first match at or after
 * the previous item's wins, since items come in the order they start. Spans
 * may nest but never partly overlap: an item that would is dropped, like one
 * that matches nothing.
 */

export interface AnnotateTextEvent {
  kind: "text"
  text: string
}

export interface AnnotateSpanEvent {
  kind: "enter" | "leave"
  item: unknown
  index: number
  depth: number
  leaf: boolean
  key: string
}

export type AnnotateEvent = AnnotateTextEvent | AnnotateSpanEvent

interface Span {
  start: number
  end: number
  item: Record<string, unknown>
  index: number
  key: string
  // Shared by the span's enter and leave events.
  info: { depth: number; leaf: boolean }
}

interface Range {
  start: number
  end: number
}

// The text, normalized for matching, with each normalized character's range
// in the original.
interface NormalizedText {
  text: string
  from: number[]
  to: number[]
}

const QUOTES: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "′": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "‟": '"',
  "″": '"',
  "«": '"',
  "»": '"',
}

const DASHES = /[‐-―−﹘﹣－]/u
const WHITESPACE = /\s/u

function normalizeChar(char: string): string {
  if (QUOTES[char]) return QUOTES[char]
  if (DASHES.test(char)) return "-"
  const lower = char.toLowerCase()
  // A few characters lowercase to more than one; matching keeps them as they are.
  return lower.length === char.length ? lower : char
}

function normalize(text: string): NormalizedText {
  let out = ""
  const from: number[] = []
  const to: number[] = []
  let index = 0
  for (const char of text) {
    const end = index + char.length
    if (WHITESPACE.test(char)) {
      if (out.endsWith(" ")) {
        to[to.length - 1] = end
      } else {
        out += " "
        from.push(index)
        to.push(end)
      }
    } else {
      const normalized = normalizeChar(char)
      for (let i = 0; i < normalized.length; i++) {
        from.push(index)
        to.push(end)
      }
      out += normalized
    }
    index = end
  }
  return { text: out, from, to }
}

// A quote's parts, normalized: "turned … down" → ["turned", "down"].
function quoteParts(quote: string): string[] {
  return normalize(quote)
    .text.split(/\s*(?:…|\.\.\.)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean)
}

// Letters and digits of scripts that put spaces between words: a match that
// starts or ends inside such a word ("if" in "certified") is a poor match.
const SPACED_WORD_CHAR = /[\p{L}\p{N}]/u
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u

function isSpacedWordChar(char: string | undefined): boolean {
  return char !== undefined && SPACED_WORD_CHAR.test(char) && !UNSPACED_SCRIPT.test(char)
}

function splitsAWord(text: string, range: Range): boolean {
  const before = text.slice(0, range.start).at(-1)
  const first = text[range.start]
  const last = text[range.end - 1]
  const after = text[range.end]
  return (
    (isSpacedWordChar(before) && isSpacedWordChar(first)) ||
    (isSpacedWordChar(last) && isSpacedWordChar(after))
  )
}

// Every place `quote` matches in the text, in order; matches that split a
// word are only kept when there is nothing better.
function findMatches(source: string, normalized: NormalizedText, quote: string): Range[] {
  const parts = quoteParts(quote)
  if (parts.length === 0) return []
  const matches: Range[] = []
  const haystack = normalized.text
  for (let start = haystack.indexOf(parts[0]!); start !== -1;) {
    let end = start + parts[0]!.length
    let found = true
    for (const part of parts.slice(1)) {
      const next = haystack.indexOf(part, end)
      if (next === -1) {
        found = false
        break
      }
      end = next + part.length
    }
    if (!found) break
    matches.push({ start: normalized.from[start]!, end: normalized.to[end - 1]! })
    start = haystack.indexOf(parts[0]!, start + 1)
  }
  // "turned … down" means the nearest "turned" before the "down".
  const tight = matches.filter(
    (match) => !matches.some((other) => other.end === match.end && other.start > match.start),
  )
  const whole = tight.filter((match) => !splitsAWord(source, match))
  return whole.length > 0 ? whole : tight
}

function crosses(a: Range, b: Range): boolean {
  return (
    (a.start < b.start && b.start < a.end && a.end < b.end) ||
    (b.start < a.start && a.start < b.end && b.end < a.end)
  )
}

function fits(range: Range, spans: readonly Span[]): boolean {
  return spans.every((span) => !crosses(range, span))
}

function distance(a: Range, b: Range): number {
  if (a.end <= b.start) return b.start - a.end
  if (b.end <= a.start) return a.start - b.end
  return 0
}

function overlaps(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toText(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}

export function annotate(input: unknown, items: unknown, ...keyArgs: unknown[]): AnnotateEvent[] {
  const text = toText(input)
  if (text === "") return []
  const plain: AnnotateEvent[] = [{ kind: "text", text }]
  if (!Array.isArray(items) || text.length > LAYOUT_ANNOTATE_MAX_TEXT_LENGTH) return plain

  const keys = keyArgs.filter((key): key is string => typeof key === "string" && key !== "")
  const [primary = "text", ...secondary] = keys
  const normalized = normalize(text)
  const spans: Span[] = []
  const own = new Map<number, Span>()
  const candidates = items.slice(0, LAYOUT_ANNOTATE_MAX_ITEMS)

  let cursor = 0
  candidates.forEach((item, index) => {
    if (!isRecord(item)) return
    const quote = item[primary]
    if (typeof quote !== "string") return
    const matches = findMatches(text, normalized, quote)
    const { occurrence } = item
    let chosen: Range | undefined
    if (typeof occurrence === "number" && Number.isInteger(occurrence) && occurrence >= 1) {
      const match = matches[occurrence - 1]
      chosen = match && fits(match, spans) ? match : undefined
    } else {
      chosen =
        matches.find((match) => match.start >= cursor && fits(match, spans)) ??
        matches.find((match) => fits(match, spans))
    }
    if (!chosen) return
    const span: Span = {
      ...chosen,
      item,
      index,
      key: primary,
      info: { depth: 0, leaf: true },
    }
    spans.push(span)
    own.set(index, span)
    cursor = chosen.start
  })

  for (const key of secondary) {
    candidates.forEach((item, index) => {
      const anchor = own.get(index)
      if (!anchor || !isRecord(item)) return
      const quote = item[key]
      if (typeof quote !== "string") return
      const nearest = findMatches(text, normalized, quote)
        .filter((match) => fits(match, spans))
        .sort(
          (a, b) =>
            Number(overlaps(a, anchor)) - Number(overlaps(b, anchor)) ||
            distance(a, anchor) - distance(b, anchor) ||
            a.start - b.start,
        )[0]
      if (!nearest) return
      spans.push({ ...nearest, item, index, key, info: { depth: 0, leaf: true } })
    })
  }

  if (spans.length === 0) return plain

  // Outer spans first: by start, then the longer one, then the item's own
  // span before a linked word, then list order.
  spans.sort(
    (a, b) =>
      a.start - b.start ||
      b.end - a.end ||
      Number(a.key !== primary) - Number(b.key !== primary) ||
      a.index - b.index,
  )

  const events: AnnotateEvent[] = []
  const stack: Span[] = []
  let position = 0
  const emitText = (until: number) => {
    if (until > position) events.push({ kind: "text", text: text.slice(position, until) })
    position = Math.max(position, until)
  }
  const spanEvent = (kind: "enter" | "leave", span: Span): AnnotateSpanEvent => ({
    kind,
    item: span.item,
    index: span.index,
    key: span.key,
    get depth() {
      return span.info.depth
    },
    get leaf() {
      return span.info.leaf
    },
  })
  const close = (until: number) => {
    while (stack.length > 0 && stack.at(-1)!.end <= until) {
      const top = stack.pop()!
      emitText(top.end)
      events.push(spanEvent("leave", top))
    }
  }

  for (const span of spans) {
    close(span.start)
    emitText(span.start)
    const parent = stack.at(-1)
    if (parent) parent.info.leaf = false
    span.info.depth = stack.length
    stack.push(span)
    events.push(spanEvent("enter", span))
  }
  close(Number.POSITIVE_INFINITY)
  emitText(text.length)

  // Liquid reads plain values: settle the getters.
  return events.map((event) => ({ ...event }))
}

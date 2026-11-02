import { BATCH_SEPARATOR } from "@/utils/constants/prompt"

/**
 * Paired link markers for bilingual page translation.
 *
 * A source paragraph's links are sent to the provider as `<aN>…</aN>` around
 * the linked words (N numbers the paragraph's links from 0). The translation
 * comes back with each pair moved to wherever the target language put those
 * words, and the DOM side wraps them in a sanitized copy of the original
 * `<a>` (see `dom/inline-atoms.ts`), so the translated words keep the link and
 * the page's link styling.
 *
 * Why this spelling: a live probe of the two free providers showed Microsoft's
 * plain-text endpoint keeps `<aN>…</aN>` intact and reorders it correctly
 * (attributed tags such as `<a id="0">` get their quotes curled and their
 * contents moved), while Google's `translateHtml` endpoint drops custom tag
 * names but aligns a real `<a id="N">` perfectly. So the request text carries
 * the short form, the Google adapter maps it to `<a id="N">` on the wire and
 * back, and LLMs read it as ordinary HTML tags.
 *
 * This module is DOM-free: the content script encodes and decodes, the
 * provider adapters convert, and the prompt builder gates its rule on
 * `hasLinkMarkers`.
 */

const OPEN_SOURCE = String.raw`<\s*a(\d+)\s*>`
const CLOSE_SOURCE = String.raw`<\s*\/\s*a(\d+)\s*>`

/** Any marker-shaped literal, opening or closing. */
const ANY_MARKER_RE = new RegExp(`${OPEN_SOURCE}|${CLOSE_SOURCE}`, "i")

export function encodeLinkOpenMarker(index: number): string {
  return `<a${index}>`
}

export function encodeLinkCloseMarker(index: number): string {
  return `</a${index}>`
}

/**
 * True when `text` holds marker-shaped literals. A paragraph whose own text
 * already contains one (documentation printing `<a0>`) is sent without link
 * markers, so page content is never mistaken for a link.
 */
export function containsLinkMarkerLiteral(text: string): boolean {
  return ANY_MARKER_RE.test(text)
}

/**
 * True when `text` carries at least one complete pair in the exact shape we
 * emit. Gates the provider adapters and the LLM prompt rule, so text that
 * merely mentions `<a0>` never switches either on.
 */
export function hasLinkMarkers(text: string): boolean {
  for (const match of text.matchAll(/<a(\d+)>/g)) {
    if (text.includes(encodeLinkCloseMarker(Number.parseInt(match[1]!, 10)), match.index)) {
      return true
    }
  }
  return false
}

/** Remove every marker, keeping the words between them. */
export function stripLinkMarkers(text: string): string {
  return text.replace(new RegExp(ANY_MARKER_RE.source, "gi"), "")
}

export interface LinkSegment {
  text: string
  /** Index of the source link these words belong to, or null for plain text. */
  linkIndex: number | null
}

/**
 * Split a translation into plain runs and linked runs.
 *
 * Providers occasionally lose or mangle a marker. Rather than guess which
 * words a broken pair meant, any structural problem (a nested or unbalanced
 * pair, a mismatched close, an index we never issued, an index used twice)
 * drops every marker and returns the words as one plain run — the
 * translation is never lost, only its links. A pair that is simply missing is
 * fine: those words render unlinked.
 */
export function decodeLinkMarkers(text: string, linkCount: number): LinkSegment[] {
  const segments = parseLinkMarkers(text, linkCount)
  if (segments) return segments
  const stripped = stripLinkMarkers(text)
  return stripped ? [{ text: stripped, linkIndex: null }] : []
}

/** The segments, or null when the marker structure is broken. */
function parseLinkMarkers(text: string, linkCount: number): LinkSegment[] | null {
  const segments: LinkSegment[] = []
  const used = new Set<number>()
  let openIndex: number | null = null
  let cursor = 0

  for (const match of text.matchAll(new RegExp(`${OPEN_SOURCE}|${CLOSE_SOURCE}`, "gi"))) {
    const start = match.index ?? 0
    if (start > cursor) segments.push({ text: text.slice(cursor, start), linkIndex: openIndex })
    cursor = start + match[0].length

    if (match[1] !== undefined) {
      const index = Number.parseInt(match[1], 10)
      if (openIndex !== null || index >= linkCount || used.has(index)) return null
      used.add(index)
      openIndex = index
    } else {
      const index = Number.parseInt(match[2]!, 10)
      if (openIndex !== index) return null
      openIndex = null
    }
  }

  if (openIndex !== null) return null
  if (cursor < text.length) segments.push({ text: text.slice(cursor), linkIndex: null })
  return segments.filter((segment) => segment.text !== "")
}

/**
 * Whether a translation's markers are well formed for the pairs its source
 * carried — the structural checks `decodeLinkMarkers` applies. A pair the
 * provider dropped is acceptable (those words render unlinked); a broken
 * structure renders every link plain, so such a result is not worth caching.
 */
export function areLinkMarkersIntact(source: string, output: string): boolean {
  let linkCount = 0
  for (const match of source.matchAll(/<a(\d+)>/g)) {
    linkCount = Math.max(linkCount, Number.parseInt(match[1]!, 10) + 1)
  }
  return parseLinkMarkers(output, linkCount) !== null
}

/**
 * Google `translateHtml` request side: the source was already HTML-escaped, so
 * our markers read `&lt;aN&gt;`. Turn them into real anchors the endpoint
 * aligns. Page text cannot produce this shape: a literal `&lt;` in the page is
 * escaped to `&amp;lt;`.
 */
export function linkMarkersToGoogleHtml(escapedText: string): string {
  return escapedText
    .replace(/&lt;a(\d+)&gt;/g, (_, index: string) => `<a id="${index}">`)
    .replace(/&lt;\/a\d+&gt;/g, "</a>")
}

/**
 * Google `translateHtml` response side: map `<a id="N">…</a>` back to
 * `<aN>…</aN>`. The response is still HTML-encoded (page `<` arrives as
 * `&lt;`), so every raw tag here is one of ours. Links never nest, so a close
 * tag closes the most recent open one; an anchor without our id is dropped.
 */
export function linkMarkersFromGoogleHtml(html: string): string {
  const open: Array<string | null> = []
  return html.replace(/<a\b([^>]*)>|<\/a\s*>/gi, (_tag: string, attributes: string | undefined) => {
    if (attributes !== undefined) {
      const index = /\bid\s*=\s*["']?(\d+)/i.exec(attributes)?.[1] ?? null
      open.push(index)
      return index === null ? "" : encodeLinkOpenMarker(Number.parseInt(index, 10))
    }
    const index = open.pop()
    return index === undefined || index === null
      ? ""
      : encodeLinkCloseMarker(Number.parseInt(index, 10))
  })
}

/**
 * Microsoft request side: its endpoint parses the request as HTML, so the
 * adapter escapes page text. Put our markers back as raw tags — the endpoint's
 * tag aligner moves `<aN>…</aN>` with the words it wraps.
 */
export function restoreEscapedLinkMarkers(escapedText: string): string {
  return escapedText.replace(/&lt;(\/?)a(\d+)&gt;/g, "<$1a$2>")
}

// No worked example on purpose, for the same reason as the placeholder rules:
// an example teaches models a base rate for emitting markers.
export const LINK_MARKER_SYSTEM_PROMPT = `## Link Tag Rules
These mandatory rules override any conflicting instructions above:
1. A link tag pair is \`<a\` followed by a number and \`>\`, then text, then \`</a\` with the same number and \`>\`. The tags mark which words are a hyperlink; the text between them must be translated.
2. Within each input segment (segments are separated by a standalone ${BATCH_SEPARATOR} line when present), wrap the translation of exactly the same words in the same pair, once: same number, no attributes, no spaces inside the tags.
3. Never drop, add, renumber, nest, or merge link tags. A pair may move within its segment to follow the target-language word order.`

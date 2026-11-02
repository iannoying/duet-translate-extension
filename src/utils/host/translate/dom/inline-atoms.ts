import type { Config } from "@/types/config/config"
import type { TransNode } from "@/types/dom"
import {
  CONTENT_WRAPPER_CLASS,
  INLINE_ATOM_CLASS,
  MARK_ATTRIBUTES,
} from "@/utils/constants/dom-labels"
import { logger } from "@/utils/logger"
import { getEffectiveSiteRule } from "@/utils/site-rules/effective"
import {
  isDontWalkIntoAndDontTranslateAsChildElement,
  isHTMLElement,
  isInlineAtomElement,
  isTextNode,
} from "../../dom/filter"
import { extractTextContent } from "../../dom/traversal"
import {
  decodeInlineAtomTokens,
  encodeInlineAtomToken,
  nextFreeInlineAtomIndex,
} from "../inline-atom-tokens"
import {
  containsLinkMarkerLiteral,
  decodeLinkMarkers,
  encodeLinkCloseMarker,
  encodeLinkOpenMarker,
} from "../link-markers"

/**
 * Inline atoms for bilingual page translation.
 *
 * A rendered formula (native MathML, KaTeX, MathJax, Wikipedia math) carries
 * no translatable text, yet its subtree is exactly what the plain-text
 * extractor cannot represent: dont-walk tags collapse to "" and KaTeX's glyph
 * spans leak as soup. Instead of teaching the provider markup, the paragraph
 * is extracted ONCE with every atom replaced by a `{{n}}` placeholder
 * (`requestText`) while the prose-only string every existing filter already
 * sees is kept alongside (`filterText`). After translation the placeholders
 * are located again and sanitized clones of the original elements are put in
 * their place. Paragraphs without atoms are byte-identical to the legacy path.
 */
export interface InlineAtomExtraction {
  /** Legacy extraction: atoms contribute "". Feeds the numeric/small-paragraph/language filters. */
  filterText: string
  /** Prose with one `{{n}}` per renderable atom. Sent to the provider. */
  requestText: string
  /** Source elements in document order; never clones. */
  atoms: readonly HTMLElement[]
  /** Token numbering starts here so token-shaped literals in the prose never collide. */
  baseIndex: number
  /** Whether `filterText` contains any letter — token-only runs must not be sent. */
  hasProse: boolean
  /**
   * Source links in marker order (`<a0>` is `links[0]`). Empty unless the
   * caller asked to preserve links; `requestText` then carries one
   * `<aN>…</aN>` pair around each link's words.
   */
  links: readonly HTMLAnchorElement[]
}

export interface InlineExtractionOptions {
  /**
   * Wrap each source link's words in `<aN>…</aN>` so the translation can keep
   * the link. Only bilingual mode asks for it, and only when its translation
   * will not itself sit inside a link.
   */
  preserveLinks?: boolean
}

// OBJECT REPLACEMENT CHARACTER: an in-band marker for the single extraction
// pass, swapped for real tokens once the collision offset is known.
const ATOM_SENTINEL = "￼"
const ATOM_SENTINEL_RE = /￼/g
// INTERLINEAR ANNOTATION ANCHOR / TERMINATOR: in-band link boundaries, swapped
// for `<aN>` / `</aN>` once the extraction is known to be unambiguous.
const LINK_OPEN_SENTINEL = "\uFFF9"
const LINK_CLOSE_SENTINEL = "\uFFFB"
const LINK_SENTINEL_RE = /[\uFFF9\uFFFB]/g
const PROSE_RE = /\p{L}/u
const LEADING_WHITESPACE_RE = /^\s*/
const TRAILING_WHITESPACE_RE = /\s*$/

/**
 * A link worth carrying into the translation: a real HTML anchor with a
 * navigable href. `javascript:` links and the bare `#` placeholder that
 * script-driven buttons use would lose their behavior in a copy, so their
 * words stay plain text.
 */
function isPreservableLink(element: HTMLElement): element is HTMLAnchorElement {
  if (element.localName !== "a" || typeof (element as HTMLAnchorElement).href !== "string") {
    return false
  }
  const href = element.getAttribute("href")?.trim()
  return !!href && href !== "#" && !/^javascript:/i.test(href)
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

/**
 * An atom worth a placeholder must render something. MathJax v2 leaves an
 * empty `span.MathJax_Preview` beside every typeset formula; cloning it would
 * only add a token the provider can drop.
 */
export function isRenderableInlineAtom(element: HTMLElement): boolean {
  return element.firstElementChild !== null || (element.textContent ?? "").trim() !== ""
}

export function extractInlineAtomText(
  nodes: readonly TransNode[],
  config: Config,
  options: InlineExtractionOptions = {},
): InlineAtomExtraction {
  const atoms: HTMLElement[] = []
  const links: HTMLAnchorElement[] = []
  let insideLink = false

  const replaceAtom = (element: HTMLElement): string | undefined => {
    if (element.localName === "math") {
      // A <math> nested inside a renderer wrapper the walk already treats as
      // one unit (KaTeX's .katex-mathml, MathJax's assistive MathML) is the
      // hidden accessible copy of a formula that wrapper renders. Cloning it
      // next to the wrapper's own text would show the formula twice, so it
      // stays dropped exactly as before; the wrapper is the atom when a rule
      // says so. Native <math> also never reaches getComputedStyle, which
      // some environments refuse for MathML.
      const { preserveTextSelector } = getEffectiveSiteRule(config, window.location.href)
      if (preserveTextSelector !== null && element.parentElement?.closest(preserveTextSelector)) {
        return ""
      }
    } else if (isDontWalkIntoAndDontTranslateAsChildElement(element, config)) {
      // Hidden or site-excluded atoms keep today's behavior (dropped).
      return ""
    }
    if (!isRenderableInlineAtom(element)) return ""
    atoms.push(element)
    return ATOM_SENTINEL
  }

  const replaceLink = (element: HTMLAnchorElement): string => {
    // Links never nest in a valid document; a script-built nested anchor's
    // words simply join the outer link.
    insideLink = true
    let inner = ""
    try {
      for (const child of element.childNodes) {
        if (isTextNode(child) || isHTMLElement(child)) {
          inner += extractTextContent(child, config, { replaceElement })
        }
      }
    } finally {
      insideLink = false
    }
    const words = inner.trim()
    // An image-only or empty link has no words to carry.
    if (words === "") return inner
    links.push(element)
    const leading = LEADING_WHITESPACE_RE.exec(inner)?.[0] ?? ""
    const trailing = TRAILING_WHITESPACE_RE.exec(inner)?.[0] ?? ""
    return `${leading}${LINK_OPEN_SENTINEL}${words}${LINK_CLOSE_SENTINEL}${trailing}`
  }

  const replaceElement = (element: HTMLElement): string | undefined => {
    if (isInlineAtomElement(element, config)) return replaceAtom(element)
    if (
      options.preserveLinks &&
      !insideLink &&
      isPreservableLink(element) &&
      !isDontWalkIntoAndDontTranslateAsChildElement(element, config)
    ) {
      return replaceLink(element)
    }
    return undefined
  }

  let raw = nodes.map((node) => extractTextContent(node, config, { replaceElement })).join("")

  if (links.length > 0) {
    const prose = raw.replace(LINK_SENTINEL_RE, "")
    if (
      countOccurrences(raw, LINK_OPEN_SENTINEL) !== links.length ||
      countOccurrences(raw, LINK_CLOSE_SENTINEL) !== links.length ||
      containsLinkMarkerLiteral(prose)
    ) {
      // The page text itself contains a link sentinel or a marker-shaped
      // literal, so markers could not be told apart from it. Send the
      // paragraph without links rather than guess.
      return extractInlineAtomText(nodes, config, { ...options, preserveLinks: false })
    }
    let nextLink = 0
    raw = raw.replace(LINK_SENTINEL_RE, (sentinel) =>
      sentinel === LINK_OPEN_SENTINEL
        ? encodeLinkOpenMarker(nextLink)
        : encodeLinkCloseMarker(nextLink++),
    )
  }

  if (atoms.length === 0) {
    const filterText = links.length > 0 ? stripOwnLinkMarkers(raw, links.length) : raw
    return {
      filterText,
      requestText: raw,
      atoms,
      baseIndex: 0,
      hasProse: PROSE_RE.test(filterText),
      links,
    }
  }

  const sentinelCount = raw.split(ATOM_SENTINEL).length - 1
  if (sentinelCount !== atoms.length) {
    // The page text itself contains U+FFFC, so atoms cannot be told apart from
    // it. Fall back to the legacy string rather than guess.
    const legacy = nodes.map((node) => extractTextContent(node, config)).join("")
    return {
      filterText: legacy,
      requestText: legacy,
      atoms: [],
      baseIndex: 0,
      hasProse: PROSE_RE.test(legacy),
      links: [],
    }
  }

  const filterText = stripOwnLinkMarkers(raw.replace(ATOM_SENTINEL_RE, ""), links.length)
  const baseIndex = nextFreeInlineAtomIndex(filterText)
  let nextIndex = baseIndex
  const requestText = raw.replace(ATOM_SENTINEL_RE, () => encodeInlineAtomToken(nextIndex++))

  return {
    filterText,
    requestText,
    atoms,
    baseIndex,
    hasProse: PROSE_RE.test(filterText),
    links,
  }
}

/** Remove the `<aN>` / `</aN>` markers this extraction issued (N < linkCount). */
function stripOwnLinkMarkers(text: string, linkCount: number): string {
  if (linkCount === 0) return text
  return text.replace(/<\/?a(\d+)>/g, (marker, index: string) =>
    Number.parseInt(index, 10) < linkCount ? "" : marker,
  )
}

// Subtrees a clone must not carry: executable or resource-loading elements,
// and the hidden accessible copies every renderer ships next to its visible
// output (they would double the clone's text and, for MathJax, invite a
// second typeset). `<semantics>` renders its first child, so dropping the
// annotations keeps native MathML intact.
const REMOVED_DESCENDANT_SELECTOR = [
  "script",
  "noscript",
  "template",
  "style",
  "link",
  "meta",
  "iframe",
  "object",
  "embed",
  "mjx-assistive-mml",
  ".MJX_Assistive_MathML",
  ".katex-mathml",
  "annotation",
  "annotation-xml",
].join(",")

const REMOVED_ATTRIBUTE_NAMES = new Set([
  "id",
  "tabindex",
  "contenteditable",
  "draggable",
  "srcdoc",
  "aria-labelledby",
  "aria-describedby",
  ...MARK_ATTRIBUTES,
])

const URL_ATTRIBUTE_NAMES = new Set(["href", "xlink:href", "src", "action", "formaction", "data"])
const UNSAFE_URL_RE = /^\s*(?:javascript:|data:text\/html)/i

// Classes every MathJax generation and its preprocessors honor as "leave this
// subtree alone", so a page-side typesetter never re-renders our clone.
const TYPESET_IGNORE_CLASSES = [
  "mathjax_ignore",
  "tex2jax_ignore",
  "mml2jax_ignore",
  "asciimath2jax_ignore",
]

let cloneSequence = 0

/**
 * Deep-clone an atom for insertion into a translated span. Keeps everything
 * the renderer's CSS depends on (classes, inline styles, `<img src>`, SVG
 * `<use xlink:href>`), drops ids and anything executable, and marks the root
 * so the preset stylesheet, MathJax and assistive technology all leave it
 * alone. The source element is never touched.
 */
export function sanitizeInlineAtomClone(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement

  for (const removed of [...clone.querySelectorAll(REMOVED_DESCENDANT_SELECTOR)]) {
    removed.remove()
  }

  const elements: Element[] = [clone, ...clone.querySelectorAll("*")]

  // MathJax SVG output with a local font cache references `<defs>` inside the
  // same formula by id. Those references must keep resolving inside the clone,
  // so referenced ids are renamed (unique per clone) instead of stripped.
  const idOwners = new Map<string, Element>()
  for (const element of elements) {
    const id = element.getAttribute("id")
    if (id && !idOwners.has(id)) idOwners.set(id, element)
  }
  const renamedIds = new Map<string, string>()
  for (const element of elements) {
    for (const name of ["href", "xlink:href"]) {
      const value = element.getAttribute(name)
      if (!value?.startsWith("#")) continue
      const id = value.slice(1)
      if (idOwners.has(id) && !renamedIds.has(id)) {
        cloneSequence += 1
        renamedIds.set(id, `${id}-rf-atom-${cloneSequence}`)
      }
    }
  }

  for (const element of elements) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      if (name === "id") {
        const renamed = renamedIds.get(attribute.value)
        if (renamed) {
          element.setAttribute("id", renamed)
        } else {
          element.removeAttributeNode(attribute)
        }
        continue
      }
      if (REMOVED_ATTRIBUTE_NAMES.has(name) || name.startsWith("on")) {
        element.removeAttributeNode(attribute)
        continue
      }
      if (URL_ATTRIBUTE_NAMES.has(name)) {
        if (UNSAFE_URL_RE.test(attribute.value)) {
          element.removeAttributeNode(attribute)
        } else if (attribute.value.startsWith("#")) {
          const renamed = renamedIds.get(attribute.value.slice(1))
          if (renamed) element.setAttribute(attribute.name, `#${renamed}`)
        }
      }
    }
  }

  clone.classList.add(INLINE_ATOM_CLASS, ...TYPESET_IGNORE_CLASSES)
  clone.setAttribute("translate", "no")
  // The original formula directly above stays the accessible copy.
  clone.setAttribute("aria-hidden", "true")
  clone.setAttribute("role", "presentation")
  // Math renders left-to-right even inside an RTL translation.
  if (!clone.hasAttribute("dir")) clone.setAttribute("dir", "ltr")
  return clone
}

// Anchor attributes worth carrying into the translation's copy of a link:
// where it goes and how it opens, plus `class` so the page's link styling
// (color, underline, external-link icons) applies to the translated words.
const COPIED_LINK_ATTRIBUTE_NAMES = [
  "target",
  "rel",
  "title",
  "class",
  "hreflang",
  "referrerpolicy",
]

/**
 * A fresh anchor for translated words, copied from a source link. Never a
 * clone: the source's children are the original words, and its ids, event
 * attributes and data hooks belong to the page. `href` is the resolved URL,
 * so a relative link keeps pointing at the same place.
 */
export function createTranslatedLink(source: HTMLAnchorElement, ownerDoc: Document): HTMLElement {
  const link = ownerDoc.createElement("a")
  link.setAttribute("href", source.href)
  for (const name of COPIED_LINK_ATTRIBUTE_NAMES) {
    const value = source.getAttribute(name)
    if (value !== null) link.setAttribute(name, value)
  }
  return link
}

/**
 * Rebuild the translated span from the provider's text: literal runs become
 * text nodes and every placeholder becomes a clone of its atom, in the order
 * the target language put them. Tolerates what providers do to placeholders:
 * a repeated index renders once (first wins), an index we never issued stays
 * as literal text (never eat page content), and atoms whose placeholder was
 * dropped are appended after the text so the formula is never lost.
 *
 * Words the provider returned inside a `<aN>…</aN>` pair are wrapped in a copy
 * of source link N. With `renderLinks: false` (the translation itself sits
 * inside a link) or a broken pair, the markers are dropped and the words stay.
 */
export function renderInlineAtomTranslation(
  container: HTMLElement,
  translatedText: string,
  extraction: Pick<InlineAtomExtraction, "atoms" | "baseIndex"> &
    Partial<Pick<InlineAtomExtraction, "links">>,
  options: { renderLinks?: boolean } = {},
): void {
  const { atoms, baseIndex } = extraction
  const links = extraction.links ?? []
  const renderLinks = options.renderLinks ?? true
  const ownerDoc = container.ownerDocument
  const fragment = ownerDoc.createDocumentFragment()
  const inserted = new Set<number>()

  const appendText = (target: Node, text: string) => {
    for (const part of decodeInlineAtomTokens(text)) {
      if (part.kind === "text") {
        target.appendChild(ownerDoc.createTextNode(part.text))
        continue
      }
      const atomIndex = part.index - baseIndex
      const source = atomIndex >= 0 && atomIndex < atoms.length ? atoms[atomIndex] : undefined
      if (!source) {
        target.appendChild(ownerDoc.createTextNode(part.raw))
        continue
      }
      if (inserted.has(atomIndex)) continue
      inserted.add(atomIndex)
      target.appendChild(sanitizeInlineAtomClone(source))
    }
  }

  const segments =
    links.length > 0
      ? decodeLinkMarkers(translatedText, links.length)
      : [{ text: translatedText, linkIndex: null }]
  for (const segment of segments) {
    const source = segment.linkIndex === null ? undefined : links[segment.linkIndex]
    if (!renderLinks || !source) {
      appendText(fragment, segment.text)
      continue
    }
    const link = createTranslatedLink(source, ownerDoc)
    appendText(link, segment.text)
    fragment.append(link)
  }

  const missing = atoms.map((_, index) => index).filter((index) => !inserted.has(index))
  if (missing.length > 0) {
    logger.warn(
      `[inline-atoms] translation dropped ${missing.length} placeholder(s); appending the formulas`,
    )
    for (const index of missing) {
      fragment.append(ownerDoc.createTextNode(" "))
      fragment.append(sanitizeInlineAtomClone(atoms[index]!))
    }
  }

  container.replaceChildren(fragment)
}

/** Every element `isInlineAtomElement` accepts: native MathML plus the site-rule atoms. */
export function getInlineAtomSelector(config: Config): string {
  const { atomSelector } = getEffectiveSiteRule(config, window.location.href)
  return atomSelector ? `math,${atomSelector}` : "math"
}

/**
 * Whether `root` holds a renderable atom that is host content (clones inside
 * our own wrappers never count). Used to keep atom-bearing containers off the
 * virtual-paragraph path, whose unit texts cannot carry placeholders.
 */
export function containsInlineAtomOutsideWrappers(root: HTMLElement, config: Config): boolean {
  for (const element of root.querySelectorAll<HTMLElement>(getInlineAtomSelector(config))) {
    if (element.closest(`.${CONTENT_WRAPPER_CLASS}`) !== null) continue
    if (isRenderableInlineAtom(element)) return true
  }
  return false
}

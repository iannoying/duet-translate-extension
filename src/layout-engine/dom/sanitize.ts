import type { DOMPurify as DOMPurifyInstance, WindowLike } from "dompurify"
import DOMPurify from "dompurify"
import { LAYOUT_MAX_ELEMENTS } from "../contract"
import { sanitizeCss } from "../core/css"

/**
 * Turns a layout's rendered markup into DOM that can do nothing but show
 * things: no scripts or event handlers, no forms, frames or ids, nothing that
 * loads a resource. Links must be http(s) and open in a new tab; images must
 * be `data:image/…` URIs. Reports what it took out, so the editor can say so.
 */

const HTML_TAGS = [
  "a",
  "abbr",
  "article",
  "aside",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "br",
  "button",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "main",
  "mark",
  "nav",
  "ol",
  "p",
  "pre",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
  "wbr",
]

const SVG_TAGS = [
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "title",
]

const ATTRIBUTES = [
  "class",
  "style",
  "title",
  "lang",
  "dir",
  "role",
  "hidden",
  "open",
  "tabindex",
  "type",
  "colspan",
  "rowspan",
  "scope",
  "headers",
  "span",
  "start",
  "reversed",
  "value",
  "datetime",
  "cite",
  "width",
  "height",
  "href",
  "src",
  "alt",
  // SVG presentation
  "viewbox",
  "xmlns",
  "fill",
  "fill-opacity",
  "fill-rule",
  "clip-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "opacity",
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "points",
  "transform",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientunits",
  "gradienttransform",
  "preserveaspectratio",
  "focusable",
]

const DOCUMENT_TAGS = new Set(["html", "head", "body"])

const HTTP_URL = /^https?:\/\//i
const DATA_IMAGE = /^data:image\//i

export interface SanitizedLayout {
  fragment: DocumentFragment
  // What was taken out: `<script>`, `onclick`, `id`, `href`…
  removed: string[]
}

export class LayoutElementLimitError extends Error {
  override name = "LayoutElementLimitError"
}

const purifiers = new WeakMap<Window, DOMPurifyInstance>()

function getPurifier(view: Window): DOMPurifyInstance {
  let purifier = purifiers.get(view)
  if (!purifier) {
    purifier = DOMPurify(view as unknown as WindowLike)
    purifiers.set(view, purifier)
  }
  return purifier
}

function describeRemoval(entry: { element?: Node; attribute?: Attr | null }): string | null {
  if (entry.attribute) return entry.attribute.name
  const element = entry.element
  // The document wrapper the parser builds around the markup is not the layout's.
  if (element?.nodeType === 1 && !DOCUMENT_TAGS.has((element as Element).localName)) {
    return `<${(element as Element).localName}>`
  }
  // Comments and stray text are not worth a word.
  return null
}

export function sanitizeLayoutHtml(html: string, view: Window = window): SanitizedLayout {
  const purifier = getPurifier(view)
  const removed = new Set<string>()
  const fragment = purifier.sanitize(html, {
    ALLOWED_TAGS: [...HTML_TAGS, ...SVG_TAGS],
    ALLOWED_ATTR: ATTRIBUTES,
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: true,
    // DOMPurify's own URI check runs on every attribute value; href and src
    // get the stricter checks below.
    KEEP_CONTENT: true,
    RETURN_DOM_FRAGMENT: true,
    SANITIZE_DOM: true,
  })
  for (const entry of purifier.removed as Array<{ element?: Node; attribute?: Attr | null }>) {
    const label = describeRemoval(entry)
    if (label) removed.add(label)
  }

  let elements = 0
  for (const element of fragment.querySelectorAll("*")) {
    elements++
    const name = element.localName
    if (name === "a") {
      const href = element.getAttribute("href")
      if (href !== null && !HTTP_URL.test(href.trim())) {
        element.removeAttribute("href")
        removed.add("href")
      }
      element.setAttribute("target", "_blank")
      element.setAttribute("rel", "noopener noreferrer")
    } else if (element.hasAttribute("href")) {
      element.removeAttribute("href")
      removed.add("href")
    }
    if (name === "img") {
      const src = element.getAttribute("src")
      if (src === null || !DATA_IMAGE.test(src.trim())) {
        element.remove()
        removed.add("<img>")
        continue
      }
    } else if (element.hasAttribute("src")) {
      element.removeAttribute("src")
      removed.add("src")
    }
    const style = element.getAttribute("style")
    if (style !== null) {
      const clean = sanitizeCss(style)
      if (clean.removed.length > 0) {
        element.setAttribute("style", clean.css)
        for (const what of clean.removed) removed.add(what)
      }
    }
  }
  if (elements > LAYOUT_MAX_ELEMENTS) {
    throw new LayoutElementLimitError(
      `The layout rendered more than ${LAYOUT_MAX_ELEMENTS.toLocaleString("en")} elements.`,
    )
  }
  return { fragment, removed: [...removed] }
}

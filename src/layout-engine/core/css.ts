/**
 * A layout's `<style>` blocks: split from the markup before Liquid runs (they
 * always apply, wherever they sit, and Liquid never runs inside them), and
 * cleaned of anything that would load a resource from outside.
 */

export interface StyleBlock {
  // Offsets of the whole `<style>…</style>` element in the source.
  from: number
  to: number
  // Offsets of its content.
  contentFrom: number
  contentTo: number
  content: string
}

const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi

export function findStyleBlocks(source: string): StyleBlock[] {
  const blocks: StyleBlock[] = []
  for (const match of source.matchAll(STYLE_BLOCK)) {
    const from = match.index
    const content = match[1] ?? ""
    const contentFrom = from + match[0].indexOf(">") + 1
    blocks.push({
      from,
      to: from + match[0].length,
      contentFrom,
      contentTo: contentFrom + content.length,
      content,
    })
  }
  return blocks
}

// The source with its style blocks cut out, and their CSS joined.
export function splitStyles(source: string): { markup: string; css: string } {
  const blocks = findStyleBlocks(source)
  let markup = ""
  let position = 0
  for (const block of blocks) {
    markup += source.slice(position, block.from)
    position = block.to
  }
  markup += source.slice(position)
  return { markup, css: blocks.map((block) => block.content).join("\n") }
}

export type CssRemoval = "@import" | "@font-face" | "url()"

// An at-rule up to its end: a `;`, or its `{…}` block (nested braces included).
function atRuleEnd(css: string, from: number): number {
  let depth = 0
  for (let i = from; i < css.length; i++) {
    const char = css[i]
    if (char === "{") depth++
    else if (char === "}") {
      depth--
      if (depth <= 0) return i + 1
    } else if (char === ";" && depth === 0) return i + 1
  }
  return css.length
}

const URL_FUNCTION = /url\(\s*(['"]?)([\s\S]*?)\1\s*\)/gi
const DATA_URI = /^data:/i

/**
 * The CSS without `@import`, `@font-face` and `url()`s other than `data:`
 * URIs, and what was taken out. `image-set()` and the like only load through
 * `url()` or a bare string, so bare strings in them go too.
 */
export function sanitizeCss(css: string): { css: string; removed: CssRemoval[] } {
  const removed = new Set<CssRemoval>()
  let out = ""
  let position = 0
  const atRule = /@(import|font-face)\b/gi
  for (let match = atRule.exec(css); match; match = atRule.exec(css)) {
    out += css.slice(position, match.index)
    const end = atRuleEnd(css, match.index)
    removed.add(match[1]!.toLowerCase() === "import" ? "@import" : "@font-face")
    position = end
    atRule.lastIndex = end
  }
  out += css.slice(position)

  out = out.replace(URL_FUNCTION, (whole, _quote: string, target: string) => {
    if (DATA_URI.test(target.trim())) return whole
    removed.add("url()")
    return "none"
  })
  out = out.replace(/image-set\(([^)]*)\)/gi, (whole, inner: string) => {
    const strings = [...inner.matchAll(/(["'])([\s\S]*?)\1/g)].map((match) => match[2]!.trim())
    if (strings.some((target) => !DATA_URI.test(target))) {
      removed.add("url()")
      return "none"
    }
    return whole
  })
  return { css: out, removed: [...removed] }
}

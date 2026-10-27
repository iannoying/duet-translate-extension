import { z } from "zod"
import {
  EN_NAMES,
  ISO6391_OF,
  LANG_CODES_ISO6391,
  LANG_CODES_ISO6393,
  NATIVE_NAMES,
} from "./language-data"

/**
 * The languages the extension translates between, by ISO 639-3 code (with
 * `cmn-Hant` for Traditional Chinese), and their ISO 639-1 / BCP 47 tags.
 */

export const langCodeISO6393Schema = z.enum(LANG_CODES_ISO6393)
export type LangCodeISO6393 = z.infer<typeof langCodeISO6393Schema>
export const LANG_CODE_ISO6393_OPTIONS = langCodeISO6393Schema.options

export const langCodeISO6391Schema = z.enum(LANG_CODES_ISO6391)
export type LangCodeISO6391 = z.infer<typeof langCodeISO6391Schema>
export const LANG_CODE_ISO6391_OPTIONS = langCodeISO6391Schema.options

// The language's English name, as prompts name it.
export const LANG_CODE_TO_EN_NAME: Readonly<Record<LangCodeISO6393, string>> = EN_NAMES

// The language's name in itself.
export const LANG_CODE_TO_LOCALE_NAME: Readonly<Record<LangCodeISO6393, string>> = NATIVE_NAMES

// The language's ISO 639-1 tag, where it has one.
export const ISO6393_TO_6391: Readonly<Record<LangCodeISO6393, LangCodeISO6391 | undefined>> =
  ISO6391_OF

/**
 * The language a tag means, for each ISO 639-1 tag: the first listed
 * language with that tag (`zh` is Mandarin, not Cantonese), and `zh-TW` is
 * Traditional Chinese.
 */
export const LOCALE_TO_ISO6393: Readonly<Partial<Record<LangCodeISO6391, LangCodeISO6393>>> =
  (() => {
    const byTag: Partial<Record<LangCodeISO6391, LangCodeISO6393>> = {}
    for (const code of LANG_CODE_ISO6393_OPTIONS) {
      const tag = ISO6393_TO_6391[code]
      if (tag && byTag[tag] === undefined) byTag[tag] = code
    }
    return byTag
  })()

export const RTL_LANG_CODES: readonly LangCodeISO6393[] = [
  "arb",
  "urd",
  "pes",
  "prs",
  "pbu",
  "heb",
  "ydd",
  "uig",
  "snd",
  "div",
  "ckb",
  "skr",
]

export const langLevel = z.enum(["beginner", "intermediate", "advanced"])
export type LangLevel = z.infer<typeof langLevel>

const CODE_BY_LOWERCASE = new Map<string, LangCodeISO6393>(
  LANG_CODE_ISO6393_OPTIONS.map((code) => [code.toLowerCase(), code]),
)
const TRADITIONAL_CHINESE_SUBTAGS = new Set(["hant", "tw", "hk", "mo"])

/**
 * The language a BCP 47 tag names (`es-ES`, `zh-TW`, `cmn-Hant`, `yue`), for
 * picking a voice; undefined for a tag naming no supported language.
 */
export function speechLanguageFromTag(tag: string | undefined): LangCodeISO6393 | undefined {
  const normalized = tag?.trim().replaceAll("_", "-").toLowerCase()
  if (!normalized) return undefined

  const exact = CODE_BY_LOWERCASE.get(normalized)
  if (exact) return exact

  const [primary = "", ...subtags] = normalized.split("-")
  if (primary === "zh" || primary === "cmn") {
    if (subtags.includes("yue")) return "yue"
    return subtags.some((subtag) => TRADITIONAL_CHINESE_SUBTAGS.has(subtag)) ? "cmn-Hant" : "cmn"
  }
  return (
    CODE_BY_LOWERCASE.get(primary) ?? LOCALE_TO_ISO6393[primary as LangCodeISO6391] ?? undefined
  )
}

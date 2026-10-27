/**
 * The values the built-in cards know how to show. The built-in prompts list
 * exactly these (tests hold them together), and the cards' words for them
 * come from the host, in the reader's language.
 */

// What a span is in its clause.
export const SENTENCE_ANALYSIS_ROLES = [
  "subject",
  "predicate",
  "object",
  "complement",
  "attributive",
  "adverbial",
  "appositive",
  "connector",
] as const

// The names a clause goes by: its role, or plain "clause" for any other.
export const SENTENCE_ANALYSIS_CLAUSE_KINDS = [
  "subject",
  "object",
  "complement",
  "attributive",
  "adverbial",
  "appositive",
  "clause",
] as const

// Non-finite phrases; `form: "clause"` marks a clause.
export const SENTENCE_ANALYSIS_FORMS = [
  "infinitive",
  "gerund",
  "present-participle",
  "past-participle",
] as const

// What an adverbial clause or phrase tells.
export const SENTENCE_ANALYSIS_SENSES = [
  "time",
  "place",
  "cause",
  "condition",
  "concession",
  "purpose",
  "result",
  "manner",
  "comparison",
] as const

// Structures learners stumble on.
export const SENTENCE_ANALYSIS_OBSTACLES = [
  "inversion",
  "fronting",
  "ellipsis",
  "passive",
  "subjunctive",
  "parenthesis",
  "dummy-it",
  "postponed-subject",
  "cleft",
  "comparison",
  "negation",
  "split",
  "idiom",
] as const

export type SentenceAnalysisRole = (typeof SENTENCE_ANALYSIS_ROLES)[number]
export type SentenceAnalysisClauseKind = (typeof SENTENCE_ANALYSIS_CLAUSE_KINDS)[number]
export type SentenceAnalysisForm = (typeof SENTENCE_ANALYSIS_FORMS)[number]
export type SentenceAnalysisSense = (typeof SENTENCE_ANALYSIS_SENSES)[number]
export type SentenceAnalysisObstacle = (typeof SENTENCE_ANALYSIS_OBSTACLES)[number]

// Improve Writing marks, by tier: wrong in any setting, not what a native
// writer would write in this one, and worth keeping.
export const IMPROVE_WRITING_TIERS = {
  error: ["spelling", "grammar", "punctuation", "word-choice", "logic"],
  awkward: ["unnatural", "register", "clarity"],
  good: ["good"],
} as const

export const IMPROVE_WRITING_TYPES = [
  ...IMPROVE_WRITING_TIERS.error,
  ...IMPROVE_WRITING_TIERS.awkward,
  ...IMPROVE_WRITING_TIERS.good,
] as const

export type ImproveWritingType = (typeof IMPROVE_WRITING_TYPES)[number]
export type ImproveWritingTier = keyof typeof IMPROVE_WRITING_TIERS

// The words the sentence analysis card shows, which the host puts in ctx.
export interface SentenceAnalysisLayoutLabels {
  roles: Record<SentenceAnalysisRole, string>
  clauses: Record<SentenceAnalysisClauseKind, string>
  adverbialClauses: Record<SentenceAnalysisSense, string>
  forms: Record<SentenceAnalysisForm, string>
  senses: Record<SentenceAnalysisSense, string>
  obstacles: Record<SentenceAnalysisObstacle, string>
  // Before a restored clause: "Plain order:".
  restore: string
  // The toggles: hard spots only, the sentence's skeleton, phrase breaks.
  hard: string
  trunk: string
  slashes: string
}

// The words the Improve Writing card shows.
export interface ImproveWritingLayoutLabels {
  types: Record<ImproveWritingType, string>
  tiers: Record<ImproveWritingTier, string>
  hideFixes: string
  hiddenHint: string
  showImproved: string
  improved: string
  copy: string
  unchanged: string
  // Read in place of an empty fix: the span is deleted.
  remove: string
}

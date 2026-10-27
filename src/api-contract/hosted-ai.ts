import { z } from "zod"

/**
 * The built-in AI: model calls the backend makes on the user's behalf and
 * bills against their plan's credit. Each feature has its own procedures, so
 * the backend knows what it bills from the route.
 */

export const HostedAiFeatureSchema = z.enum([
  "pageTranslation",
  "selectionTranslation",
  "inputTranslation",
  "videoSubtitles",
  "languageDetection",
  "customAction",
  "noteSuggestion",
])
export type HostedAiFeature = z.infer<typeof HostedAiFeatureSchema>

// "normal" is in every plan; "advance" is the stronger model.
export const HostedAiModelTierSchema = z.enum(["normal", "advance"])
export type HostedAiModelTier = z.infer<typeof HostedAiModelTierSchema>

// The plan that would unlock what the user cannot use.
export const HostedAiUpgradePlanSchema = z.enum(["pro", "ultra"])
export type HostedAiUpgradePlan = z.infer<typeof HostedAiUpgradePlanSchema>

export const HostedAiUnavailableReasonSchema = z.enum([
  "authentication_required",
  "pro_required",
  "ultra_required",
  "quota_exhausted",
  "service_unavailable",
])
export type HostedAiUnavailableReason = z.infer<typeof HostedAiUnavailableReasonSchema>

// ---- Status ----------------------------------------------------------------

export const HostedAiTierStatusSchema = z.object({
  // The plan allows this tier.
  accessAllowed: z.boolean(),
  // A call would be served now (allowed, credit left, service up).
  available: z.boolean(),
  unavailableReason: HostedAiUnavailableReasonSchema.nullable(),
  upgradeTo: HostedAiUpgradePlanSchema.nullable(),
  requiresUltra: z.boolean(),
  // Which model serves the tier, so a client can tell when it changed.
  modelRevision: z.string(),
})
export type HostedAiTierStatus = z.infer<typeof HostedAiTierStatusSchema>

export const HostedAiCreditPeriodKindSchema = z.enum(["daily", "weekly", "once"])
export type HostedAiCreditPeriodKind = z.infer<typeof HostedAiCreditPeriodKindSchema>

// Credit that refills every period. A percentage, never an amount.
export const HostedAiRecurringCreditStatusSchema = z.object({
  periodKind: z.enum(["daily", "weekly"]),
  usedPercent: z.number().min(0),
  // Null while the period has not started.
  resetAt: z.iso.datetime().nullable(),
  // The features this pool pays for.
  features: z.array(HostedAiFeatureSchema),
})
export type HostedAiRecurringCreditStatus = z.infer<typeof HostedAiRecurringCreditStatusSchema>

// A grant that never refills, used after the recurring pools.
export const HostedAiOneTimeCreditStatusSchema = z.object({
  periodKind: z.literal("once"),
  usedPercent: z.number().min(0),
  expiresAt: z.iso.datetime(),
  features: z.array(HostedAiFeatureSchema),
})
export type HostedAiOneTimeCreditStatus = z.infer<typeof HostedAiOneTimeCreditStatusSchema>

export const HostedAiCreditPoolStatusSchema = z.discriminatedUnion("periodKind", [
  HostedAiRecurringCreditStatusSchema,
  HostedAiOneTimeCreditStatusSchema,
])
export type HostedAiCreditPoolStatus = z.infer<typeof HostedAiCreditPoolStatusSchema>

export const HostedAiStatusOutputSchema = z.object({
  // The recurring pools; kept for clients older than `pools`.
  credits: z.array(HostedAiRecurringCreditStatusSchema),
  // Every pool, in the order they are spent.
  pools: z.array(HostedAiCreditPoolStatusSchema),
  features: z.record(
    HostedAiFeatureSchema,
    z.record(HostedAiModelTierSchema, HostedAiTierStatusSchema),
  ),
})
export type HostedAiStatusOutput = z.infer<typeof HostedAiStatusOutputSchema>

// ---- Generation inputs -----------------------------------------------------

const nonBlankString = z.string().refine((value) => value.trim().length > 0, "Must not be blank")

const generationInput = {
  instructions: nonBlankString.optional(),
  prompt: nonBlankString,
  temperature: z.number().min(0).max(2).optional(),
  modelTier: HostedAiModelTierSchema.default("normal"),
  // Lets the backend recognize a retried request.
  requestId: z.uuid().optional(),
}

export const HostedAiStreamTextInputSchema = z.object(generationInput)
export type HostedAiStreamTextInput = z.input<typeof HostedAiStreamTextInputSchema>

export const HostedAiOutputFieldTypeSchema = z.enum(["string", "number"])
export type HostedAiOutputFieldType = z.infer<typeof HostedAiOutputFieldTypeSchema>

export const HOSTED_AI_MAX_OUTPUT_FIELDS = 30
export const HOSTED_AI_MAX_OUTPUT_FIELD_NAME_LENGTH = 100

// A custom action's answer: an object with one value per field.
export const HostedAiStreamStructuredObjectInputSchema = z.object({
  ...generationInput,
  outputSchema: z
    .array(
      z.object({
        name: nonBlankString.max(HOSTED_AI_MAX_OUTPUT_FIELD_NAME_LENGTH),
        type: HostedAiOutputFieldTypeSchema,
      }),
    )
    .min(1)
    .max(HOSTED_AI_MAX_OUTPUT_FIELDS),
})
export type HostedAiStreamStructuredObjectInput = z.input<
  typeof HostedAiStreamStructuredObjectInputSchema
>

export const HOSTED_AI_NOTE_SUGGESTION_MAX_NOTES = 2

export const HostedAiNoteSuggestionStreamInputSchema = z.object({
  ...generationInput,
  instructions: nonBlankString,
})
export type HostedAiNoteSuggestionStreamInput = z.input<
  typeof HostedAiNoteSuggestionStreamInputSchema
>

// The object a note suggestion streams.
export const HostedAiNoteSuggestionObjectSchema = z.object({
  action: z.object({
    // Reserved for suggesting a new dictionary action; the extension ignores it.
    createNewDictionaryAction: z.boolean(),
    targetActionId: z.string().nullable(),
    // The field whose value explains the term in one line.
    summaryFieldName: z.string().nullable(),
  }),
  notes: z
    .array(
      z.object({
        fields: z.array(
          z.object({
            name: z.string(),
            value: z.union([z.string(), z.number()]).nullable(),
          }),
        ),
      }),
    )
    .max(HOSTED_AI_NOTE_SUGGESTION_MAX_NOTES),
})
export type HostedAiNoteSuggestionObject = z.infer<typeof HostedAiNoteSuggestionObjectSchema>

/**
 * One part of a generation stream, as the AI SDK's `fullStream` yields it:
 * `start`, `text-delta` (`text`), `reasoning-start` / `reasoning-delta` /
 * `reasoning-end`, `error`, and `finish` with its `finishReason`. Parts are
 * passed through as they are.
 */
export const HostedAiStreamPartSchema = z.looseObject({ type: z.string() })
export type HostedAiStreamPart = z.infer<typeof HostedAiStreamPartSchema>

// ---- Error data ------------------------------------------------------------

// TOO_MANY_REQUESTS: a short-term limit; the call can be retried after the pause.
export const HostedAiRateLimitErrorDataSchema = z.object({
  quotaScope: z.enum(["guest", "user"]),
  retryAfterMs: z.number().int().min(0),
})
export type HostedAiRateLimitErrorData = z.infer<typeof HostedAiRateLimitErrorDataSchema>

// HOSTED_AI_QUOTA_EXHAUSTED: the period's credit is spent.
export const HostedAiQuotaExhaustedDataSchema = z.object({
  modelTier: HostedAiModelTierSchema,
  // The credit policy that ran out, such as "ultra-weekly-v1".
  policyId: z.string(),
  usedPercent: z.number(),
  resetAt: z.iso.datetime().nullable(),
})
export type HostedAiQuotaExhaustedData = z.infer<typeof HostedAiQuotaExhaustedDataSchema>

// HOSTED_AI_TIER_RESTRICTED: the plan does not include the tier.
export const HostedAiTierRestrictedDataSchema = z.object({
  upgradeTo: HostedAiUpgradePlanSchema,
})
export type HostedAiTierRestrictedData = z.infer<typeof HostedAiTierRestrictedDataSchema>

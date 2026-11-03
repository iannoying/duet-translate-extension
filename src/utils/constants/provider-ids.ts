import { HOSTED_AI_MODELS, type HostedAiModelId } from "@/api-contract/hosted-ai"

// Re-exported from the contract so a model added server-side surfaces here.
export type { HostedAiModelId } from "@/api-contract/hosted-ai"

// Keep the persisted provider IDs stable so existing user configurations
// continue to work: the first two built-in providers predate model choice and
// now run GPT-6.1 Terra and Claude Sonnet 5.5.
export const BUILT_IN_AI_PROVIDER_ID = "read-frog-free-ai"
export const BUILT_IN_AI_ADVANCE_PROVIDER_ID = "read-frog-advance-ai"

const LEGACY_PROVIDER_IDS = {
  "gpt-6.1-terra": BUILT_IN_AI_PROVIDER_ID,
  "claude-sonnet-5-5": BUILT_IN_AI_ADVANCE_PROVIDER_ID,
} as const

type LegacyModelId = keyof typeof LEGACY_PROVIDER_IDS

/** One built-in provider per hosted model. */
export type BuiltInAiProviderId =
  | (typeof LEGACY_PROVIDER_IDS)[LegacyModelId]
  | `duet-ai-${Exclude<HostedAiModelId, LegacyModelId>}`

export function getBuiltInAiProviderIdForModel(model: HostedAiModelId): BuiltInAiProviderId {
  return model in LEGACY_PROVIDER_IDS
    ? LEGACY_PROVIDER_IDS[model as LegacyModelId]
    : (`duet-ai-${model}` as BuiltInAiProviderId)
}

/** In HOSTED_AI_MODELS order: the Pro models, then the Max ones. */
export const BUILT_IN_AI_PROVIDER_IDS = HOSTED_AI_MODELS.map((model) =>
  getBuiltInAiProviderIdForModel(model.id),
) as [BuiltInAiProviderId, ...BuiltInAiProviderId[]]

import type { ProviderConfig, ProvidersConfig } from "@/types/config/provider"
import type { Theme } from "@/types/config/theme"
import type { FeatureKey } from "@/utils/constants/feature-providers"
import type {
  ProviderSelectorOption,
  SystemProviderSelectorItem,
} from "@/utils/providers/provider-display"
import { HOSTED_AI_MODELS, type HostedAiModelInfo } from "@/api-contract/hosted-ai"
import { isLLMProviderConfig, isTranslateProviderConfig } from "@/types/config/provider"
import {
  BUILT_IN_AI_PROVIDER_IDS,
  type BuiltInAiProviderId,
  getBuiltInAiProviderIdForModel,
  type HostedAiModelId,
} from "@/utils/constants/provider-ids"
import { getLobeIconsCDNUrlFn } from "@/utils/logo"

export {
  BUILT_IN_AI_PROVIDER_ID,
  BUILT_IN_AI_ADVANCE_PROVIDER_ID,
} from "@/utils/constants/provider-ids"

export type ProviderCapability = FeatureKey | "customAction" | "languageDetection"
type ProviderConfigPredicate<T extends ProviderConfig = ProviderConfig> = (
  provider: ProviderConfig,
) => provider is T

interface SystemProviderDef {
  id: BuiltInAiProviderId
  hostedModel: HostedAiModelId
  name: string
  vendor: string
  // The cheapest plan that includes the model ("ultra" is sold as Max).
  plan: HostedAiModelInfo["plan"]
  capabilities: readonly ProviderCapability[]
  logo: (theme: Theme) => string
}

export interface LocalProviderRef<T extends ProviderConfig = ProviderConfig> {
  kind: "local"
  config: T
  id: string
  name: string
}

export interface SystemProviderRef {
  kind: "system"
  id: BuiltInAiProviderId
  name: string
  hostedModel: HostedAiModelId
}

export type ResolvedProviderRef<T extends ProviderConfig = ProviderConfig> =
  | LocalProviderRef<T>
  | SystemProviderRef

const VENDOR_LOGOS: Record<HostedAiModelInfo["vendor"], string> = {
  OpenAI: "openai",
  Google: "gemini-color",
  DeepSeek: "deepseek-color",
  MiniMax: "minimax-color",
  Anthropic: "claude-color",
  "Z.ai": "zhipu-color",
  "Moonshot AI": "kimi-color",
}

const SYSTEM_PROVIDER_CAPABILITIES = [
  "pageTranslation",
  "selectionTranslation",
  "videoSubtitles",
  "inputTranslation",
  "noteSuggestion",
  "customAction",
  "languageDetection",
] as const satisfies readonly ProviderCapability[]

/**
 * One built-in provider per hosted model, named after the model so users know
 * what they pick. The backend checks the plan on every call; the plan here
 * only drives the upgrade badge.
 */
const SYSTEM_PROVIDER_DEFS = Object.fromEntries(
  HOSTED_AI_MODELS.map((model): [BuiltInAiProviderId, SystemProviderDef] => {
    const id = getBuiltInAiProviderIdForModel(model.id)
    return [
      id,
      {
        id,
        hostedModel: model.id,
        name: model.name,
        vendor: model.vendor,
        plan: model.plan,
        capabilities: SYSTEM_PROVIDER_CAPABILITIES,
        logo: getLobeIconsCDNUrlFn(VENDOR_LOGOS[model.vendor]),
      },
    ]
  }),
) as Record<BuiltInAiProviderId, SystemProviderDef>

function getSystemProviderDefs(): SystemProviderDef[] {
  return BUILT_IN_AI_PROVIDER_IDS.map((id) => SYSTEM_PROVIDER_DEFS[id])
}

const LOCAL_PROVIDER_CAPABILITY_PREDICATES = {
  pageTranslation: isTranslateProviderConfig,
  videoSubtitles: isTranslateProviderConfig,
  selectionTranslation: isTranslateProviderConfig,
  inputTranslation: isTranslateProviderConfig,
  noteSuggestion: isLLMProviderConfig,
  customAction: isLLMProviderConfig,
  languageDetection: isLLMProviderConfig,
} as const satisfies Record<ProviderCapability, ProviderConfigPredicate>

export type ProviderConfigForCapability<C extends ProviderCapability> =
  (typeof LOCAL_PROVIDER_CAPABILITY_PREDICATES)[C] extends ProviderConfigPredicate<infer T>
    ? T
    : never

export type ProviderRefForCapability<C extends ProviderCapability> = ResolvedProviderRef<
  ProviderConfigForCapability<C>
>

export type CustomActionProviderRef = ProviderRefForCapability<"customAction">
export type SelectionTranslationProviderRef = ProviderRefForCapability<"selectionTranslation">

function getSystemProviderName(def: SystemProviderDef): string {
  return def.name
}

function createSystemProviderSelectorItem(def: SystemProviderDef): SystemProviderSelectorItem {
  return {
    kind: "system",
    id: def.id,
    name: getSystemProviderName(def),
    logo: def.logo,
  }
}

function createSystemProviderRef(def: SystemProviderDef): SystemProviderRef {
  return {
    kind: "system",
    id: def.id,
    name: getSystemProviderName(def),
    hostedModel: def.hostedModel,
  }
}

function getSystemProviderDef(providerId: string): SystemProviderDef | undefined {
  return getSystemProviderDefs().find((def) => def.id === providerId)
}

export function isBuiltInAiProviderId(providerId: string): providerId is BuiltInAiProviderId {
  return BUILT_IN_AI_PROVIDER_IDS.includes(providerId as BuiltInAiProviderId)
}

export function getBuiltInAiProviderName(providerId: BuiltInAiProviderId): string {
  return getSystemProviderName(SYSTEM_PROVIDER_DEFS[providerId])
}

export function getBuiltInAiProviderLogo(
  providerId: BuiltInAiProviderId,
): SystemProviderDef["logo"] {
  return SYSTEM_PROVIDER_DEFS[providerId].logo
}

export function getHostedAiModel(providerId: BuiltInAiProviderId): HostedAiModelId {
  return SYSTEM_PROVIDER_DEFS[providerId].hostedModel
}

export function getBuiltInAiProviderInfo(providerId: BuiltInAiProviderId) {
  const { name, vendor, plan } = SYSTEM_PROVIDER_DEFS[providerId]
  return { name, vendor, plan }
}

export function isSystemProviderId(providerId: string): boolean {
  return !!getSystemProviderDef(providerId)
}

export function getLocalProviderPredicateForCapability<C extends ProviderCapability>(
  capability: C,
): ProviderConfigPredicate<ProviderConfigForCapability<C>> {
  return LOCAL_PROVIDER_CAPABILITY_PREDICATES[capability] as ProviderConfigPredicate<
    ProviderConfigForCapability<C>
  >
}

export function isLocalProviderConfigCompatibleWithCapability<C extends ProviderCapability>(
  capability: C,
  providerConfig: ProviderConfig,
): providerConfig is ProviderConfigForCapability<C> {
  return getLocalProviderPredicateForCapability(capability)(providerConfig)
}

export function getSystemProviderIdsForCapability(capability: ProviderCapability): string[] {
  return getSystemProviderDefs()
    .filter((def) => def.capabilities.includes(capability))
    .map((def) => def.id)
}

export function doesProviderSupportsCapability(
  capability: ProviderCapability,
  providersConfig: ProvidersConfig,
  providerId: string,
  options: { requireEnable?: boolean } = {},
): boolean {
  const providerConfig = providersConfig.find((provider) => provider.id === providerId)
  if (providerConfig) {
    return (
      (!options.requireEnable || providerConfig.enabled) &&
      isLocalProviderConfigCompatibleWithCapability(capability, providerConfig)
    )
  }

  const systemProvider = getSystemProviderDef(providerId)
  return !!systemProvider?.capabilities.includes(capability)
}

export function getProviderIdsForCapability(
  capability: ProviderCapability,
  providersConfig: ProvidersConfig,
  options: { requireEnable?: boolean } = {},
): string[] {
  const localIds = providersConfig
    .filter(
      (provider) =>
        (!options.requireEnable || provider.enabled) &&
        isLocalProviderConfigCompatibleWithCapability(capability, provider),
    )
    .map((provider) => provider.id)

  return [...localIds, ...getSystemProviderIdsForCapability(capability)]
}

export function getSelectableProvidersForCapability(
  capability: ProviderCapability,
  providersConfig: ProvidersConfig,
): ProviderSelectorOption[] {
  const systemProviders = getSystemProviderDefs()
    .filter((def) => def.capabilities.includes(capability))
    .map(createSystemProviderSelectorItem)

  const localProviders = providersConfig.filter(
    (provider) =>
      provider.enabled && isLocalProviderConfigCompatibleWithCapability(capability, provider),
  )

  return [...systemProviders, ...localProviders]
}

export function resolveProviderRefForCapability<C extends ProviderCapability>(
  capability: C,
  providersConfig: ProvidersConfig,
  providerId: string,
): ProviderRefForCapability<C> | null {
  const providerConfig = providersConfig.find((provider) => provider.id === providerId)
  if (providerConfig) {
    if (!isLocalProviderConfigCompatibleWithCapability(capability, providerConfig)) {
      return null
    }

    return {
      kind: "local",
      config: providerConfig,
      id: providerConfig.id,
      name: providerConfig.name,
    }
  }

  const systemProvider = getSystemProviderDef(providerId)
  if (!systemProvider?.capabilities.includes(capability)) {
    return null
  }

  return createSystemProviderRef(systemProvider)
}

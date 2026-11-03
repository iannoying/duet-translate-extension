import type {
  HostedAiCreditPoolStatus,
  HostedAiFeature,
  HostedAiRecurringCreditStatus,
  HostedAiStatus,
  HostedAiTierStatus,
  HostedAiUnavailableReason,
} from "./types"
import type { HostedAiModelId } from "@/utils/constants/provider-ids"
import {
  HOSTED_AI_MODELS,
  HOSTED_AI_TIER_MODELS,
  type HostedAiModelTier,
} from "@/api-contract/hosted-ai"
import { i18n } from "@/utils/i18n"

const REASON_I18N_KEYS = {
  authentication_required: "hostedAi.availability.authenticationRequired",
  ultra_required: "hostedAi.availability.ultraRequired",
  pro_required: "hostedAi.availability.proRequired",
  quota_exhausted: "hostedAi.availability.quotaExhausted",
  service_unavailable: "hostedAi.availability.serviceUnavailable",
} as const satisfies Record<HostedAiUnavailableReason, string>

/**
 * Every pool that can pay for Built-in AI, in the order the server draws on
 * them: the plan's recurring pools, then one-time pools. A server that predates
 * `pools` sends only `credits`, the recurring pools, which have the same shape.
 *
 * TODO(2026-11-07): read `status.pools` alone once the server stops sending
 * `credits` (mengxi-ream/read-frog-monorepo#710).
 */
export function getHostedAiPools(status: HostedAiStatus | undefined): HostedAiCreditPoolStatus[] {
  return status?.pools ?? status?.credits ?? []
}

/**
 * The recurring pool a feature draws on, or undefined when the plan funds none.
 * One-time pools are left out: a tier description shows when the pool resets,
 * and a one-time pool never does.
 */
export function getHostedAiCreditForFeature(
  status: HostedAiStatus | undefined,
  feature: HostedAiFeature,
): HostedAiRecurringCreditStatus | undefined {
  return getHostedAiPools(status).find(
    (pool): pool is HostedAiRecurringCreditStatus =>
      pool.periodKind !== "once" && pool.features.includes(feature),
  )
}

/**
 * The server reports resets in UTC; render the moment in the user's own
 * timezone and locale conventions — "when do I get quota back" is a
 * wall-clock question, not a protocol one. Null when unparsable. The single
 * formatter for every surface (usage bars, dropdown/toast descriptions), so
 * the same reset instant never shows in two different timezones.
 */
export function formatHostedAiResetAtLocal(resetAt: string): string | null {
  const resetDate = new Date(resetAt)
  if (Number.isNaN(resetDate.getTime())) {
    return null
  }
  return resetDate.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function getHostedAiTierDescription(
  status: HostedAiTierStatus | undefined,
  options: { credit?: HostedAiRecurringCreditStatus | null } = {},
): string | undefined {
  if (!status) {
    return i18n.t("hostedAi.availability.serviceUnavailable")
  }
  const details: string[] = []
  if (!status.available) {
    const reason = status.unavailableReason ?? "service_unavailable"
    // The response body is not runtime-validated, so a reason minted by a
    // newer server must fall back instead of rendering "undefined".
    const reasonKey =
      (REASON_I18N_KEYS as Partial<Record<string, string>>)[reason] ??
      REASON_I18N_KEYS.service_unavailable
    details.push(i18n.t(reasonKey as never))
  }
  const credit = options.credit
  if (credit) {
    details.push(
      i18n.t("hostedAi.availability.usedPercent", [
        Math.round(Math.max(0, Math.min(100, credit.usedPercent))),
      ]),
    )
  }
  if (credit?.resetAt) {
    const formattedResetAt = formatHostedAiResetAtLocal(credit.resetAt)
    if (formattedResetAt) {
      details.push(i18n.t("hostedAi.availability.resetsAt", [formattedResetAt]))
    }
  }
  return details.length > 0 ? details.join(" · ") : undefined
}

/**
 * The status of one model for a feature. A server that predates model ids
 * reports only the two legacy tiers, which stand for GPT-6.1 Terra and Claude
 * Sonnet 5.5; another model reads as the tier of its plan there, so the plan
 * gates still apply.
 */
export function getHostedAiTierStatus(
  status: HostedAiStatus | undefined,
  feature: HostedAiFeature,
  model: HostedAiModelId,
): HostedAiTierStatus | undefined {
  if (!status) return undefined
  if (status.models) return status.models[feature]?.[model]
  const legacyTier = (Object.keys(HOSTED_AI_TIER_MODELS) as HostedAiModelTier[]).find(
    (key) => HOSTED_AI_TIER_MODELS[key] === model,
  )
  const plan = HOSTED_AI_MODELS.find((entry) => entry.id === model)?.plan
  const tier = legacyTier ?? (plan === "pro" ? "normal" : "advance")
  return status.features[feature]?.[tier]
}

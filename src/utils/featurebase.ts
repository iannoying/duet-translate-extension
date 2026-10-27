import type { SupportedUiLocale } from "@/utils/i18n/resources"
import { BRAND } from "@/utils/constants/brand"

export type FeaturebasePortalDestination = "feedback" | "roadmap" | "tickets"

export interface FeaturebaseFeedbackMetadata {
  [key: string]: string | undefined
  browser: string
  extension_version: string
  page_url?: string
}

/** Undefined while no feedback portal is configured, so callers can hide their entry. */
export function buildFeaturebasePortalUrl({
  destination,
  locale,
  metadata,
  origin = BRAND.feedbackPortalOrigin,
}: {
  destination: FeaturebasePortalDestination
  locale: SupportedUiLocale
  metadata?: Record<string, string | undefined>
  origin?: string
}): string | undefined {
  if (!origin) return undefined
  const pathname = destination === "feedback" ? `/${locale}` : `/${locale}/${destination}`
  const url = new URL(pathname, origin)

  const definedMetadata = metadata
    ? Object.fromEntries(
        Object.entries(metadata).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      )
    : undefined

  if (definedMetadata && Object.keys(definedMetadata).length > 0) {
    url.searchParams.set("metaData", JSON.stringify(definedMetadata))
  }

  return url.toString()
}

export function buildFeaturebaseFeedbackMetadata({
  browserName,
  extensionVersion,
  pageUrl,
}: {
  browserName: string
  extensionVersion: string
  pageUrl: string
}): FeaturebaseFeedbackMetadata {
  const metadata: FeaturebaseFeedbackMetadata = {
    browser: browserName,
    extension_version: extensionVersion,
  }

  try {
    const url = new URL(pageUrl)
    if (url.protocol === "http:" || url.protocol === "https:") {
      metadata.page_url = `${url.origin}${url.pathname}`
    }
  } catch {
    // Keep the extension version even when the current page URL is not parseable.
  }

  return metadata
}

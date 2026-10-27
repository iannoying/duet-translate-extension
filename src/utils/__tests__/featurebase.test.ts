import { describe, expect, it } from "vitest"
import { buildFeaturebaseFeedbackMetadata, buildFeaturebasePortalUrl } from "@/utils/featurebase"

const ORIGIN = "https://feedback.example.com"
const SUPPORTED_UI_LOCALES = ["en", "es", "ja", "ko", "ru", "tr", "vi", "zh-CN", "zh-TW"] as const

describe("buildFeaturebasePortalUrl", () => {
  it.each(SUPPORTED_UI_LOCALES)("builds locale-prefixed portal URLs for %s", (locale) => {
    expect(buildFeaturebasePortalUrl({ destination: "feedback", locale, origin: ORIGIN })).toBe(
      `https://feedback.example.com/${locale}`,
    )
    expect(buildFeaturebasePortalUrl({ destination: "roadmap", locale, origin: ORIGIN })).toBe(
      `https://feedback.example.com/${locale}/roadmap`,
    )
  })

  it("serializes metadata with Featurebase's metaData query parameter", () => {
    const result = buildFeaturebasePortalUrl({
      destination: "feedback",
      locale: "zh-CN",
      origin: ORIGIN,
      metadata: {
        browser: "edge",
        extension_version: "1.43.3",
        page_url: "https://example.com/private/path",
      },
    })
    const url = new URL(result!)

    expect(url.pathname).toBe("/zh-CN")
    expect(JSON.parse(url.searchParams.get("metaData")!)).toEqual({
      browser: "edge",
      extension_version: "1.43.3",
      page_url: "https://example.com/private/path",
    })
  })

  it("is undefined while no portal is configured", () => {
    expect(
      buildFeaturebasePortalUrl({ destination: "feedback", locale: "en", origin: undefined }),
    ).toBeUndefined()
  })
})

describe("buildFeaturebaseFeedbackMetadata", () => {
  it("keeps only the origin and pathname for HTTP(S) pages", () => {
    expect(
      buildFeaturebaseFeedbackMetadata({
        browserName: "edge",
        extensionVersion: "1.43.3",
        pageUrl: "https://user:password@example.com/private/path?token=secret#section",
      }),
    ).toEqual({
      browser: "edge",
      extension_version: "1.43.3",
      page_url: "https://example.com/private/path",
    })
  })

  it.each(["file:///Users/example/private.html", "about:blank", "not a URL"])(
    "omits page_url for unsupported or invalid URL %s",
    (pageUrl) => {
      expect(
        buildFeaturebaseFeedbackMetadata({
          browserName: "firefox",
          extensionVersion: "1.43.3",
          pageUrl,
        }),
      ).toEqual({
        browser: "firefox",
        extension_version: "1.43.3",
      })
    },
  )
})

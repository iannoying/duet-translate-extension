import { afterEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { getReviewUrl } from "../utils"

const LISTINGS = {
  chromeWebStoreId: "chromeid",
  edgeAddOnsId: "edgeid",
  firefoxAddOnSlug: "getu-translate",
}

const testRuntimeId = browser.runtime.id

function installedWithId(id: string) {
  Object.defineProperty(browser.runtime, "id", { configurable: true, value: id })
}

afterEach(() => {
  Object.defineProperty(browser.runtime, "id", { configurable: true, value: testRuntimeId })
  vi.unstubAllEnvs()
})

describe("getReviewUrl", () => {
  it("sends an Edge Add-ons install to Edge even when it runs the Chrome build", () => {
    vi.stubEnv("BROWSER", "chrome")
    installedWithId("edgeid")
    expect(getReviewUrl("popup", LISTINGS)).toBe(
      "https://microsoftedge.microsoft.com/addons/detail/edgeid?utm_source=popup",
    )
  })

  it("sends a Chrome Web Store install to Chrome even when it runs the Edge build", () => {
    vi.stubEnv("BROWSER", "edge")
    installedWithId("chromeid")
    expect(getReviewUrl("popup", LISTINGS)).toBe(
      "https://chromewebstore.google.com/detail/chromeid/reviews?utm_source=popup",
    )
  })

  it.each([
    ["chrome", "https://chromewebstore.google.com/detail/chromeid/reviews?utm_source=extension"],
    ["edge", "https://microsoftedge.microsoft.com/addons/detail/edgeid?utm_source=extension"],
    [
      "firefox",
      "https://addons.mozilla.org/firefox/addon/getu-translate/reviews/?utm_source=extension",
    ],
  ])("falls back to the %s build target for any other id", (target, expected) => {
    vi.stubEnv("BROWSER", target)
    installedWithId("unpacked-dev-build-id")
    expect(getReviewUrl(undefined, LISTINGS)).toBe(expected)
  })

  it.each(["chrome", "edge", "firefox"])("is undefined while %s has no listing", (target) => {
    vi.stubEnv("BROWSER", target)
    installedWithId("unpacked-dev-build-id")
    expect(getReviewUrl("popup", {})).toBeUndefined()
  })
})

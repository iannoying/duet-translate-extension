import { describe, expect, it } from "vitest"
import { FEATURE_KEYS } from "../feature-providers"
import { NOTEBASE_ENABLED, isFeatureVisible } from "../notebase"

describe("notebase visibility", () => {
  it("ships with the Notebase features hidden", () => {
    expect(NOTEBASE_ENABLED).toBe(false)
  })

  it("hides note suggestions from the feature lists and keeps every other feature", () => {
    expect(FEATURE_KEYS.filter(isFeatureVisible)).toEqual(
      FEATURE_KEYS.filter((key) => key !== "noteSuggestion"),
    )
  })
})

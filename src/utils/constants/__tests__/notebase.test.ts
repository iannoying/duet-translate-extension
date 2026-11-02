import { describe, expect, it } from "vitest"
import { FEATURE_KEYS } from "../feature-providers"
import { NOTEBASE_ENABLED, isFeatureVisible } from "../notebase"

describe("notebase visibility", () => {
  it("ships with the Notebase features shown", () => {
    expect(NOTEBASE_ENABLED).toBe(true)
  })

  it("lists every feature, note suggestions included", () => {
    expect(FEATURE_KEYS.filter(isFeatureVisible)).toEqual(FEATURE_KEYS)
  })
})

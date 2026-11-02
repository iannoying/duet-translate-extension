import { describe, expect, it } from "vitest"
import { migrate } from "../../migration-scripts/v115-to-v116"

describe("v115-to-v116 migration", () => {
  it("moves the old green install default to the page's own text color", () => {
    const oldConfig = {
      pageTranslation: {
        mode: "bilingual",
        translationNodeStyle: { preset: "textColor", isCustom: false, customCSS: null },
      },
    }
    const snapshot = structuredClone(oldConfig)

    const migrated = migrate(oldConfig)

    expect(migrated).toEqual({
      pageTranslation: {
        mode: "bilingual",
        translationNodeStyle: { preset: "default", isCustom: false, customCSS: null },
      },
    })
    expect(oldConfig).toEqual(snapshot)
    expect(migrate(migrated)).toBe(migrated)
  })

  it("keeps other presets and custom CSS styles", () => {
    const blur = {
      pageTranslation: {
        translationNodeStyle: { preset: "blur", isCustom: false, customCSS: null },
      },
    }
    const custom = {
      pageTranslation: {
        translationNodeStyle: { preset: "textColor", isCustom: true, customCSS: "color: red;" },
      },
    }

    expect(migrate(blur)).toBe(blur)
    expect(migrate(custom)).toBe(custom)
  })

  it("leaves malformed config shapes unchanged", () => {
    expect(migrate(null)).toBeNull()
    expect(migrate([])).toEqual([])
    expect(migrate({})).toEqual({})
    expect(migrate({ pageTranslation: null })).toEqual({ pageTranslation: null })
    expect(migrate({ pageTranslation: { translationNodeStyle: null } })).toEqual({
      pageTranslation: { translationNodeStyle: null },
    })
  })
})

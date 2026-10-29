// @vitest-environment jsdom

import type { ContentScriptContext } from "#imports"
import { act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { storage } from "#imports"
import { toastManager } from "@/components/ui/base-ui/toast"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { logger } from "@/utils/logger"
import { bootstrapHostContent } from "../runtime"

const {
  messageHandlers,
  managerInstances,
  mockBindTranslationShortcutKey,
  mockClearEffectiveSiteControlUrl,
  mockDetectPageLanguageLightweight,
  mockEnsurePresetStyles,
  mockOnMessage,
  mockRegisterNodeTranslationTriggers,
  mockSendMessage,
  mockSetupUrlChangeListener,
} = vi.hoisted(() => ({
  messageHandlers: new Map<string, (msg?: any) => any>(),
  managerInstances: [] as Array<{
    isActive: boolean
    getDetectedPageLanguage?: (url: string) => string | undefined
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    refreshSiteRuleCSS: ReturnType<typeof vi.fn>
    setTitleTranslationEnabled: ReturnType<typeof vi.fn>
    registerPageTranslationTriggers: ReturnType<typeof vi.fn>
  }>,
  mockBindTranslationShortcutKey: vi.fn<(...args: any[]) => any>(),
  mockClearEffectiveSiteControlUrl: vi.fn<(...args: any[]) => any>(),
  mockDetectPageLanguageLightweight: vi.fn<(...args: any[]) => any>(),
  mockEnsurePresetStyles: vi.fn<(...args: any[]) => any>(),
  mockOnMessage: vi.fn<(...args: any[]) => any>(),
  mockRegisterNodeTranslationTriggers: vi.fn<(...args: any[]) => any>(),
  mockSendMessage: vi.fn<(...args: any[]) => any>(),
  mockSetupUrlChangeListener: vi.fn<(...args: any[]) => any>(),
}))

vi.mock("@/utils/content/page-language", () => ({
  detectPageLanguageLightweight: mockDetectPageLanguageLightweight,
}))

vi.mock("@/utils/host/translate/ui/style-injector", () => ({
  ensurePresetStyles: mockEnsurePresetStyles,
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    error: vi.fn<(...args: any[]) => any>(),
    info: vi.fn<(...args: any[]) => any>(),
    warn: vi.fn<(...args: any[]) => any>(),
  },
}))

vi.mock("@/utils/message", () => ({
  onMessage: mockOnMessage,
  sendMessage: mockSendMessage,
}))

vi.mock("@/utils/site-control", () => ({
  clearEffectiveSiteControlUrl: mockClearEffectiveSiteControlUrl,
}))

vi.mock("../listen", () => ({
  setupUrlChangeListener: mockSetupUrlChangeListener,
}))

vi.mock("../translation-control/bind-translation-shortcut", () => ({
  bindTranslationShortcutKey: mockBindTranslationShortcutKey,
}))

vi.mock("../translation-control/node-translation", () => ({
  registerNodeTranslationTriggers: mockRegisterNodeTranslationTriggers,
}))

vi.mock("../translation-control/page-translation", () => ({
  PageTranslationManager: class {
    isActive = false
    getDetectedPageLanguage?: (url: string) => string | undefined
    start = vi.fn<(...args: any[]) => any>(async () => {
      this.isActive = true
    })

    stop = vi.fn<(...args: any[]) => any>(() => {
      this.isActive = false
    })

    refreshSiteRuleCSS = vi.fn<(...args: any[]) => any>(async () => {})

    setTitleTranslationEnabled = vi.fn<(...args: any[]) => any>()

    registerPageTranslationTriggers = vi.fn<(...args: any[]) => any>(() =>
      vi.fn<(...args: any[]) => any>(),
    )

    constructor(_options: unknown, getDetectedPageLanguage?: (url: string) => string | undefined) {
      this.getDetectedPageLanguage = getDetectedPageLanguage
      managerInstances.push(this)
    }
  },
}))

function createContentScriptContext() {
  const invalidationCallbacks: Array<() => void> = []
  let invalidated = false

  return {
    ctx: {
      get isInvalid() {
        return invalidated
      },
      onInvalidated: (callback: () => void) => {
        invalidationCallbacks.push(callback)
      },
    } as ContentScriptContext,
    invalidate: () => {
      invalidated = true
      for (const callback of invalidationCallbacks) {
        callback()
      }
    },
  }
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

describe("bootstrapHostContent URL changes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    messageHandlers.clear()
    managerInstances.length = 0

    mockSetupUrlChangeListener.mockReturnValue(vi.fn<(...args: any[]) => any>())
    mockRegisterNodeTranslationTriggers.mockReturnValue(vi.fn<(...args: any[]) => any>())
    mockBindTranslationShortcutKey.mockResolvedValue(vi.fn<(...args: any[]) => any>())
    mockOnMessage.mockImplementation((name: string, handler: (msg?: any) => any) => {
      messageHandlers.set(name, handler)
      return vi.fn<(...args: any[]) => any>()
    })
    mockDetectPageLanguageLightweight.mockResolvedValue({ detectedCodeOrUnd: "fra" })
    mockSendMessage.mockImplementation((name: string) => {
      if (name === "getEnablePageTranslationFromContentScript") return Promise.resolve(false)

      return Promise.resolve(undefined)
    })
  })

  it("only refreshes site CSS on same-origin SPA navigation, keeping the session active", async () => {
    mockSendMessage.mockImplementation((name: string) => {
      if (name === "getEnablePageTranslationFromContentScript") return Promise.resolve(true)

      return Promise.resolve(undefined)
    })

    const { ctx, invalidate } = createContentScriptContext()
    await bootstrapHostContent(ctx, null)
    const manager = managerInstances[0]

    window.dispatchEvent(
      new CustomEvent("extension:URLChange", {
        detail: {
          from: "https://example.com/articles/1",
          to: "https://example.com/articles/2?ref=nav#comments",
        },
      }),
    )
    await flushAsyncWork()

    expect(manager!.start).toHaveBeenCalledTimes(1)
    expect(manager!.refreshSiteRuleCSS).toHaveBeenCalledTimes(1)
    expect(manager!.stop).not.toHaveBeenCalled()
    expect(mockSendMessage).toHaveBeenCalledWith("reportDetectedPageLanguage", {
      url: "https://example.com/articles/2?ref=nav#comments",
      detectedCodeOrUnd: "fra",
    })

    invalidate()
  })

  it("applies the tab title switch to the live session and stops watching on invalidation", async () => {
    const unwatch = vi.fn<() => void>()
    const watch = vi.spyOn(storage, "watch").mockReturnValue(unwatch)
    const { ctx, invalidate } = createContentScriptContext()
    try {
      await bootstrapHostContent(ctx, null)
      const manager = managerInstances[0]!
      const onConfigChange = watch.mock.calls.find(
        ([key]) => key === `local:${CONFIG_STORAGE_KEY}`,
      )?.[1]
      expect(onConfigChange).toBeDefined()

      const switchedOff = structuredClone(DEFAULT_CONFIG)
      switchedOff.pageTranslation.page.translateTitle = false
      onConfigChange!(switchedOff, DEFAULT_CONFIG)

      expect(manager.setTitleTranslationEnabled).toHaveBeenLastCalledWith(false)
      expect(manager.stop).not.toHaveBeenCalled()

      // Written before v109: the schema default keeps the title translated.
      const preMigration: any = structuredClone(DEFAULT_CONFIG)
      delete preMigration.pageTranslation.page.translateTitle
      onConfigChange!(preMigration, switchedOff)

      expect(manager.setTitleTranslationEnabled).toHaveBeenLastCalledWith(true)

      invalidate()
      expect(unwatch).toHaveBeenCalledOnce()
    } finally {
      watch.mockRestore()
    }
  })

  it("keeps inactive page translation inactive and only asks auto-translation on SPA navigation", async () => {
    const { ctx, invalidate } = createContentScriptContext()
    await bootstrapHostContent(ctx, null)
    const manager = managerInstances[0]

    window.dispatchEvent(
      new CustomEvent("extension:URLChange", {
        detail: {
          from: "https://example.com/articles/1",
          to: "https://example.com/articles/2",
        },
      }),
    )
    await flushAsyncWork()

    expect(manager!.start).not.toHaveBeenCalled()
    expect(manager!.refreshSiteRuleCSS).not.toHaveBeenCalled()
    expect(manager!.stop).not.toHaveBeenCalled()
    expect(mockSendMessage).toHaveBeenCalledWith("reportDetectedPageLanguage", {
      url: "https://example.com/articles/2",
      detectedCodeOrUnd: "fra",
    })

    invalidate()
  })

  it.each(["throw", "reject"])("handles a language report that fails with %s", async (failure) => {
    const error = new Error("Extension context invalidated.")
    mockSendMessage.mockImplementation((name: string) => {
      if (name !== "reportDetectedPageLanguage") return Promise.resolve(false)
      if (failure === "throw") throw error
      return Promise.reject(error)
    })
    const { ctx, invalidate } = createContentScriptContext()
    try {
      await expect(bootstrapHostContent(ctx, null)).resolves.toBeUndefined()
      expect(logger.warn).toHaveBeenCalledWith("Failed to detect or report page language:", error)
    } finally {
      invalidate()
    }
  })

  it("handles a rejected language report after SPA navigation", async () => {
    const { ctx, invalidate } = createContentScriptContext()
    await bootstrapHostContent(ctx, null)
    const error = new Error("Extension context invalidated.")
    mockSendMessage.mockRejectedValueOnce(error)
    try {
      window.dispatchEvent(
        new CustomEvent("extension:URLChange", {
          detail: { from: "https://example.com/one", to: "https://example.com/two" },
        }),
      )
      await flushAsyncWork()
      expect(logger.warn).toHaveBeenCalledWith("Failed to detect or report page language:", error)
    } finally {
      invalidate()
    }
  })

  it("does not start language detection from a stale callback after invalidation", async () => {
    const { ctx, invalidate } = createContentScriptContext()
    await bootstrapHostContent(ctx, null)
    const refreshHandler = messageHandlers.get("refreshDetectedPageLanguage")!
    mockDetectPageLanguageLightweight.mockClear()
    mockSendMessage.mockClear()

    invalidate()
    refreshHandler()
    await flushAsyncWork()

    expect(mockDetectPageLanguageLightweight).not.toHaveBeenCalled()
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it("discards language detection that finishes after invalidation", async () => {
    const { ctx, invalidate } = createContentScriptContext()
    await bootstrapHostContent(ctx, null)
    let resolveDetection!: (result: { detectedCodeOrUnd: string }) => void
    mockDetectPageLanguageLightweight.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDetection = resolve
        }),
    )
    mockSendMessage.mockClear()
    messageHandlers.get("refreshDetectedPageLanguage")!()
    invalidate()
    resolveDetection({ detectedCodeOrUnd: "jpn" })
    await flushAsyncWork()

    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(managerInstances[0]?.getDetectedPageLanguage?.(window.location.href)).toBeUndefined()
  })

  it("refreshes and reports detected language when background requests active-tab refresh", async () => {
    const { ctx, invalidate } = createContentScriptContext()
    await bootstrapHostContent(ctx, null)
    await flushAsyncWork()

    mockSendMessage.mockClear()
    mockDetectPageLanguageLightweight.mockClear()
    mockDetectPageLanguageLightweight.mockResolvedValueOnce({ detectedCodeOrUnd: "jpn" })

    const refreshHandler = messageHandlers.get("refreshDetectedPageLanguage")
    if (!refreshHandler) {
      throw new Error("Expected refreshDetectedPageLanguage handler to be registered")
    }

    refreshHandler()
    await flushAsyncWork()

    expect(mockDetectPageLanguageLightweight).toHaveBeenCalledOnce()
    expect(mockSendMessage).toHaveBeenCalledWith("reportDetectedPageLanguage", {
      url: window.location.href,
      detectedCodeOrUnd: "jpn",
    })
    expect(managerInstances[0]?.getDetectedPageLanguage?.(window.location.href)).toBe("jpn")

    invalidate()
  })

  it("ignores an older detection that completes after the page URL changes", async () => {
    const { ctx, invalidate } = createContentScriptContext()
    await bootstrapHostContent(ctx, null)
    const manager = managerInstances[0]
    const oldUrl = window.location.href
    let resolveOld: ((result: { detectedCodeOrUnd: string }) => void) | undefined
    mockDetectPageLanguageLightweight.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    mockDetectPageLanguageLightweight.mockResolvedValueOnce({ detectedCodeOrUnd: "jpn" })

    messageHandlers.get("refreshDetectedPageLanguage")?.()
    window.history.pushState({}, "", "/analytics-new-page")
    const newUrl = window.location.href
    window.dispatchEvent(
      new CustomEvent("extension:URLChange", { detail: { from: oldUrl, to: newUrl } }),
    )
    await flushAsyncWork()
    resolveOld?.({ detectedCodeOrUnd: "fra" })
    await flushAsyncWork()

    expect(manager?.getDetectedPageLanguage?.(oldUrl)).toBeUndefined()
    expect(manager?.getDetectedPageLanguage?.(newUrl)).toBe("jpn")
    invalidate()
  })

  // The content runtime's parts share one toastManager, and the selection UI
  // already renders every toast it gets; a surface here would show each twice.
  it("mounts no toast surface of its own", async () => {
    const { ctx, invalidate } = createContentScriptContext()
    await bootstrapHostContent(ctx, null)
    await act(flushAsyncWork)

    act(() => {
      toastManager.add({ title: "Source and target language are the same" })
    })
    await act(flushAsyncWork)

    const toastHosts = [...document.body.querySelectorAll("*")].filter((element) =>
      element.shadowRoot?.querySelector('[data-slot="toast"]'),
    )
    expect(toastHosts).toEqual([])

    act(() => toastManager.close())
    invalidate()
  })
})

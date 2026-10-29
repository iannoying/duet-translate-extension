import { beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { logger } from "@/utils/logger"
import { sendMessage } from "@/utils/message"

vi.mock("@/utils/message", () => ({
  onMessage: vi.fn<typeof import("@/utils/message").onMessage>(),
  sendMessage: vi.fn<typeof sendMessage>(),
}))
vi.mock("@/utils/logger", () => ({ logger: { warn: vi.fn<typeof logger.warn>() } }))
vi.mock("@/utils/guide/dictionary-notebase", () => ({
  markGuideDictionaryNotebaseCompleted: vi.fn<() => void>(),
}))

const getUserSettingsMock = vi.fn<() => Promise<{ isOnToolbar: boolean }>>()

describe("guide pin notifications", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getUserSettingsMock.mockResolvedValue({ isOnToolbar: true })
    Object.assign(browser.action, {
      getUserSettings: getUserSettingsMock,
      onUserSettingsChanged: { addListener: vi.fn<() => void>() },
    })
    browser.tabs.query = vi.fn<(...args: any[]) => any>()
    vi.mocked(sendMessage).mockResolvedValue(undefined)
  })

  function mockTabs(tabs: Array<{ id?: number }>) {
    browser.tabs.query = vi.fn<(...args: any[]) => any>((_query, callback) => {
      callback?.(tabs)
      return Promise.resolve(tabs)
    })
  }

  it("handles a missing receiver without preventing delivery to another guide tab", async () => {
    mockTabs([{ id: 1 }, { id: 2 }])
    const error = new Error("No response")
    vi.mocked(sendMessage).mockRejectedValueOnce(error)
    const { guidePinExtension } = await import("../new-user-guide")

    await guidePinExtension()

    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith("[NewUserGuide] Failed to notify pin state", error)
    })
    expect(sendMessage).toHaveBeenCalledWith("pinStateChanged", { isPinned: true }, 2)
  })

  it("does not broadcast to the runtime when a tab has no ID", async () => {
    mockTabs([{}, { id: 2 }])
    const { guidePinExtension } = await import("../new-user-guide")

    await guidePinExtension()

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledOnce())
    expect(sendMessage).toHaveBeenCalledWith("pinStateChanged", { isPinned: true }, 2)
  })

  it("does not notify when the pin state has not changed", async () => {
    getUserSettingsMock.mockResolvedValue({ isOnToolbar: false })
    const { guidePinExtension } = await import("../new-user-guide")

    await guidePinExtension()

    expect(browser.tabs.query).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })
})

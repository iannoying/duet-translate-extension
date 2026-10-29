import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { onMessage, sendMessage } from "../message"

type SendTabMessage = (
  tabId: number,
  message: unknown,
  options: { frameId: number } | undefined,
  callback: (response: unknown) => void,
) => void

describe("extension messaging", () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.stubGlobal("chrome", fakeBrowser)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([42, { tabId: 42, frameId: 0 }])(
    "reads runtime.lastError and rejects tab delivery failures for %j",
    async (target) => {
      const lastError = vi.fn<() => { message: string }>(() => ({
        message: "Could not establish connection. Receiving end does not exist.",
      }))
      const sendTabMessage = vi.fn<SendTabMessage>((_tabId, _message, _options, callback) => {
        callback(undefined)
      })
      vi.stubGlobal("chrome", {
        runtime: {
          get lastError() {
            return lastError()
          },
        },
        tabs: { sendMessage: sendTabMessage },
      })

      await expect(sendMessage("pinStateChanged", { isPinned: true }, target)).rejects.toThrow(
        "Could not establish connection. Receiving end does not exist.",
      )
      expect(lastError).toHaveBeenCalled()
      expect(sendTabMessage).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ type: "pinStateChanged", data: { isPinned: true } }),
        typeof target === "number" ? undefined : { frameId: 0 },
        expect.any(Function),
      )
    },
  )

  it("preserves successful tab responses and still rejects unanswered requests", async () => {
    const sendTabMessage = vi.fn<SendTabMessage>((_tabId, _message, _options, callback) => {
      callback({ res: true })
    })
    vi.stubGlobal("chrome", {
      runtime: { lastError: undefined },
      tabs: { sendMessage: sendTabMessage },
    })

    await expect(
      sendMessage("activateSameOriginIframeSelectionRuntime", undefined, 42),
    ).resolves.toBe(true)

    sendTabMessage.mockImplementation((_tabId, _message, _options, callback) => {
      callback(undefined)
    })
    await expect(
      sendMessage("activateSameOriginIframeSelectionRuntime", undefined, 42),
    ).rejects.toThrow("No response")
  })

  it("round-trips async responses through the callback-based browser API", async () => {
    const removeListener = onMessage("getInitialConfig", async () => null)

    try {
      await expect(sendMessage("getInitialConfig", undefined)).resolves.toBeNull()
    } finally {
      removeListener()
    }
  })
})

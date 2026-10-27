import type { ExtensionStatusResponse as UpstreamExtensionStatusResponse } from "@/definitions"
import { BRAND } from "@/utils/constants/brand"

// The website's guide pages ask whether the extension is installed with these.
const EXTENSION_STATUS_REQUEST_SOURCE = `${BRAND.slug}-page`
const EXTENSION_STATUS_RESPONSE_SOURCE = `${BRAND.slug}-ext`
const EXTENSION_STATUS_REQUEST_TYPE = "getExtensionStatus"
const EXTENSION_STATUS_RESPONSE_TYPE = "extensionStatus"

type ExtensionStatusResponse = Omit<UpstreamExtensionStatusResponse, "source"> & {
  source: typeof EXTENSION_STATUS_RESPONSE_SOURCE
}

interface ExtensionStatusMessageEvent {
  data: unknown
  source: unknown
}

export {
  EXTENSION_STATUS_REQUEST_SOURCE,
  EXTENSION_STATUS_REQUEST_TYPE,
  EXTENSION_STATUS_RESPONSE_SOURCE,
  EXTENSION_STATUS_RESPONSE_TYPE,
}
export type { ExtensionStatusResponse }

export function createExtensionStatusResponse(
  event: ExtensionStatusMessageEvent,
  pageWindow: unknown,
  version: string,
): ExtensionStatusResponse | null {
  if (event.source !== pageWindow || !isRecord(event.data)) {
    return null
  }

  const { requestId, source, type } = event.data
  if (
    source !== EXTENSION_STATUS_REQUEST_SOURCE ||
    type !== EXTENSION_STATUS_REQUEST_TYPE ||
    typeof requestId !== "string" ||
    requestId.length === 0
  ) {
    return null
  }

  return {
    source: EXTENSION_STATUS_RESPONSE_SOURCE,
    type: EXTENSION_STATUS_RESPONSE_TYPE,
    requestId,
    data: { version },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

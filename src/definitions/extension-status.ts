/**
 * The extension's answer when a website page asks whether it is installed
 * (window.postMessage). The page names the request with a `requestId`.
 */
export interface ExtensionStatusResponse {
  source: string
  type: "extensionStatus"
  requestId: string
  data: { version: string }
}

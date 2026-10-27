import { z } from "zod"

/**
 * The window.postMessage protocol between the website's ebook reader and the
 * extension. The reader sees selections inside the book's iframe, which the
 * extension's top-frame content script cannot, and relays them:
 *
 * 1. The page sends a handshake; the extension answers with its own.
 * 2. The page sends `selectionChanged` with the selection, and
 *    `selectionCleared` once it is gone.
 *
 * Receivers ignore messages they do not understand.
 */

export const EBOOK_SELECTION_BRIDGE_PROTOCOL_VERSION = 1
export const EBOOK_BRIDGE_PAGE_SOURCE = "getu-translate-ebook-page"
export const EBOOK_BRIDGE_EXTENSION_SOURCE = "getu-translate-ebook-extension"
export const EBOOK_BRIDGE_HANDSHAKE_TYPE = "handshake"
export const EBOOK_BRIDGE_SELECTION_CHANGED_TYPE = "selectionChanged"
export const EBOOK_BRIDGE_SELECTION_CLEARED_TYPE = "selectionCleared"

export const ebookBridgeSelectionDirectionSchema = z.enum([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
])
export type EbookBridgeSelectionDirection = z.infer<typeof ebookBridgeSelectionDirectionSchema>

export const ebookBridgeSelectionPayloadSchema = z.object({
  requestId: z.string(),
  text: z.string(),
  // The paragraphs around the selection, for context.
  contextParagraphs: z.array(z.string()),
  // The selection's box and where the toolbar points, in viewport pixels.
  rect: z.object({
    top: z.number(),
    left: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  anchor: z.object({ x: z.number(), y: z.number() }),
  // Which way the toolbar opens from the anchor.
  direction: ebookBridgeSelectionDirectionSchema,
  bookTitle: z.string().optional(),
})
export type EbookBridgeSelectionPayload = z.infer<typeof ebookBridgeSelectionPayloadSchema>

const pageMessageBase = {
  source: z.literal(EBOOK_BRIDGE_PAGE_SOURCE),
  protocolVersion: z.literal(EBOOK_SELECTION_BRIDGE_PROTOCOL_VERSION),
}

export const ebookBridgePageMessageSchema = z.discriminatedUnion("type", [
  z.object({ ...pageMessageBase, type: z.literal(EBOOK_BRIDGE_HANDSHAKE_TYPE) }),
  z.object({
    ...pageMessageBase,
    type: z.literal(EBOOK_BRIDGE_SELECTION_CHANGED_TYPE),
    data: ebookBridgeSelectionPayloadSchema,
  }),
  z.object({ ...pageMessageBase, type: z.literal(EBOOK_BRIDGE_SELECTION_CLEARED_TYPE) }),
])
export type EbookBridgePageMessage = z.infer<typeof ebookBridgePageMessageSchema>

export interface EbookBridgeExtensionHandshake {
  source: typeof EBOOK_BRIDGE_EXTENSION_SOURCE
  type: typeof EBOOK_BRIDGE_HANDSHAKE_TYPE
  protocolVersion: typeof EBOOK_SELECTION_BRIDGE_PROTOCOL_VERSION
  data: { extensionVersion: string }
}

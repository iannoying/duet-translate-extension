import type { NoteSaveSurface } from "./note-save"

/**
 * What the extension tells its backend about a call, for its analytics: the
 * surface the call was made from, and whether the user is in the website's
 * guide. Sent in CLIENT_CONTEXT_HEADER as `surface=<surface>`, then `guide`
 * when it applies, comma-separated.
 */
export interface ClientContextHeaderInput {
  surface: NoteSaveSurface
  isGuide?: boolean
}

export const CLIENT_CONTEXT_HEADER = "x-read-frog-client-context"

export function formatClientContextHeader(input: ClientContextHeaderInput): string {
  const parts = [`surface=${input.surface}`]
  if (input.isGuide) parts.push("guide")
  return parts.join(", ")
}

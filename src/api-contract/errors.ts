/**
 * The `code` of an ORPCError the backend throws for an outcome the extension
 * handles on its own; anything else reads as a generic failure. Standard oRPC
 * codes (UNAUTHORIZED, FORBIDDEN, NOT_FOUND, TOO_MANY_REQUESTS) are not listed.
 */
export const PUBLIC_APP_ERROR_CODES = [
  // Notebase
  "NOTE_LIMIT_EXCEEDED",
  "NOTEBASE_NOT_FOUND",
  "CELL_VALIDATION_FAILED",
  // Hosted AI: data is HostedAiTierRestrictedData / HostedAiQuotaExhaustedData.
  "HOSTED_AI_TIER_RESTRICTED",
  "HOSTED_AI_QUOTA_EXHAUSTED",
  // Video transcription
  "VIDEO_TRANSCRIPTION_SUBSCRIPTION_REQUIRED",
  "VIDEO_TRANSCRIPTION_PAYMENT_REQUIRED",
  "VIDEO_TRANSCRIPTION_QUOTA_EXCEEDED",
  "VIDEO_TRANSCRIPTION_UNSUPPORTED_LENGTH",
  "VIDEO_TRANSCRIPTION_BETA_RESTRICTED",
  "VIDEO_TRANSCRIPT_NOT_READY",
] as const

export type PublicAppErrorCode = (typeof PUBLIC_APP_ERROR_CODES)[number]

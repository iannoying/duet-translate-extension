import { z } from "zod"
import { getVideoIdFromUrl } from "@/definitions"
import { PlanSchema } from "./plans"

/**
 * AI subtitles: the backend transcribes a YouTube video that has none. The
 * extension creates a job, polls it until it completes, then reads its
 * subtitles. Minutes come out of the plan's pools.
 */

export const VideoTranscriptStatusSchema = z.enum(["pending", "processing", "completed", "failed"])
export type VideoTranscriptStatus = z.infer<typeof VideoTranscriptStatusSchema>

export const VideoTranscriptJobSchema = z.object({
  id: z.string(),
  status: VideoTranscriptStatusSchema,
  // Known once transcribed.
  detectedLanguage: z.string().nullable(),
})
export type VideoTranscriptJob = z.infer<typeof VideoTranscriptJobSchema>

export const VideoTranscriptCreateInputSchema = z.object({
  url: z.string().refine((url) => getVideoIdFromUrl(url) !== null, "Expected a YouTube video URL"),
  durationSec: z.number().positive(),
})
export const VideoTranscriptIdInputSchema = z.object({ id: z.string() })

export const VideoTranscriptSubtitlesOutputSchema = z.object({
  // Times in seconds.
  segments: z.array(z.object({ start: z.number(), end: z.number(), text: z.string() })),
  detectedLanguage: z.string().nullish(),
})

export const VideoTranscriptUsagePoolSchema = z.object({
  // Such as "subscription" or "launchBonus".
  id: z.string(),
  usedMinutes: z.number().min(0),
  limitMinutes: z.number().min(0),
  remainingMinutes: z.number().min(0),
  // When a recurring pool refills.
  resetAt: z.iso.datetime().nullable(),
  // When a one-time pool runs out.
  expiresAt: z.iso.datetime().nullable(),
})
export type VideoTranscriptUsagePool = z.infer<typeof VideoTranscriptUsagePoolSchema>

export const VideoTranscriptUsageSchema = z.object({
  plan: PlanSchema,
  // Totals over every pool.
  usedMinutes: z.number().min(0),
  limitMinutes: z.number().min(0),
  remainingMinutes: z.number(),
  pools: z.array(VideoTranscriptUsagePoolSchema).optional(),
})
export type VideoTranscriptUsage = z.infer<typeof VideoTranscriptUsageSchema>

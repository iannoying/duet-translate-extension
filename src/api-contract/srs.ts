import { z } from "zod"

/**
 * Spaced repetition: how many cards of the user's most recently used notebase
 * are due, counted in the user's timezone. Null when there is no such notebase.
 */
export const SrsRecentNotebaseScheduleStatusStatsInputSchema = z.object({
  // An IANA timezone, such as "Asia/Shanghai".
  timezone: z.string().min(1),
})
export const SrsRecentNotebaseScheduleStatusStatsOutputSchema = z
  .object({
    notebase: z.object({ id: z.string(), name: z.string() }),
    stats: z.object({
      new: z.number().int().min(0),
      learning: z.number().int().min(0),
      review: z.number().int().min(0),
    }),
  })
  .nullable()
export type SrsRecentNotebaseScheduleStatusStatsOutput = z.infer<
  typeof SrsRecentNotebaseScheduleStatusStatsOutputSchema
>

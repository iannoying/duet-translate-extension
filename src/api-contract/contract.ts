import { eventIterator, oc } from "@orpc/contract"
import { z } from "zod"
import { BillingStatusOutputSchema } from "./billing"
import {
  HostedAiNoteSuggestionStreamInputSchema,
  HostedAiStatusOutputSchema,
  HostedAiStreamPartSchema,
  HostedAiStreamStructuredObjectInputSchema,
  HostedAiStreamTextInputSchema,
} from "./hosted-ai"
import {
  NotebaseCreateInputSchema,
  NotebaseCreateOutputSchema,
  NotebaseGetSchemaInputSchema,
  NotebaseGetSchemaOutputSchema,
  NotebaseListInputSchema,
  NotebaseListOutputSchema,
  NotebaseRowCreateInputSchema,
  NotebaseRowCreateManyInputSchema,
  NotebaseRowCreateManyOutputSchema,
  NotebaseRowCreateOutputSchema,
} from "./notebase"
import {
  SrsRecentNotebaseScheduleStatusStatsInputSchema,
  SrsRecentNotebaseScheduleStatusStatsOutputSchema,
} from "./srs"
import {
  VideoTranscriptCreateInputSchema,
  VideoTranscriptIdInputSchema,
  VideoTranscriptJobSchema,
  VideoTranscriptSubtitlesOutputSchema,
  VideoTranscriptUsageSchema,
} from "./video-transcript"

const streamText = oc
  .input(HostedAiStreamTextInputSchema)
  .output(eventIterator(HostedAiStreamPartSchema))

/**
 * The procedures the extension calls on its backend, served over oRPC's RPC
 * protocol at `${WXT_API_URL}${ORPC_PREFIX}`. Calls carry the session cookie;
 * the extension adds `x-orpc-source: extension` and, while analytics is on,
 * CLIENT_CONTEXT_HEADER. Failures are ORPCErrors, coded as PublicAppErrorCode
 * where the extension handles them.
 */
export const contract = {
  billing: {
    status: oc.output(BillingStatusOutputSchema),
  },
  hostedAi: {
    status: oc.input(z.object({})).output(HostedAiStatusOutputSchema),
    translate: { streamText },
    selectionTranslation: { streamText },
    inputTranslation: { streamText },
    languageDetection: { streamText },
    videoSubtitles: {
      streamText,
      // Splits a transcript into subtitle lines; a larger output budget.
      streamSegmentation: streamText,
    },
    customAction: {
      streamStructuredObject: oc
        .input(HostedAiStreamStructuredObjectInputSchema)
        .output(eventIterator(HostedAiStreamPartSchema)),
    },
    noteSuggestion: {
      streamStructuredObject: oc
        .input(HostedAiNoteSuggestionStreamInputSchema)
        .output(eventIterator(HostedAiStreamPartSchema)),
    },
  },
  notebase: {
    list: oc.input(NotebaseListInputSchema).output(NotebaseListOutputSchema),
    getSchema: oc.input(NotebaseGetSchemaInputSchema).output(NotebaseGetSchemaOutputSchema),
    create: oc.input(NotebaseCreateInputSchema).output(NotebaseCreateOutputSchema),
  },
  notebaseRow: {
    create: oc.input(NotebaseRowCreateInputSchema).output(NotebaseRowCreateOutputSchema),
    createMany: oc
      .input(NotebaseRowCreateManyInputSchema)
      .output(NotebaseRowCreateManyOutputSchema),
  },
  srs: {
    recentNotebaseScheduleStatusStats: oc
      .input(SrsRecentNotebaseScheduleStatusStatsInputSchema)
      .output(SrsRecentNotebaseScheduleStatusStatsOutputSchema),
  },
  videoTranscript: {
    create: oc.input(VideoTranscriptCreateInputSchema).output(VideoTranscriptJobSchema),
    get: oc.input(VideoTranscriptIdInputSchema).output(VideoTranscriptJobSchema),
    getSubtitles: oc
      .input(VideoTranscriptIdInputSchema)
      .output(VideoTranscriptSubtitlesOutputSchema),
    getUsage: oc.output(VideoTranscriptUsageSchema),
  },
}

export type AppContract = typeof contract

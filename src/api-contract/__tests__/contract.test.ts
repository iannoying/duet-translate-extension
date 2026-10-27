import { isContractProcedure } from "@orpc/contract"
import { describe, expect, it } from "vitest"
import {
  contract,
  HostedAiNoteSuggestionStreamInputSchema,
  HostedAiQuotaExhaustedDataSchema,
  HostedAiStatusOutputSchema,
  HostedAiStreamStructuredObjectInputSchema,
  HostedAiStreamTextInputSchema,
  NotebaseCreateInputSchema,
  VideoTranscriptCreateInputSchema,
} from ".."

const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000"

describe("contract", () => {
  it("has a procedure at every path the extension calls", () => {
    const paths = [
      contract.billing.status,
      contract.hostedAi.status,
      contract.hostedAi.translate.streamText,
      contract.hostedAi.selectionTranslation.streamText,
      contract.hostedAi.inputTranslation.streamText,
      contract.hostedAi.languageDetection.streamText,
      contract.hostedAi.videoSubtitles.streamText,
      contract.hostedAi.videoSubtitles.streamSegmentation,
      contract.hostedAi.customAction.streamStructuredObject,
      contract.hostedAi.noteSuggestion.streamStructuredObject,
      contract.notebase.list,
      contract.notebase.getSchema,
      contract.notebase.create,
      contract.notebaseRow.create,
      contract.notebaseRow.createMany,
      contract.srs.recentNotebaseScheduleStatusStats,
      contract.videoTranscript.create,
      contract.videoTranscript.get,
      contract.videoTranscript.getSubtitles,
      contract.videoTranscript.getUsage,
    ]
    for (const procedure of paths) expect(isContractProcedure(procedure)).toBe(true)
  })
})

describe("hosted AI inputs", () => {
  it("defaults the model tier to normal", () => {
    expect(HostedAiStreamTextInputSchema.parse({ prompt: "Hello" }).modelTier).toBe("normal")
  })

  it("refuses a blank prompt, and blank note-suggestion instructions", () => {
    expect(HostedAiStreamTextInputSchema.safeParse({ prompt: "  " }).success).toBe(false)
    expect(
      HostedAiNoteSuggestionStreamInputSchema.safeParse({ instructions: "   ", prompt: "x" })
        .success,
    ).toBe(false)
    expect(HostedAiNoteSuggestionStreamInputSchema.safeParse({ prompt: "x" }).success).toBe(false)
  })

  it("takes a custom action's fields", () => {
    const input = {
      prompt: "Analyze",
      requestId: REQUEST_ID,
      outputSchema: [
        { name: "score", type: "number" },
        { name: "summary", type: "string" },
      ],
    }
    expect(HostedAiStreamStructuredObjectInputSchema.safeParse(input).success).toBe(true)
    expect(
      HostedAiStreamStructuredObjectInputSchema.safeParse({ ...input, outputSchema: [] }).success,
    ).toBe(false)
    expect(
      HostedAiStreamStructuredObjectInputSchema.safeParse({
        ...input,
        outputSchema: [{ name: "flag", type: "boolean" }],
      }).success,
    ).toBe(false)
  })
})

describe("hosted AI outputs", () => {
  const tier = {
    accessAllowed: true,
    available: true,
    unavailableReason: null,
    upgradeTo: null,
    requiresUltra: false,
    modelRevision: "normal-r1",
  }
  const features = Object.fromEntries(
    [
      "pageTranslation",
      "selectionTranslation",
      "inputTranslation",
      "videoSubtitles",
      "languageDetection",
      "customAction",
      "noteSuggestion",
    ].map((feature) => [feature, { normal: tier, advance: { ...tier, available: false } }]),
  )

  it("reads a status with recurring and one-time pools", () => {
    const daily = {
      periodKind: "daily",
      usedPercent: 40,
      resetAt: "2026-08-10T00:00:00.000Z",
      features: ["customAction"],
    }
    const once = {
      periodKind: "once",
      usedPercent: 0,
      expiresAt: "2026-11-25T00:00:00.000Z",
      features: ["pageTranslation"],
    }
    const status = HostedAiStatusOutputSchema.parse({
      credits: [daily],
      pools: [daily, once],
      features,
    })
    expect(status.pools.map((pool) => pool.periodKind)).toEqual(["daily", "once"])
  })

  it("reads the data of a spent quota", () => {
    expect(
      HostedAiQuotaExhaustedDataSchema.parse({
        modelTier: "normal",
        policyId: "ultra-weekly-v1",
        usedPercent: 100,
        resetAt: null,
      }).policyId,
    ).toBe("ultra-weekly-v1")
  })
})

describe("other inputs", () => {
  it("creates a notebase with its columns and first rows", () => {
    const columnId = "223e4567-e89b-42d3-a456-426614174000"
    expect(
      NotebaseCreateInputSchema.safeParse({
        id: REQUEST_ID,
        name: "Words",
        options: {
          initialColumns: [{ id: columnId, name: "Term", config: { type: "string" } }],
          initialRows: [{ id: REQUEST_ID, cells: { [columnId]: "ephemeral" } }],
        },
      }).success,
    ).toBe(true)
  })

  it("transcribes YouTube videos only", () => {
    expect(
      VideoTranscriptCreateInputSchema.safeParse({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        durationSec: 212,
      }).success,
    ).toBe(true)
    expect(
      VideoTranscriptCreateInputSchema.safeParse({
        url: "https://example.com/watch?v=dQw4w9WgXcQ",
        durationSec: 212,
      }).success,
    ).toBe(false)
  })
})

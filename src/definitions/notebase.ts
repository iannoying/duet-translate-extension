import { z } from "zod"

/**
 * How a Notebase column holds its values. Custom actions save into string
 * and number columns; the others are listed so a Notebase that has them can
 * still be read.
 */
export const notebaseColumnConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("string") }),
  z.object({
    type: z.literal("number"),
    // Digits after the decimal point.
    decimal: z.number().int().min(0).max(10),
    format: z.enum(["number", "percent"]),
  }),
  z.object({ type: z.literal("date") }),
  z.object({
    type: z.literal("select"),
    options: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
])
export type NotebaseColumnConfig = z.infer<typeof notebaseColumnConfigSchema>
export type NotebaseColumnType = NotebaseColumnConfig["type"]

export const NOTEBASE_COLUMN_TYPE_INFO = {
  string: { defaultConfig: { type: "string" } },
  number: { defaultConfig: { type: "number", decimal: 0, format: "number" } },
  date: { defaultConfig: { type: "date" } },
  select: { defaultConfig: { type: "select", options: [] } },
} as const satisfies {
  [Type in NotebaseColumnType]: { defaultConfig: Extract<NotebaseColumnConfig, { type: Type }> }
}

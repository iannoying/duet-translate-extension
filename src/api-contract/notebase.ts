import { z } from "zod"
import { notebaseColumnConfigSchema } from "@/definitions"

/**
 * Notebases: the user's tables of saved notes on the website. The extension
 * lists them, reads a schema to map an action's fields to columns, creates a
 * notebase for an action, and adds rows.
 */

export const NotebaseColumnSchema = z.object({
  id: z.string(),
  notebaseId: z.string(),
  name: z.string(),
  config: notebaseColumnConfigSchema,
  position: z.number().int(),
  isPrimary: z.boolean(),
  wrap: z.boolean(),
  width: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type NotebaseColumn = z.infer<typeof NotebaseColumnSchema>

export const NotebaseListInputSchema = z.object({})
export const NotebaseListOutputSchema = z.array(z.object({ id: z.string(), name: z.string() }))
export type NotebaseListOutput = z.infer<typeof NotebaseListOutputSchema>

export const NotebaseGetSchemaInputSchema = z.object({ id: z.string() })
export const NotebaseGetSchemaOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: z.date(),
  // In position order.
  notebaseColumns: z.array(NotebaseColumnSchema),
})
export type NotebaseGetSchemaOutput = z.infer<typeof NotebaseGetSchemaOutputSchema>

// Cell values by column id.
const cellsSchema = z.record(z.string(), z.unknown())

const initialRowSchema = z.object({
  id: z.uuid().optional(),
  cells: cellsSchema,
})

// The client picks the ids, so a retried create is recognized.
export const NotebaseCreateInputSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(200),
  options: z
    .object({
      initialColumns: z
        .array(
          z.object({
            id: z.uuid(),
            name: z.string().trim().min(1).max(200),
            config: notebaseColumnConfigSchema,
          }),
        )
        .optional(),
      initialRow: initialRowSchema.optional(),
      initialRows: z.array(initialRowSchema).optional(),
    })
    .optional(),
})
export type NotebaseCreateInput = z.infer<typeof NotebaseCreateInputSchema>
export const NotebaseCreateOutputSchema = z.object({
  notebase: z.object({ id: z.string(), name: z.string() }),
})

export const NotebaseRowCreateInputSchema = z.object({
  notebaseId: z.string(),
  data: z.object({ cells: cellsSchema }),
})
export type NotebaseRowCreateInput = z.infer<typeof NotebaseRowCreateInputSchema>
export const NotebaseRowCreateOutputSchema = z.object({ id: z.string() })

export const NotebaseRowCreateManyInputSchema = z.object({
  notebaseId: z.string(),
  rows: z.array(z.object({ cells: cellsSchema })).min(1),
})
export type NotebaseRowCreateManyInput = z.infer<typeof NotebaseRowCreateManyInputSchema>
export const NotebaseRowCreateManyOutputSchema = z.object({ ids: z.array(z.string()) })

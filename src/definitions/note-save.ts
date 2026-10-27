// Where in the extension a note was saved from.
export const NOTE_SAVE_SURFACES = ["custom_action", "note_suggestion"] as const
export type NoteSaveSurface = (typeof NOTE_SAVE_SURFACES)[number]

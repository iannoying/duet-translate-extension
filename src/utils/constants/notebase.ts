/**
 * Saving words to a Notebase and reviewing them as flashcards need the
 * Notebase and SRS endpoints, which our API doesn't implement yet. Until it
 * does, the extension hides every way into them: the save button, the review
 * tab, note suggestions and the Notebase settings.
 */
export const NOTEBASE_ENABLED = false

/** Whether settings should list a feature; note suggestions only exist to fill a Notebase. */
export function isFeatureVisible(featureKey: string): boolean {
  return NOTEBASE_ENABLED || featureKey !== "noteSuggestion"
}

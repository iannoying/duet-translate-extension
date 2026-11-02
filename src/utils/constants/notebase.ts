/**
 * Saving words to a Notebase and reviewing them as flashcards: the save
 * button, the review tab, note suggestions and the Notebase settings. They
 * need the API's Notebase and SRS procedures (duet-translate-api, since
 * 2026-10-31); setting this to false hides every way into them again.
 */
export const NOTEBASE_ENABLED = true

/** Whether settings should list a feature; note suggestions only exist to fill a Notebase. */
export function isFeatureVisible(featureKey: string): boolean {
  return NOTEBASE_ENABLED || featureKey !== "noteSuggestion"
}

/**
 * Migration script from v115 to v116
 * - Translations now follow the page's own text color by default. Configs
 *   still on the old install-time preset (`textColor`, a fixed green) move to
 *   `default`, which inherits the color of the surrounding text.
 *
 * Only the untouched install default is rewritten: a custom CSS style
 * (`isCustom: true`) and every other preset are kept as chosen.
 *
 * Idempotent: a config that needs no change is returned by identity.
 *
 * IMPORTANT: The default is hardcoded inline. Migration scripts are frozen
 * snapshots - never import constants, helpers, or shared types.
 */
export function migrate(oldConfig: any): any {
  const pageTranslation = oldConfig?.pageTranslation
  if (!pageTranslation || typeof pageTranslation !== "object" || Array.isArray(pageTranslation)) {
    return oldConfig
  }

  const style = pageTranslation.translationNodeStyle
  if (
    !style ||
    typeof style !== "object" ||
    Array.isArray(style) ||
    style.preset !== "textColor" ||
    style.isCustom === true
  ) {
    return oldConfig
  }

  return {
    ...oldConfig,
    pageTranslation: {
      ...pageTranslation,
      translationNodeStyle: { ...style, preset: "default" },
    },
  }
}

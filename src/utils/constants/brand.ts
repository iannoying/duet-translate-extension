/**
 * Everything that names the product or points people at its channels. Leave a
 * channel undefined until it exists: the UI that links to it hides itself.
 */
export const BRAND = {
  name: "Duet Translate",
  /** Used in file names and in messages exchanged with the website. */
  slug: "duet-translate",
  /** Required by the GPL: where users get this extension's source. */
  sourceRepoUrl: "https://github.com/iannoying/duet-translate-extension",
  supportEmail: undefined as string | undefined,
  discordInviteUrl: undefined as string | undefined,
  /** Origin of the Featurebase portal for feedback, roadmap and tickets. */
  feedbackPortalOrigin: undefined as string | undefined,
  /** Store listings, used for "rate us" links. */
  chromeWebStoreId: undefined as string | undefined,
  edgeAddOnsId: undefined as string | undefined,
  firefoxAddOnSlug: undefined as string | undefined,
} as const

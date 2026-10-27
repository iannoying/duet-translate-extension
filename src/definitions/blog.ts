import { z } from "zod"
import { getBilibiliVideoIdFromUrl } from "./video"

// MAJOR.MINOR.PATCH, without leading zeros, prefixes or suffixes.
export const semanticVersionSchema = z
  .string()
  .regex(
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/,
    "Must be a valid semantic version (MAJOR.MINOR.PATCH)",
  )

export const bilibiliVideoUrlSchema = z
  .string()
  .refine((url) => getBilibiliVideoIdFromUrl(url) !== null, "Expected a bilibili video URL")

export const blogPostTypeSchema = z.enum(["update", "promotion"])
export type BlogPostType = z.infer<typeof blogPostTypeSchema>

/**
 * The newest post `GET {website}/api/blog/latest?locale=&extensionVersion=`
 * returns for the locale (one the extension version can show), or null.
 */
export const latestBlogPostSchema = z.object({
  date: z.coerce.date(),
  title: z.string(),
  description: z.string().nullish(),
  // A path on the website.
  url: z.string(),
  // Opened instead of `url` when set.
  urlOverride: z.string().nullish(),
  imageUrl: z.string().nullish(),
  // A bilibili video shown instead of the image.
  videoUrl: z.string().nullish(),
  type: blogPostTypeSchema.nullish(),
  extensionVersion: semanticVersionSchema.nullish(),
})
export type LatestBlogPost = z.infer<typeof latestBlogPostSchema>

export const latestBlogResponseSchema = latestBlogPostSchema.nullable()

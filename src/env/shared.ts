import { z } from "zod"

// Fallbacks for development only. A production build must name its own backend
// explicitly (see findMissingProductionEnv), so nothing ships pointing at a
// server we do not run.
export const LOCAL_EXTENSION_ENV_DEFAULTS = {
  WXT_API_URL: "https://localhost:4433",
  WXT_WEBSITE_URL: "https://localhost:8877",
  WXT_OFFICIAL_SITE_ORIGINS: "http://localhost:8888,https://localhost:8877",
  WXT_AUTH_COOKIE_DOMAINS: "localhost",
} as const

export const REQUIRED_PRODUCTION_ENV_KEYS = Object.keys(
  LOCAL_EXTENSION_ENV_DEFAULTS,
) as (keyof typeof LOCAL_EXTENSION_ENV_DEFAULTS)[]

type RawEnvValue = string | boolean | undefined
export type RawExtensionEnv = Record<string, RawEnvValue>

const rawBooleanSchema = z
  .union([z.stringbool({ truthy: ["true"], falsy: ["false"] }), z.boolean()])
  .optional()

const strictStringSchema = z.string().refine((value) => value === value.trim(), {
  message: "must not include leading or trailing whitespace",
})

const strictUrlSchema = strictStringSchema.pipe(z.url()).refine((value) => !value.endsWith("/"), {
  message: "must not end with a trailing slash",
})

const strictOriginSchema = strictStringSchema
  .pipe(z.url())
  .refine((value) => new URL(value).origin === value, {
    message: "must be an origin without a trailing slash or path",
  })

const strictCookieDomainSchema = strictStringSchema
  .refine((value) => !value.startsWith("."), {
    message: "must not start with '.'",
  })
  .refine((value) => !/\s/.test(value), {
    message: "must not contain whitespace",
  })
  .refine((value) => !value.includes("://"), {
    message: "must not include a protocol",
  })
  .refine((value) => !value.includes("/") && !value.includes(":"), {
    message: "must not include a path or port",
  })

const optionalNonEmptyStringSchema = z.string().min(1).optional()
const optionalStrictUrlSchema = strictUrlSchema.optional()

function parseCommaSeparatedEntries(
  value: string,
  ctx: z.RefinementCtx,
  entrySchema: z.ZodTypeAny,
) {
  const parsedEntries: string[] = []

  for (const [index, entry] of value.split(",").entries()) {
    const result = entrySchema.safeParse(entry)

    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: [index, ...issue.path],
        })
      }

      return z.NEVER
    }

    parsedEntries.push(result.data as string)
  }

  return parsedEntries
}

export function resolveExtensionEnv(rawEnv: RawExtensionEnv) {
  const defaults = LOCAL_EXTENSION_ENV_DEFAULTS

  return {
    ...rawEnv,
    WXT_API_URL: rawEnv.WXT_API_URL ?? defaults.WXT_API_URL,
    WXT_WEBSITE_URL: rawEnv.WXT_WEBSITE_URL ?? defaults.WXT_WEBSITE_URL,
    WXT_OFFICIAL_SITE_ORIGINS:
      rawEnv.WXT_OFFICIAL_SITE_ORIGINS ?? defaults.WXT_OFFICIAL_SITE_ORIGINS,
    WXT_AUTH_COOKIE_DOMAINS: rawEnv.WXT_AUTH_COOKIE_DOMAINS ?? defaults.WXT_AUTH_COOKIE_DOMAINS,
  }
}

/** The backend URLs a production build was given no value for. */
export function findMissingProductionEnv(rawEnv: RawExtensionEnv) {
  return REQUIRED_PRODUCTION_ENV_KEYS.filter((key) => {
    const value = rawEnv[key]
    return typeof value !== "string" || value.trim() === ""
  })
}

export function createExtensionClientEnvSchema(isProd: boolean, skipRequiredProductionEnv = false) {
  const requiresProductionEnv = isProd && !skipRequiredProductionEnv

  return {
    WXT_API_URL: strictUrlSchema,
    WXT_WEBSITE_URL: strictUrlSchema,
    WXT_OFFICIAL_SITE_ORIGINS: z
      .string()
      .transform((value, ctx) => parseCommaSeparatedEntries(value, ctx, strictOriginSchema)),
    WXT_AUTH_COOKIE_DOMAINS: z
      .string()
      .transform((value, ctx) => parseCommaSeparatedEntries(value, ctx, strictCookieDomainSchema)),
    WXT_GOOGLE_CLIENT_ID: requiresProductionEnv ? z.string().min(1) : optionalNonEmptyStringSchema,
    // Optional: analytics stay off unless both are set.
    WXT_POSTHOG_HOST: optionalStrictUrlSchema,
    WXT_POSTHOG_API_KEY: optionalNonEmptyStringSchema,
    WXT_POSTHOG_TEST_UUID: optionalNonEmptyStringSchema,
    WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED: rawBooleanSchema.default(false),
  } satisfies Record<string, z.ZodType>
}

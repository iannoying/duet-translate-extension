import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  createExtensionClientEnvSchema,
  findMissingProductionEnv,
  LOCAL_EXTENSION_ENV_DEFAULTS,
  resolveExtensionEnv,
} from "../shared"

const PRODUCTION_REQUIRED_ENV = {
  WXT_GOOGLE_CLIENT_ID: "test-google-client-id",
} as const

function parseResolvedExtensionEnv(
  rawEnv: Record<string, string | boolean | undefined>,
  isProd = false,
  skipRequiredProductionEnv = false,
) {
  return z
    .object(createExtensionClientEnvSchema(isProd, skipRequiredProductionEnv))
    .parse(resolveExtensionEnv(rawEnv))
}

describe("extension env resolution", () => {
  it("falls back to localhost defaults", () => {
    expect(resolveExtensionEnv({})).toEqual(LOCAL_EXTENSION_ENV_DEFAULTS)
    expect(
      resolveExtensionEnv({
        WXT_USE_LOCAL_PACKAGES: "true",
      }),
    ).toMatchObject({
      ...LOCAL_EXTENSION_ENV_DEFAULTS,
      WXT_USE_LOCAL_PACKAGES: "true",
    })
  })

  it("lets explicit env vars override the selected defaults", () => {
    expect(
      resolveExtensionEnv({
        WXT_USE_LOCAL_PACKAGES: "true",
        WXT_API_URL: "https://preview-api.readfrog.app",
        WXT_AUTH_COOKIE_DOMAINS: "preview.readfrog.app",
      }),
    ).toMatchObject({
      ...LOCAL_EXTENSION_ENV_DEFAULTS,
      WXT_USE_LOCAL_PACKAGES: "true",
      WXT_API_URL: "https://preview-api.readfrog.app",
      WXT_AUTH_COOKIE_DOMAINS: "preview.readfrog.app",
    })
  })

  it("passes through unrelated env vars untouched", () => {
    expect(
      resolveExtensionEnv({
        WXT_POSTHOG_API_KEY: "phc_test",
        WXT_POSTHOG_TEST_UUID: "00000000-0000-0000-0000-000000000001",
      }),
    ).toMatchObject({
      ...LOCAL_EXTENSION_ENV_DEFAULTS,
      WXT_POSTHOG_API_KEY: "phc_test",
      WXT_POSTHOG_TEST_UUID: "00000000-0000-0000-0000-000000000001",
    })
  })
})

describe("extension env parsing", () => {
  it("accepts canonical urls, origins, and cookie domains", () => {
    expect(
      parseResolvedExtensionEnv({
        WXT_WEBSITE_URL: "https://www.readfrog.app",
        WXT_OFFICIAL_SITE_ORIGINS: "https://readfrog.app,https://www.readfrog.app",
        WXT_AUTH_COOKIE_DOMAINS: "readfrog.app,localhost",
      }),
    ).toEqual({
      WXT_API_URL: LOCAL_EXTENSION_ENV_DEFAULTS.WXT_API_URL,
      WXT_WEBSITE_URL: "https://www.readfrog.app",
      WXT_OFFICIAL_SITE_ORIGINS: ["https://readfrog.app", "https://www.readfrog.app"],
      WXT_AUTH_COOKIE_DOMAINS: ["readfrog.app", "localhost"],
      WXT_GOOGLE_CLIENT_ID: undefined,
      WXT_POSTHOG_HOST: undefined,
      WXT_POSTHOG_API_KEY: undefined,
      WXT_POSTHOG_TEST_UUID: undefined,
      WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED: false,
    })
  })

  it("rejects urls with trailing slashes", () => {
    expect(() =>
      parseResolvedExtensionEnv({
        WXT_API_URL: "https://api.readfrog.app/",
      }),
    ).toThrowError("must not end with a trailing slash")
  })

  it("rejects origin entries that include a trailing slash or path", () => {
    expect(() =>
      parseResolvedExtensionEnv({
        WXT_OFFICIAL_SITE_ORIGINS: "https://readfrog.app/,https://www.readfrog.app",
      }),
    ).toThrowError("must be an origin without a trailing slash or path")

    expect(() =>
      parseResolvedExtensionEnv({
        WXT_OFFICIAL_SITE_ORIGINS: "https://readfrog.app/docs",
      }),
    ).toThrowError("must be an origin without a trailing slash or path")
  })

  it("rejects cookie domains with leading dots", () => {
    expect(() =>
      parseResolvedExtensionEnv({
        WXT_AUTH_COOKIE_DOMAINS: ".readfrog.app,localhost",
      }),
    ).toThrowError("must not start with '.'")
  })

  it("rejects comma-separated entries with spaces", () => {
    expect(() =>
      parseResolvedExtensionEnv({
        WXT_OFFICIAL_SITE_ORIGINS: "https://readfrog.app, https://www.readfrog.app",
      }),
    ).toThrowError("must not include leading or trailing whitespace")
  })

  it("requires the Google client id when PROD is true", () => {
    expect(() => parseResolvedExtensionEnv({}, true)).toThrowError(
      "expected string, received undefined",
    )
  })

  it("leaves PostHog optional when PROD is true", () => {
    const parsed = parseResolvedExtensionEnv({ ...PRODUCTION_REQUIRED_ENV }, true)
    expect(parsed.WXT_GOOGLE_CLIENT_ID).toBe(PRODUCTION_REQUIRED_ENV.WXT_GOOGLE_CLIENT_ID)
    expect(parsed.WXT_POSTHOG_HOST).toBeUndefined()
    expect(parsed.WXT_POSTHOG_API_KEY).toBeUndefined()
  })

  it("lets production parsing skip the required Google client id", () => {
    expect(parseResolvedExtensionEnv({}, true, true).WXT_GOOGLE_CLIENT_ID).toBeUndefined()
  })

  it("lists the backend URLs a production build is missing", () => {
    expect(findMissingProductionEnv({})).toEqual([
      "WXT_API_URL",
      "WXT_WEBSITE_URL",
      "WXT_OFFICIAL_SITE_ORIGINS",
      "WXT_AUTH_COOKIE_DOMAINS",
    ])
    expect(
      findMissingProductionEnv({
        WXT_API_URL: "https://api.example.com",
        WXT_WEBSITE_URL: " ",
        WXT_OFFICIAL_SITE_ORIGINS: "https://example.com",
        WXT_AUTH_COOKIE_DOMAINS: "example.com",
      }),
    ).toEqual(["WXT_WEBSITE_URL"])
  })

  it("parses WXT_USE_LOCAL_PACKAGES strictly with zod stringbool", () => {
    expect(
      resolveExtensionEnv({
        WXT_USE_LOCAL_PACKAGES: true,
      }),
    ).toMatchObject({
      ...LOCAL_EXTENSION_ENV_DEFAULTS,
      WXT_USE_LOCAL_PACKAGES: true,
    })

    expect(() =>
      resolveExtensionEnv({
        WXT_USE_LOCAL_PACKAGES: "yes",
      }),
    ).toThrowError(/Invalid/)
  })

  it("parses the analytics daily feature cache flag strictly", () => {
    expect(
      parseResolvedExtensionEnv({
        WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED: "true",
      }).WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED,
    ).toBe(true)
    expect(
      parseResolvedExtensionEnv({
        WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED: "false",
      }).WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED,
    ).toBe(false)
    expect(() =>
      parseResolvedExtensionEnv({
        WXT_ANALYTICS_DAILY_FEATURE_CACHE_ENABLED: "yes",
      }),
    ).toThrowError(/Invalid/)
  })
})

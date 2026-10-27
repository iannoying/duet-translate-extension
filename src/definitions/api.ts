/**
 * Where the extension finds its backend's services, relative to WXT_API_URL.
 */

// The oRPC endpoint the API contract is served at.
export const ORPC_PREFIX = "/api/rpc"

// The better-auth endpoint.
export const AUTH_BASE_PATH = "/api/auth"

// Parts of the names of the cookies that carry a signed-in session; a change
// to one of them means the account changed. They match the `__Secure-`
// prefixed names too.
export const AUTH_COOKIE_PATTERNS: readonly string[] = [
  "better-auth.session_token",
  "better-auth.session_data",
]

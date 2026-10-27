const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
])
const YOUTUBE_ID_PATH_PREFIXES = ["shorts", "embed", "live", "v"]
const VIDEO_ID = /^[\w-]+$/

/**
 * The YouTube video a URL plays (`watch?v=`, `youtu.be/`, `/shorts/`,
 * `/embed/`, `/live/`), or null. The backend checks
 * `videoTranscript.create({ url })` with the same rule.
 */
export function getVideoIdFromUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null

  const host = parsed.hostname.toLowerCase()
  const segments = parsed.pathname.split("/").filter(Boolean)
  let id: string | null | undefined
  if (host === "youtu.be") {
    id = segments[0]
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (segments[0] === "watch") id = parsed.searchParams.get("v")
    else if (segments[0] && YOUTUBE_ID_PATH_PREFIXES.includes(segments[0])) id = segments[1]
  }
  return id && VIDEO_ID.test(id) ? id : null
}

const BILIBILI_HOSTS = new Set(["bilibili.com", "www.bilibili.com", "m.bilibili.com"])
const BILIBILI_VIDEO_PATH = /^\/video\/(BV[0-9A-Za-z]{10})(?:\/|$)/

// The BVID of a bilibili video page URL, or null.
export function getBilibiliVideoIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null
    if (!BILIBILI_HOSTS.has(parsed.hostname.toLowerCase())) return null
    return BILIBILI_VIDEO_PATH.exec(parsed.pathname)?.[1] ?? null
  } catch {
    return null
  }
}

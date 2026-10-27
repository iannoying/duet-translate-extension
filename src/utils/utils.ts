import { browser } from "#imports"
import { BRAND } from "./constants/brand"

const THOUSANDS_SEPARATOR_PATTERN = /\B(?=(?:\d{3})+(?!\d))/g

export function isNonNullish<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined
}

export function getActiveTabUrl() {
  return browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]!.url)
}

/**
 * Get value from map; if not exists, create it with factory and return it.
 */
export function ensureKeyInMap<K, V>(map: Map<K, V>, key: K, factory: () => V): V {
  let val = map.get(key)
  if (val === undefined) {
    val = factory()
    map.set(key, val)
  }
  return val
}

export function addThousandsSeparator(num: number) {
  return num.toString().replace(THOUSANDS_SEPARATOR_PATTERN, ",")
}

export function numberToPercentage(num: number) {
  return `${(num * 100).toFixed(2)}%`
}

export function getDateFromDaysBack(daysBack: number) {
  const date = new Date()
  date.setDate(date.getDate() - daysBack)
  return date
}

export interface StoreListings {
  chromeWebStoreId?: string
  edgeAddOnsId?: string
  firefoxAddOnSlug?: string
}

/**
 * The store this copy was installed from, read off the extension id each store assigns.
 *
 * The build target cannot say: Chrome and Edge run the same build, Edge users can install
 * from the Chrome Web Store, and nothing stops the Chrome zip from being uploaded to Edge.
 * Any other id — an unpacked dev build, or Firefox's gecko id — falls back to the target.
 */
function getInstalledStore(listings: StoreListings): "chrome" | "edge" | "firefox" {
  if (listings.edgeAddOnsId && browser.runtime.id === listings.edgeAddOnsId) return "edge"
  if (listings.chromeWebStoreId && browser.runtime.id === listings.chromeWebStoreId) {
    return "chrome"
  }
  if (import.meta.env.BROWSER === "edge" || import.meta.env.BROWSER === "firefox") {
    return import.meta.env.BROWSER
  }
  return "chrome"
}

/**
 * Deep links into each store's reviews UI rather than its landing page, so the user does
 * not have to go hunting for where to leave one. Undefined while the store this copy came
 * from has no listing yet, so callers can hide their "rate us" entry.
 *
 * Chrome and AMO both have a real `/reviews` route. Edge has none (`/reviews` redirects
 * back to the product page), so Edge gets the plain listing.
 */
export function getReviewUrl(
  utmSource: string = "extension",
  listings: StoreListings = BRAND,
): string | undefined {
  const store = getInstalledStore(listings)
  if (store === "edge") {
    return listings.edgeAddOnsId
      ? `https://microsoftedge.microsoft.com/addons/detail/${listings.edgeAddOnsId}?utm_source=${utmSource}`
      : undefined
  }
  if (store === "firefox") {
    return listings.firefoxAddOnSlug
      ? `https://addons.mozilla.org/firefox/addon/${listings.firefoxAddOnSlug}/reviews/?utm_source=${utmSource}`
      : undefined
  }
  return listings.chromeWebStoreId
    ? `https://chromewebstore.google.com/detail/${listings.chromeWebStoreId}/reviews?utm_source=${utmSource}`
    : undefined
}

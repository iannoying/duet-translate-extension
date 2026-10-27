import { browser } from "#imports"
import { BRAND } from "./brand"

export const APP_NAME = BRAND.name
const manifest = browser.runtime.getManifest()
export const EXTENSION_VERSION = manifest.version

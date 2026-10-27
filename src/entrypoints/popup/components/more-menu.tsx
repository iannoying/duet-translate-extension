import { Icon } from "@iconify/react"
import { useAtomValue } from "jotai"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/base-ui/dropdown-menu"
import { env } from "@/env"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { BRAND } from "@/utils/constants/brand"
import { buildFeaturebasePortalUrl } from "@/utils/featurebase"
import { i18n } from "@/utils/i18n"
import { resolveUiLocale } from "@/utils/i18n/locale-map"
import { getReviewUrl } from "@/utils/utils"

function openExternal(url: string | undefined) {
  if (!url) return
  window.open(url, "_blank", "noopener,noreferrer")
}

/**
 * Grouped the same way as the options page it mirrors: what to read or reach us through
 * under Help, and where to find the other users under Community.
 */
export function MoreMenu() {
  const uiLanguage = useAtomValue(configFieldsAtomMap.uiLanguage)
  const locale = resolveUiLocale(uiLanguage)
  const featureRequestUrl = buildFeaturebasePortalUrl({ destination: "feedback", locale })
  const bugReportUrl = buildFeaturebasePortalUrl({ destination: "tickets", locale })
  const reviewUrl = getReviewUrl("popup")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 hover:bg-neutral-300 dark:hover:bg-neutral-700"
          />
        }
      >
        <Icon icon="tabler:dots" className="size-4" strokeWidth={1.6} />
        <span className="text-[13px] font-medium">{i18n.t("popup.more.title")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-fit">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{i18n.t("popup.more.help")}</DropdownMenuLabel>

          <DropdownMenuItem
            // The docs site picks its own locale from the browser.
            onClick={() => openExternal(`${env.WXT_WEBSITE_URL}/docs`)}
            className="cursor-pointer"
          >
            <Icon icon="tabler:help-circle" className="size-4" strokeWidth={1.6} />
            {i18n.t("popup.more.tutorial")}
          </DropdownMenuItem>

          {BRAND.supportEmail && (
            <DropdownMenuItem
              onClick={() => openExternal(`mailto:${BRAND.supportEmail}`)}
              className="cursor-pointer"
            >
              <Icon icon="tabler:mail" className="size-4" strokeWidth={1.6} />
              {i18n.t("popup.more.emailUs")}
            </DropdownMenuItem>
          )}

          {featureRequestUrl && (
            <DropdownMenuItem
              // The portal's own root is the feedback board; `tickets` is the support queue.
              onClick={() => openExternal(featureRequestUrl)}
              className="cursor-pointer"
            >
              <Icon icon="tabler:message-circle" className="size-4" strokeWidth={1.6} />
              {i18n.t("popup.more.featureRequest")}
            </DropdownMenuItem>
          )}

          {bugReportUrl && (
            <DropdownMenuItem onClick={() => openExternal(bugReportUrl)} className="cursor-pointer">
              <Icon icon="tabler:bug" className="size-4" strokeWidth={1.6} />
              {i18n.t("popup.more.bugReport")}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>{i18n.t("popup.more.community")}</DropdownMenuLabel>

          {BRAND.discordInviteUrl && (
            <DropdownMenuItem
              onClick={() => openExternal(BRAND.discordInviteUrl)}
              className="cursor-pointer"
            >
              <Icon icon="logos:discord-icon" className="size-4" strokeWidth={1.6} />
              {i18n.t("popup.more.joinDiscord")}
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={() => openExternal(BRAND.sourceRepoUrl)}
            className="cursor-pointer"
          >
            <Icon icon="fa7-brands:github" className="size-4" strokeWidth={1.6} />
            {i18n.t("popup.more.starGithub")}
          </DropdownMenuItem>

          {reviewUrl && (
            <DropdownMenuItem onClick={() => openExternal(reviewUrl)} className="cursor-pointer">
              <Icon icon="tabler:star" className="size-4" strokeWidth={1.6} />
              {i18n.t("popup.more.rateUs")}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

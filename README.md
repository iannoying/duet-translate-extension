# Duet Translate（懂你翻译）

AI bilingual translation for web pages and YouTube, Netflix and X subtitles, with word saving and flashcard review.

用 AI 双语对照翻译网页，以及 YouTube、Netflix、X 的视频字幕；遇到生词一键保存，用闪卡复习。

## Development

```bash
pnpm install
pnpm dev            # Chrome
pnpm dev:firefox    # Firefox
pnpm test
pnpm lint
```

A production build needs your own backend. Set these before `pnpm build` (see `.env.example`):

- `WXT_API_URL`, `WXT_WEBSITE_URL`, `WXT_OFFICIAL_SITE_ORIGINS`, `WXT_AUTH_COOKIE_DOMAINS`
- `WXT_GOOGLE_CLIENT_ID`
- Optional: `WXT_POSTHOG_HOST` and `WXT_POSTHOG_API_KEY` to turn on analytics

Product name, support channels and store listings live in `src/utils/constants/brand.ts`. A channel left undefined there is hidden in the UI.

## License and origin

This project is a modified version of [Read Frog](https://github.com/mengxi-ream/read-frog), © its contributors, licensed under the GNU General Public License v3.0. This modified version is also distributed under the GPLv3; see [LICENSE](./LICENSE).

"Read Frog" and "陪读蛙" are names of the original project and are not used to identify this product.

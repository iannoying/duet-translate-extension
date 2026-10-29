# AGENTS.md

## Testing Notes

- `src/utils/host/translate/api/__tests__/free-api.test.ts` depends on live external translation services.
- When running tests locally as an AI agent, set `SKIP_FREE_API=true`.
- If `SKIP_FREE_API=true` is set, treat `free-api.test.ts` as intentionally skipped during local validation.

## PR Notes

- PR titles must use conventional commit format, such as `fix(subtitles): ...`; avoid extra prefixes like `[codex]`.
- User-facing fixes and features should include a `.changeset/*.md` file for `duet-translate` unless the change intentionally does not need a release. use conventional commit format for the changeset content.

## Dependency Patches

- `patches/` holds pnpm patches registered under `patchedDependencies` in `pnpm-workspace.yaml`. Each patch is pinned to one exact version.
- `@webext-core/messaging@4.0.0`: makes `tabs.sendMessage` read `chrome.runtime.lastError` and reject. Without it, a message to a tab with no content script (e.g. a tab opened before install or reload) shows up in `chrome://extensions` as `Uncaught (in promise) Error: No response`.
- Before upgrading a patched dependency (including Dependabot PRs), check whether the new upstream release already fixes the issue. If it does, remove the patch file and its `patchedDependencies` entry. If it does not, regenerate the patch for the new version with `pnpm patch <pkg>@<version>` and `pnpm patch-commit`, then rerun `src/utils/__tests__/message.test.ts`.

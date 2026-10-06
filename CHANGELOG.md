# Changelog

## 1.8.6

- Aligned with upstream [`@ex-machina/opencode-anthropic-auth` v1.8.6](https://github.com/ex-machina-co/opencode-anthropic-auth/releases/tag/v1.8.6).
- Reported Claude Code version: `2.1.87` → `2.1.284`. Anthropic gates newer models on this value (upstream 1.8.2, 1.8.5, 1.8.6).
- Added the `ANTHROPIC_CLAUDE_CODE_VERSION` environment variable to override the reported version without waiting for a release. Invalid values are ignored and shown as an error notification; values older than the bundled version are used and shown as a warning (upstream 1.8.4).
- Upstream 1.8.3's SSE chunk-boundary fix does not apply: this package parses streams with `@anthropic-ai/sdk` and remaps tool names on parsed events.
- Added a daily upstream-sync workflow that opens a review pull request for each new upstream release, and a publish workflow that releases version changes merged to `main` to npm.

## 1.8.2

- Fixed affected Claude Plan requests on Pi AI `0.84.3+` by removing the built-in Anthropic provider's `compat.allowedFallbackModels` metadata from cloned `claude-plan` models. The clone is sanitized without mutating Pi's catalog, and all unrelated model and compatibility metadata is preserved.
- Added provider, outgoing-payload, and actual Pi `0.84.4` extension-loader regressions using synthetic OAuth and mocked Anthropic SSE transport.
- Updated the release-test target from Pi `0.82.1` to `0.84.4`.

This patch does not add the `server-side-fallback-2026-07-01` beta, change OAuth behavior, or introduce speculative protocol fingerprinting.

## 1.8.1

- Initial Pi adaptation aligned with `@ex-machina/opencode-anthropic-auth` `v1.8.1`.

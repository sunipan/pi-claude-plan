# Changelog

## 1.8.2

- Fixed affected Claude Plan requests on Pi AI `0.84.3+` by removing the built-in Anthropic provider's `compat.allowedFallbackModels` metadata from cloned `claude-plan` models. The clone is sanitized without mutating Pi's catalog, and all unrelated model and compatibility metadata is preserved.
- Added provider, outgoing-payload, and actual Pi `0.84.4` extension-loader regressions using synthetic OAuth and mocked Anthropic SSE transport.
- Updated the release-test target from Pi `0.82.1` to `0.84.4`.

This patch does not add the `server-side-fallback-2026-07-01` beta, change OAuth behavior, or introduce speculative protocol fingerprinting.

## 1.8.1

- Initial Pi adaptation aligned with `@ex-machina/opencode-anthropic-auth` `v1.8.1`.

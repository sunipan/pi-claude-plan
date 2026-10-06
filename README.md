# pi-claude-plan

An unofficial [Pi](https://github.com/earendil-works/pi) package that registers a separate provider named **`claude-plan`**. It attempts to route Pi requests against Claude Pro/Max plan limits using a separate OAuth credential and the request behavior adapted from [`ex-machina-co/opencode-anthropic-auth`](https://github.com/ex-machina-co/opencode-anthropic-auth).

## Important warning

> [!WARNING]
> This package comes with no guarantees. You might be banned for breaking the Terms of Service, or you might not be. The maintainers do not work at Anthropic and are not attorneys. Use your best judgment, use this at your own risk, and do not abuse subscriptions.

The zero costs shown by Pi are local display metadata only. Check your Anthropic account and plan independently.

## Install

Install the pinned npm release:

```sh
pi install npm:pi-claude-plan@1.8.6
```

Alternatively, install the matching GitHub release:

```sh
pi install git:github.com/sunipan/pi-claude-plan@v1.8.6
```

Restart Pi or run:

```text
/reload
/login claude-plan
```

Complete authorization in the browser, then select a `claude-plan/...` model using `/model`.

Each user must complete their own OAuth login. No user credentials are committed to or distributed with this repository. The extension handles credentials stored by Pi, exchanges or refreshes them with `platform.claude.com`, and sends authenticated requests—including conversation context—to `api.anthropic.com`. Pi stores the credential separately under the provider ID `claude-plan`; it does not replace the built-in `anthropic` credential.

To remove the npm package:

```sh
pi remove npm:pi-claude-plan
```

## Updating

Releases are deliberately pinned. Install a newer version explicitly after reviewing its source and release notes:

```sh
pi install npm:pi-claude-plan@X.Y.Z
```

The matching Git tag can also be installed as `git:github.com/sunipan/pi-claude-plan@vX.Y.Z`.

## Versioning and upstream alignment

The request behavior is adapted from [`@ex-machina/opencode-anthropic-auth` v1.8.6](https://github.com/ex-machina-co/opencode-anthropic-auth/releases/tag/v1.8.6). Package versions follow upstream releases; Pi-only patches take the next unused patch version, so a package version does not always have a matching upstream release.

A daily GitHub Actions workflow checks for new upstream releases. For each one it opens a pull request that syncs the reported Claude Code version, runs the offline validation suite, and lists any other upstream source changes for manual review. Merging a version change to `main` publishes it to npm with provenance and creates the matching GitHub release.

This package is not published, maintained, or supported by Ex Machina. Upstream changes require separate compatibility review and testing before adoption.

## Request behavior

The provider clones Pi's installed built-in Anthropic model catalog while preserving the separate `claude-plan` provider ID. It uses:

- a separate Claude Pro/Max PKCE OAuth flow and credential;
- Anthropic SDK `0.91.1` with OAuth bearer authentication;
- the reference Claude CLI query, user agent, beta flags, and identity block;
- a computed billing/CCH block;
- Pi-specific system-prompt sanitization; and
- reversible `mcp_` tool-name mapping.

Streaming delegates message conversion and event handling to Pi's Anthropic Messages implementation, preserving images, tool results, thinking signatures, adaptive and budget thinking, cancellation, retries, hooks, usage, and errors as closely as possible.

### Reported Claude Code version

Anthropic gates model access on the Claude Code version reported in the `user-agent` header and billing block. This release reports `2.1.284`. To report a different version without waiting for a release, set `ANTHROPIC_CLAUDE_CODE_VERSION` to a `major.minor.patch` value and restart Pi. Invalid values are ignored and shown as an error; versions older than the bundled one are used but shown as a warning, since they can make newer models reject requests.

### Pi compatibility

This package targets Pi AI and Pi Coding Agent `0.84.4` on Node.js `22.22.1`. Pi AI `0.84.3` introduced Anthropic fallback-routing metadata that `pi-claude-plan` `1.8.1` copied without the matching transport beta, causing Claude to reject affected requests with `fallbacks: Extra inputs are not permitted`. Version `1.8.2` removes only that provider-specific metadata from its cloned models and leaves Pi's built-in catalog unchanged.

| Pi runtime | `pi-claude-plan` | Status |
| --- | --- | --- |
| `0.84.4` | `1.8.6` | Automated provider, payload, and actual-loader validation |
| `0.84.4` | `1.8.2` | Automated provider, payload, actual-loader, and credential-safe live validation |
| `0.84.3` | `1.8.2` | Fix applies to the introduced metadata; not a separate release-test lane |
| `0.82.1` | `1.8.1` | Previous development target; not release-tested for `1.8.2` |

Later Pi, Anthropic, or upstream changes require revalidation. No speculative protocol-header or OAuth changes are included in this patch.

## Development and offline validation

Requires Node.js 22.19 or newer:

```sh
npm install
npm run check
npm audit --omit=dev
```

Automated tests use synthetic credentials and mocked HTTP responses. They do not perform OAuth login or live model inference. The `1.8.2` release gate additionally used bounded, no-session/no-tools live smoke requests for `claude-fable-5`, `claude-opus-5`, and the `claude-haiku-4-5` control without printing credentials or request bodies.

## Attribution

This project is a Pi adaptation of ideas and request transformations from [`ex-machina-co/opencode-anthropic-auth`](https://github.com/ex-machina-co/opencode-anthropic-auth), copyright © 2026 Ex Machina and distributed under the MIT License. See [`NOTICE.md`](NOTICE.md) and [`LICENSE`](LICENSE).

This repository is independent and is not affiliated with, endorsed by, or supported by Anthropic, Ex Machina, or the Pi maintainers.

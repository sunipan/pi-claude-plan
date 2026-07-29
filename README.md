# pi-claude-plan

An unofficial [Pi](https://github.com/earendil-works/pi) package that registers a separate provider named **`claude-plan`**. It attempts to route Pi requests against Claude Pro/Max plan limits using a separate OAuth credential and the request behavior adapted from [`ex-machina-co/opencode-anthropic-auth`](https://github.com/ex-machina-co/opencode-anthropic-auth).

## Important warning

> [!WARNING]
> This package comes with no guarantees. You might be banned for breaking the Terms of Service, or you might not be. The maintainers do not work at Anthropic and are not attorneys. Use your best judgment, use this at your own risk, and do not abuse subscriptions.

The zero costs shown by Pi are local display metadata only. Check your Anthropic account and plan independently.

## Install

Install the pinned npm release:

```sh
pi install npm:pi-claude-plan@1.8.1
```

Alternatively, install the matching GitHub release:

```sh
pi install git:github.com/sunipan/pi-claude-plan@v1.8.1
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

This package's version exactly matches the version of [`@ex-machina/opencode-anthropic-auth`](https://github.com/ex-machina-co/opencode-anthropic-auth) whose behavior it tracks. Version `1.8.1` corresponds to upstream release [`v1.8.1`](https://github.com/ex-machina-co/opencode-anthropic-auth/releases/tag/v1.8.1).

A matching version means “adapted against that upstream release,” not that this package is published, maintained, or supported by Ex Machina. A new upstream version will require compatibility review and testing before this package receives the same version.

## Request behavior

The provider clones Pi's installed built-in Anthropic model catalog while preserving the separate `claude-plan` provider ID. It uses:

- a separate Claude Pro/Max PKCE OAuth flow and credential;
- Anthropic SDK `0.91.1` with OAuth bearer authentication;
- the reference Claude CLI query, user agent, beta flags, and identity block;
- a computed billing/CCH block;
- Pi-specific system-prompt sanitization; and
- reversible `mcp_` tool-name mapping.

Streaming delegates message conversion and event handling to Pi's Anthropic Messages implementation, preserving images, tool results, thinking signatures, adaptive and budget thinking, cancellation, retries, hooks, usage, and errors as closely as possible.

The extension currently targets Pi `0.82.1`. Future Pi, Anthropic, or upstream changes may require an update.

## Development and offline validation

Requires Node.js 22.19 or newer:

```sh
npm install
npm run check
npm audit --omit=dev
```

Tests use synthetic credentials and mocked HTTP responses. They do not perform OAuth login or live model inference.

## Attribution

This project is a Pi adaptation of ideas and request transformations from [`ex-machina-co/opencode-anthropic-auth`](https://github.com/ex-machina-co/opencode-anthropic-auth), copyright © 2026 Ex Machina and distributed under the MIT License. See [`NOTICE.md`](NOTICE.md) and [`LICENSE`](LICENSE).

This repository is independent and is not affiliated with, endorsed by, or supported by Anthropic, Ex Machina, or the Pi maintainers.

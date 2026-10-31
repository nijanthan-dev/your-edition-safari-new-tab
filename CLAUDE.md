# Your Edition: rules for Claude Code

Your Edition is a Safari new tab extension. An AI agent builds a private front page from the sites that the user visits. It is a fork of ThariqS/ai-newtab. Read [README.md](README.md) for the product and [ARCHITECTURE.md](ARCHITECTURE.md) for the code.

## Commands

```bash
npx pnpm@10.11.1 test            # unit tests (Bun), no API calls
npx pnpm@10.11.1 typecheck       # all packages
npx pnpm@10.11.1 build:safari    # Safari bundle only
npx pnpm@10.11.1 install:safari  # build, sign, notarize and install the Mac app
```

Run `test` and `typecheck` before each commit.

## Privacy rules

The user's browsing history and personal data must never leave their Mac through this repo.

1. Never commit a file that matches `*.local.env` or `*.local.md`. These hold signing details and maintainer notes.
2. Before each commit, scan the staged diff for personal data: real names, personal email addresses, team IDs, certificate names and absolute home-folder paths. `CLAUDE.local.md` has the exact patterns, when it exists.
3. Commit with the repo-local git identity. Never set a personal email in git config.
4. Never put API keys, certificates or notary credentials in code, docs, logs or commit messages.
5. Never weaken the privacy filter's fail-closed rule, the blocked-sites list or the private-address check.

## Safari and the installed app

1. Never quit Safari or run `install:safari` while a build runs. A build can take 10 minutes or more with the privacy filter.
2. Install only when the user says "Install and push" or asks for an install.
3. Never edit `scripts/install-safari.sh` while it runs. The shell reads the file while it runs, so an edit breaks the run.
4. Keep exactly one registered copy of the app. After a test build into another folder, unregister that copy with `lsregister -u` and delete it.
5. Keep the bundle ID `io.github.nijanthan-dev.morning-tab`. A new ID resets every user's extension storage.

## Git and releases

1. Use only the `main` branch. Do not make other branches or pull requests.
2. Each push to `main` makes a release, except a push that changes only Markdown files or `docs/`.
3. Push only when the user asks.
4. The version comes from the latest `vX.Y.Z` tag. To release a minor or major version, raise `version` in `apps/extension/package.json`.

## Docs

1. Update README.md and ARCHITECTURE.md in the same commit as each change.
2. Write docs in STE style: short sentences, active voice, no semicolons. Check them with the STE linter and keep 0 hard findings.
3. Keep every privacy claim accurate. The on-device filter is optional, off by default and best effort.
4. Do not put maintainer setup, such as signing secrets, in the README. It goes in `RELEASING.local.md`.
5. Keep the credit to Thariq Shihipar in the README, NOTICE and LICENSE.

## Code

1. Browser differences go in `apps/extension/lib/platform.ts` only.
2. Both providers share the tool logic in `packages/agent-core/orchestrator.ts`. Do not copy it.
3. Provider settings are one storage object (`providerConfig`), saved by one Save button.
4. The default look is `HOUSE_STYLE` in `packages/agent-core/prompt.ts`. All colors are CSS variables, switched together for dark mode.

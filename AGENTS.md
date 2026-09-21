# AGENTS.md

Capture2Text Next — a Windows-only Tauri 2 desktop app: vanilla TypeScript frontend in `src/`, Rust backend in `src-tauri/`, Vietnamese UI. [README.md](README.md) is the human-facing document; this file is the agent-facing one.

## Commands

Bun is both the package manager and the test runner. `package.json` carries no `packageManager` field to say so.

| Task | Command |
| --- | --- |
| Install dependencies | `bun install` |
| Type check and bundle the frontend | `bun run build` (`tsc && vite build` → `dist/`) |
| Run the unit tests | `bun test` |
| Run the real app | `bun run tauri dev` |
| Build the installers | `bun run tauri build` |
| Frontend-only dev server | `bun run dev` (Vite on port 1420, strict; `invoke` fails in a browser) |
| Check the Rust backend | `cargo check --locked` in `src-tauri/` |

`bun test` is Bun's built-in runner over `tests/*.test.ts`. There is no `test` script, so an agent that only reads `package.json` scripts concludes there are no tests — there are, and the suite is fast and offline.

## Verify loop

`bun run build && bun test` — **green** before you call a frontend change done. Three things make that gate sharper than it looks:

- `tsc` runs strict with `noUnusedLocals` and `noUnusedParameters`: one unused local, one unused parameter, and the build fails.
- The Rust build embeds `dist/` at compile time, so `bun run build` comes first for any `cargo` command in `src-tauri/`.
- The Rust side has no tests and no dev-dependencies: `cargo check` catches type errors, and `bun run tauri dev` is the only way to exercise the backend.

The app is **tray-first**. The window starts hidden (`"visible": false`) and appears only after the frontend has loaded settings, so a launch that shows nothing is normal: read the terminal log, check the tray icon, and ask a human to confirm anything visual.

## Release

1. Bump `version` in `src-tauri/tauri.conf.json` (keep `package.json` in sync).
2. Commit, then push a matching tag: `git tag v0.2.0 && git push origin v0.2.0`.

`.github/workflows/release.yml` derives its release tag from `v__VERSION__`, so the tag must equal `v<version>` or the release lands on the wrong tag. It builds MSI + NSIS and publishes them straight to the Releases tab. Running that workflow by hand from the Actions tab rebuilds at the current version without a new tag.

Triage any run with `gh run list`, `gh run view <id>` and `gh run view <id> --log-failed`. `gh` is already authenticated against this repository.

## Shell

Commands run through Windows PowerShell 5.1, one command at a time:

- Each command is cut off at roughly 30 seconds: poll with a fresh command rather than sleeping inside one.
- A native command that writes to stderr (`git push`, `cargo`, `bun`) can abort a `;`-chained command: keep chains short, or set `$ErrorActionPreference = 'Continue'` first.
- PowerShell 5.1 mangles non-ASCII arguments to native executables (an em dash arrives as `?`): keep CLI arguments ASCII.

## Where the rest lives

- [Contributing](README.md#contributing) — module conventions (collaborators injected so tests need no DOM), test pairing, registering a new Rust command in `generate_handler!`, comment style
- [Project structure](README.md#project-structure) — every source file, one line each
- [Configuration](README.md#configuration) — settings, the `capture2text_*` localStorage keys, registry autostart
- [Troubleshooting](README.md#troubleshooting) — known failure modes and their causes

`skills-lock.json` in the root is untracked tooling state, not part of the build: stage explicit paths in commits.

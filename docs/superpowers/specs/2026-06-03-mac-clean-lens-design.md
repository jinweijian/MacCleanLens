# MacClean Lens Design

## Goal

MacClean Lens is an npm-installable macOS cleanup assistant that scans common disk-space offenders, classifies them by safety and category, shows clear recommendations in Chinese, and only performs cleanup after explicit user selection.

## Product Shape

The MVP ships as a lightweight Node.js package with a CLI:

```bash
npm install -g mac-clean-lens
mac-clean-lens
```

Running the command starts a local web UI and opens it in the default browser. This avoids a heavy Electron dependency while the user's disk is already full. The UI uses a macOS utility style and can later be wrapped in Electron without changing scanner or cleaner logic.

## Core Features

- Scan current disk usage summary with `df -k`.
- Scan known reclaimable locations under the current user's home directory.
- Group findings into categories: development caches, app logs, Docker and virtual machines, chat app data, project dependencies, Android emulator data, and package-manager caches.
- Assign risk levels:
  - `low`: cache/log/dependency directories that can be moved to Trash.
  - `confirm`: rebuildable or user-workflow-sensitive data that requires careful confirmation.
  - `manual`: data that should be cleaned through the owning app or external command.
- Show estimated reclaimable size by category and selected cleanup size.
- Execute cleanup by moving selected `low` or explicitly cleanable `confirm` paths into `~/.Trash/MacCleanLens-<timestamp>/`, not by immediate permanent deletion.
- Keep manual-only items visible with instructions, but disable one-click cleanup.

## Safety Rules

- The app never deletes personal directories such as `Documents`, `Desktop`, `Pictures`, `Movies`, or source repositories themselves.
- The app never directly deletes chat app private containers, Docker VM files, or Android SDK system images in the MVP.
- Cleanup is allowlist-based. A path is cleanable only if a rule marks it as cleanable.
- Cleanup verifies paths are under the user's home directory before moving them.
- Cleanup skips missing paths and reports failures per item.
- The UI states that moving to Trash does not release disk space until Trash is emptied.

## Architecture

- `src/core/size.mjs`: filesystem size and formatting helpers.
- `src/core/rules.mjs`: scan rule definitions and path expansion.
- `src/core/scanner.mjs`: scan orchestration and category summary.
- `src/core/cleaner.mjs`: move selected paths into a timestamped Trash folder.
- `src/server/app.mjs`: local HTTP server and JSON API.
- `src/ui/*`: static UI assets.
- `bin/mac-clean-lens.mjs`: CLI entry point.

The scanner and cleaner are pure Node modules and have tests. The server is thin glue around those modules.

## Test Strategy

- Unit tests use Node's built-in `node:test` runner.
- Scanner tests use fixture directories under a temporary home path.
- Cleaner tests verify paths move into a fake Trash directory and uncleanable/manual items are rejected.
- CLI/server smoke tests verify JSON scan output and static UI serving without installing heavyweight dependencies.


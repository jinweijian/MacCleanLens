# MacClean Lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight npm-installable macOS disk cleanup visual scanner with safe cleanup-to-Trash behavior.

**Architecture:** A Node.js CLI starts a local HTTP UI and exposes JSON APIs backed by testable scanner and cleaner modules. Scanner rules are allowlist-based and classify items by category, risk, and cleanability.

**Tech Stack:** Node.js 16 ESM, built-in `node:test`, built-in HTTP server, static HTML/CSS/JavaScript.

---

## File Structure

- `package.json`: npm metadata, CLI bin, test/start scripts.
- `bin/mac-clean-lens.mjs`: command-line entry point for UI launch, JSON scan, and cleanup dry runs.
- `src/core/size.mjs`: byte formatting and recursive directory sizing.
- `src/core/rules.mjs`: macOS cleanup rules and scan path expansion.
- `src/core/scanner.mjs`: execute rules, produce findings and summaries.
- `src/core/cleaner.mjs`: validate selected findings and move cleanable paths to Trash.
- `src/server/app.mjs`: HTTP API and static file server.
- `src/ui/index.html`: application shell.
- `src/ui/styles.css`: macOS-style visual design.
- `src/ui/app.js`: browser-side scan rendering and cleanup selection.
- `test/*.test.mjs`: scanner, cleaner, and server tests.

## Tasks

- [x] Create docs and npm project skeleton.
- [x] Add failing tests for size helpers, scan rules, scanner summaries, cleaner safety, and server APIs.
- [x] Implement size helpers and scan rules.
- [x] Implement scanner summary output.
- [x] Implement cleaner move-to-Trash workflow.
- [x] Implement CLI and local server.
- [x] Implement static UI.
- [x] Run full verification: `npm test`, `node bin/mac-clean-lens.mjs scan --json`, and a local UI smoke test.

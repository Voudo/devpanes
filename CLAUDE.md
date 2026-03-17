# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

devpanes is a zero-dependency, pure ESM split-pane terminal UI for managing multiple dev processes. Published as `@voudo/devpanes` on npm. Requires Node >= 18.

## Development

```bash
# Run locally during development
node bin/cli.js --config path/to/devpanes.config.mjs

# Run with all apps (skip selection menu)
node bin/cli.js --all

# Run specific apps
node bin/cli.js --apps web,api
```

No build step or linter. The project is plain JavaScript (ESM).

```bash
# Run all tests
npm test

# Run a single test file
node --test test/terminal.test.js

# Run tests matching a name pattern
node --test --test-name-pattern="truncateToWidth" test/terminal.test.js
```

Tests use Node's built-in test runner (`node:test` + `node:assert/strict`), zero dependencies.

## Architecture

**Entry point:** `bin/cli.js` — CLI arg parsing, config loading, creates and runs the runner.

**Core modules (all in `lib/`):**

- `runner.js` — Main orchestrator. Creates the runner via `createRunner(config)` which wires together process management, layout, and keyboard input handling. This is also the package's public API export.
- `config.js` — Config file discovery (`.mjs` → `.js` → `package.json` "devpanes" key) and validation. Stores `_configDir` on the config object for resolving relative `cwd` paths.
- `layout.js` — `createLayout()` manages all terminal rendering: pane width computation (equal split or 2/3 expanded), content painting with circular line buffers, status bar, and 16ms debounced repaints.
- `process-manager.js` — Spawns child processes (detached, with process groups for clean `kill(-pid)`), port-in-use detection via `net.createServer`, infrastructure pre-start commands, and line buffering for stdout/stderr streams.
- `terminal.js` — Thin wrappers around ANSI escape codes (cursor movement, alt screen, clear). Includes `truncateToWidth()` which handles ANSI-aware string truncation.
- `menu.js` — Interactive checkbox selection menu and kill menu, both driven by raw stdin key events.
- `constants.js` — ANSI color palette, pane states enum, expand key mappings (Shift+1-7 on US keyboard).

**Key patterns:**
- State is held in a `Map<appKey, entry>` (`processes`) where each entry tracks the spawned process, pane state (normal/hidden/expanded), color, and circular line buffer.
- Layout repaints are debounced at ~60fps (16ms timer) per-pane to handle fast-scrolling output.
- Processes are spawned with `detached: true` and killed via `process.kill(-pid)` to terminate entire process groups.
- The runner uses Node's alt screen buffer so the terminal is fully restored on exit.

## Code Style

- **No abbreviations in names.** Use full words: `buildEnvironment` not `buildEnv`, `cleanUp` not `cleanup`, `runInfrastructure` not `runInfra`, `resolveAppWorkingDirectory` not `resolveAppCwd`.
- **Function names must be verbs.** Getters use `get` prefix: `getColumns()`, `getRows()`, `getStatusTopRow()`. Actions use imperative verbs: `drawLayout()`, `scheduleRepaint()`, `killProcess()`.
- **Boolean names use `is`/`has`/`was`/`should` prefixes.** `isInMenu`, `isExiting`, `isDimmed`, `shouldAugmentPath` — never bare adjectives or nouns.
- **Prefer data structures over control flow.** Use lookup tables and dispatch maps instead of if/else chains and nested ternaries. See `keyHandlers` in runner.js, `STATE_DISPLAY` in layout.js, `TOGGLE_VISIBILITY` in runner.js, `resolveApps` strategy map in runner.js, and `keyBindings` arrays in menu.js.
- **Prefer pure functions and immutable data.** Config validation returns new objects via spread (`{ ...APP_DEFAULTS, ...app }`) rather than mutating input. Use data-driven schemas (`REQUIRED_FIELDS`) over repetitive validation blocks.
- **Extract shared logic, don't duplicate.** If the same pattern appears twice, extract it: `runInfrastructure()`, `launchApps()`, `checkPorts()`, and `interactiveMenu()` all exist to eliminate duplication.
- **Zero dependencies.** Do not add npm dependencies. All functionality is implemented with Node built-ins.

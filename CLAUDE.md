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

There is no build step, test suite, or linter configured. The project is plain JavaScript (ESM).

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
- State is held in a `Map<appKey, entry>` (`procs`) where each entry tracks the spawned process, pane state (normal/hidden/expanded), color, and circular line buffer.
- Layout repaints are debounced at ~60fps (16ms timer) per-pane to handle fast-scrolling output.
- Processes are spawned with `detached: true` and killed via `process.kill(-pid)` to terminate entire process groups.
- The runner uses Node's alt screen buffer so the terminal is fully restored on exit.

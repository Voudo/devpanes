# devpanes, by [Voudo](https://www.voudo.com)

Split-pane terminal UI for managing multiple dev processes. Zero dependencies, pure ESM, Node >= 18.

![Kapture 2026-03-17 at 10 16 49](https://github.com/user-attachments/assets/32ba3592-f3ca-4919-8b26-a79b146cc1e3)

## Install

```bash
# Install as a dev dependency (recommended)
npm install --save-dev @voudo/devpanes
```

> **Note:** `npx @voudo/devpanes` won't work due to an npm quirk with scoped packages where the bin name (`devpanes`) doesn't match the package name. Use the one-liner below, or just install it first and run `npx devpanes`.

```bash
# Zero-install one-liner
npx -p @voudo/devpanes devpanes
```

## Quick Start

Create `devpanes.config.mjs` in your project root:

```js
export default {
  name: 'My Project',
  apps: [
    { key: 'web', label: 'Frontend', cwd: 'packages/web', cmd: 'npm', args: ['run', 'dev'], port: 3000 },
    { key: 'api', label: 'API', cwd: 'packages/api', cmd: 'npm', args: ['start'], port: 8080 },
    { key: 'db', label: 'Database', cwd: '.', cmd: 'docker', args: ['compose', 'up'], shell: true },
  ],
}
```

Then add a script to `package.json` and run:

```json
{ "scripts": { "dev": "devpanes" } }
```

```bash
npm run dev
```

## CLI Options

```
devpanes [options]
  --config <path>    Path to config file
  --all              Start all apps, skip selection menu
  --apps <keys>      Comma-separated app keys to start (e.g. --apps web,api)
  --help             Show help
  --version          Show version
```

## Config Reference

### Config file discovery

1. `--config <path>` CLI flag
2. `devpanes.config.mjs` in current directory
3. `devpanes.config.js` in current directory
4. `"devpanes"` key in `package.json`

### Config shape

```js
export default {
  name: 'Project Name',      // optional — shown in menu header
  apps: [                     // required — at least one app
    {
      key: 'web',             // required — unique identifier
      label: 'Web App',       // required — display name
      cwd: 'packages/web',   // required — working directory (relative to config file)
      cmd: 'npm',             // required — command to run
      args: ['run', 'dev'],   // optional — arguments (default: [])
      port: 3000,             // optional — enables port-in-use detection
      env: { NODE_ENV: 'dev' }, // optional — extra environment variables
      shell: false,           // optional — pass to child_process.spawn
      infra: {                // optional — pre-start command
        cmd: 'docker',
        args: ['compose', 'up', '-d'],
        label: 'docker',
      },
    },
  ],
  settings: {                 // optional
    maxBufferLines: 500,      // lines per pane buffer (default: 500)
    colors: [...],            // custom ANSI color rotation
    pathAugment: true,        // add node_modules/.bin to PATH (default: true)
  },
}
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1`-`9` | Toggle pane visibility |
| `!` `@` `#` `$` `%` `^` `&` | Expand/collapse pane (Shift+1-7) |
| `Tab` | Cycle focus between panes |
| `↑` / `↓` | Scroll focused pane |
| `Page Up` / `Page Down` | Scroll focused pane by full page |
| `i` or `Enter` | Enter input mode (send stdin to focused pane) |
| `Esc` | Exit input mode, or unfocus pane |
| Mouse click | Focus a pane |
| Scroll wheel | Scroll a pane |
| `s` | Start more apps (opens selection menu) |
| `k` | Kill an app (opens kill menu) |
| `q` / `Ctrl+C` | Quit — stops all apps and restores terminal |

## Features

- **Interactive selection menu** — choose which apps to start with checkbox UI
- **Split-pane output** — each process gets its own vertical pane with color-coded output
- **Expand/collapse** — focus on one pane while keeping others visible
- **Show/hide** — toggle panes on and off with number keys
- **Port detection** — warns when a port is already in use
- **Infrastructure pre-start** — run setup commands (e.g. docker compose) before starting an app
- **Process input** — send stdin to any running process via input mode (`i` or `Enter` on a focused pane)
- **Scroll and focus** — focus a pane with Tab or mouse click, scroll with arrow keys or scroll wheel
- **Graceful cleanup** — kills all process groups and restores terminal on exit
- **60fps debounced rendering** — smooth output even with fast-scrolling builds
- **500-line circular buffers** — keeps memory bounded per pane

## Alternatives

devpanes is a lightweight, focused tool for one specific workflow — managing a handful of local dev processes during rapid prototyping. It's not the only way to solve this problem, and depending on your needs, one of these might be a better fit:

**Process runners** — Run multiple commands in parallel with merged, color-coded output in a single stream:
- [concurrently](https://github.com/open-cli-tools/concurrently) — The most popular option (~9M weekly npm downloads). Simple and effective.
- [npm-run-all2](https://github.com/bcomnes/npm-run-all2) — Great for running multiple npm scripts in parallel or sequence.
- [node-foreman](https://github.com/strongloop/node-foreman) — Procfile-based, if you're coming from the Ruby/Foreman world.

**TUI process managers** — Terminal UIs purpose-built for viewing multiple processes:
- [mprocs](https://github.com/pvolok/mprocs) — Rust-based TUI with a sidebar/detail view and YAML config. Well-regarded.
- [procmux](https://github.com/napisani/procmux) — Python-based, similar to mprocs with an HTTP control server.

**Terminal multiplexers** — General-purpose terminal splitting (you manage processes yourself):
- [tmux](https://github.com/tmux/tmux) — The standard. Extremely powerful and scriptable.
- [Zellij](https://github.com/zellij-org/zellij) — Modern alternative to tmux with discoverable keybindings and layout templates.

**Heavier orchestration** — When you need containers, networking, or production parity:
- [Docker Compose](https://docs.docker.com/compose/) — The standard for multi-container local development.
- [Overmind](https://github.com/DarthSim/overmind) — Procfile runner backed by tmux, lets you attach to individual processes.

## License

MIT

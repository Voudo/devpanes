#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadConfig } from '../lib/config.js'
import { createRunner } from '../lib/runner.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const showHelp = () => {
  console.log(`
devpanes — Split-pane terminal UI for managing multiple dev processes

Usage:
  devpanes [options]

Options:
  --config <path>    Path to config file
  --all              Start all apps, skip selection menu
  --apps <keys>      Comma-separated app keys to start
  --help             Show this help message
  --version          Show version number

Config discovery:
  1. --config <path> flag
  2. devpanes.config.mjs in current directory
  3. devpanes.config.js in current directory
  4. "devpanes" key in package.json

Keyboard shortcuts (while running):
  1-9        Toggle pane visibility
  !@#$%^&    Expand/collapse pane
  Tab        Cycle focus between panes
  ↑/↓        Scroll focused pane
  PgUp/PgDn  Scroll by full page
  Esc        Unfocus pane / clear scroll
  s          Start more apps
  k          Kill an app
  q          Quit (stops all apps)
`)
}

export const parseArgs = (argv) => {
  const args = argv.slice(2)
  const options = {}

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
      case '-h':
        options.help = true
        break
      case '--version':
      case '-v':
        options.version = true
        break
      case '--all':
        options.all = true
        break
      case '--config':
        options.config = args[++i]
        if (!options.config) {
          console.error('--config requires a path argument')
          process.exit(1)
        }
        break
      case '--apps':
        options.apps = args[++i]
        if (!options.apps) {
          console.error('--apps requires a comma-separated list of app keys')
          process.exit(1)
        }
        break
      default:
        console.error(`Unknown option: ${args[i]}`)
        showHelp()
        process.exit(1)
    }
  }

  return options
}

const main = async () => {
  const options = parseArgs(process.argv)

  if (options.help) {
    showHelp()
    process.exit(0)
  }

  if (options.version) {
    const pkg = JSON.parse(
      await readFile(path.join(__dirname, '..', 'package.json'), 'utf8')
    )
    console.log(pkg.version)
    process.exit(0)
  }

  let config
  try {
    config = await loadConfig(options.config)
  } catch (err) {
    console.error(`Error: ${err.message}`)
    process.exit(1)
  }

  const runner = createRunner(config)
  await runner.run({ all: options.all, apps: options.apps })
}

const resolveReal = (filePath) => { try { return realpathSync(filePath) } catch { return filePath } }
const isDirectExecution = resolveReal(fileURLToPath(import.meta.url)) === resolveReal(path.resolve(process.argv[1] || ''))
if (isDirectExecution) main()

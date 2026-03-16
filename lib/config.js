import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'

const CONFIG_FILES = ['devpanes.config.mjs', 'devpanes.config.js']

const findConfigFile = (cwd) => {
  for (const name of CONFIG_FILES) {
    const full = path.join(cwd, name)
    if (existsSync(full)) return full
  }
  return null
}

const loadFromPackageJson = async (cwd) => {
  const pkgPath = path.join(cwd, 'package.json')
  if (!existsSync(pkgPath)) return null
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  return pkg.devpanes || null
}

export const loadConfig = async (explicitPath) => {
  let configPath
  let config

  if (explicitPath) {
    configPath = path.resolve(explicitPath)
    if (!existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`)
    }
  } else {
    configPath = findConfigFile(process.cwd())
  }

  if (configPath) {
    const mod = await import(pathToFileURL(configPath).href)
    config = mod.default || mod
    config._configDir = path.dirname(configPath)
  } else {
    // Try package.json
    config = await loadFromPackageJson(process.cwd())
    if (config) {
      config._configDir = process.cwd()
    }
  }

  if (!config) {
    throw new Error(
      'No devpanes config found.\n'
      + 'Create devpanes.config.mjs, devpanes.config.js, or add a "devpanes" key to package.json.'
    )
  }

  validateConfig(config)
  return config
}

const validateConfig = (config) => {
  if (!config.apps || !Array.isArray(config.apps) || config.apps.length === 0) {
    throw new Error('Config must have a non-empty "apps" array.')
  }

  const keys = new Set()
  for (let i = 0; i < config.apps.length; i++) {
    const app = config.apps[i]
    const prefix = `apps[${i}]`

    if (!app.key || typeof app.key !== 'string') {
      throw new Error(`${prefix}: "key" is required and must be a string.`)
    }
    if (keys.has(app.key)) {
      throw new Error(`${prefix}: duplicate key "${app.key}".`)
    }
    keys.add(app.key)

    if (!app.label || typeof app.label !== 'string') {
      throw new Error(`${prefix}: "label" is required and must be a string.`)
    }
    if (!app.cwd || typeof app.cwd !== 'string') {
      throw new Error(`${prefix}: "cwd" is required and must be a string.`)
    }
    if (!app.cmd || typeof app.cmd !== 'string') {
      throw new Error(`${prefix}: "cmd" is required and must be a string.`)
    }

    // Defaults
    if (!app.args) app.args = []
    if (!app.env) app.env = {}
    if (app.shell === undefined) app.shell = false
  }
}

export const resolveAppCwd = (config, app) =>
  path.resolve(config._configDir, app.cwd)

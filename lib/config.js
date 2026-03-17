import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'

const CONFIG_FILES = ['devpanes.config.mjs', 'devpanes.config.js']

const findConfigFile = (directory) => {
  for (const name of CONFIG_FILES) {
    const fullPath = path.join(directory, name)
    if (existsSync(fullPath)) return fullPath
  }
  return null
}

const loadFromPackageJson = async (directory) => {
  const packagePath = path.join(directory, 'package.json')
  if (!existsSync(packagePath)) return null
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  return packageJson.devpanes || null
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
    const imported = await import(pathToFileURL(configPath).href)
    config = imported.default || imported
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

const REQUIRED_FIELDS = ['key', 'label', 'cwd', 'cmd']
const APP_DEFAULTS = { args: [], env: {}, shell: false }

const validateConfig = (config) => {
  if (!config.apps || !Array.isArray(config.apps) || config.apps.length === 0) {
    throw new Error('Config must have a non-empty "apps" array.')
  }

  const keys = new Set()
  config.apps = config.apps.map((app, i) => {
    const prefix = `apps[${i}]`

    for (const field of REQUIRED_FIELDS) {
      if (!app[field] || typeof app[field] !== 'string') {
        throw new Error(`${prefix}: "${field}" is required and must be a string.`)
      }
    }

    if (keys.has(app.key)) {
      throw new Error(`${prefix}: duplicate key "${app.key}".`)
    }
    keys.add(app.key)

    return { ...APP_DEFAULTS, ...app }
  })
}

export const resolveAppWorkingDirectory = (config, app) =>
  path.resolve(config._configDir, app.cwd)

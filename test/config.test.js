import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, validateConfig, resolveAppWorkingDirectory } from '../lib/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = (name) => path.join(__dirname, 'fixtures', name)

describe('validateConfig', () => {
  it('throws when apps is missing', () => {
    assert.throws(() => validateConfig({}), /non-empty "apps" array/)
  })

  it('throws when apps is an empty array', () => {
    assert.throws(() => validateConfig({ apps: [] }), /non-empty "apps" array/)
  })

  it('throws when apps is not an array', () => {
    assert.throws(() => validateConfig({ apps: 'not-array' }), /non-empty "apps" array/)
  })

  it('throws when app is missing key', () => {
    const config = { apps: [{ label: 'A', cwd: '.', cmd: 'echo' }] }
    assert.throws(() => validateConfig(config), /"key" is required/)
  })

  it('throws when app is missing label', () => {
    const config = { apps: [{ key: 'a', cwd: '.', cmd: 'echo' }] }
    assert.throws(() => validateConfig(config), /"label" is required/)
  })

  it('throws when app is missing cwd', () => {
    const config = { apps: [{ key: 'a', label: 'A', cmd: 'echo' }] }
    assert.throws(() => validateConfig(config), /"cwd" is required/)
  })

  it('throws when app is missing cmd', () => {
    const config = { apps: [{ key: 'a', label: 'A', cwd: '.' }] }
    assert.throws(() => validateConfig(config), /"cmd" is required/)
  })

  it('throws when a required field is not a string', () => {
    const config = { apps: [{ key: 123, label: 'A', cwd: '.', cmd: 'echo' }] }
    assert.throws(() => validateConfig(config), /"key" is required and must be a string/)
  })

  it('throws on duplicate keys', () => {
    const config = {
      apps: [
        { key: 'a', label: 'A', cwd: '.', cmd: 'echo' },
        { key: 'a', label: 'B', cwd: '.', cmd: 'echo' },
      ],
    }
    assert.throws(() => validateConfig(config), /duplicate key "a"/)
  })

  it('applies defaults for missing optional fields', () => {
    const config = {
      apps: [{ key: 'a', label: 'A', cwd: '.', cmd: 'echo' }],
    }
    validateConfig(config)
    assert.deepEqual(config.apps[0].args, [])
    assert.deepEqual(config.apps[0].env, {})
    assert.equal(config.apps[0].shell, false)
  })

  it('preserves existing optional fields', () => {
    const config = {
      apps: [{
        key: 'a', label: 'A', cwd: '.', cmd: 'echo',
        args: ['--verbose'], env: { NODE_ENV: 'dev' }, shell: true,
      }],
    }
    validateConfig(config)
    assert.deepEqual(config.apps[0].args, ['--verbose'])
    assert.deepEqual(config.apps[0].env, { NODE_ENV: 'dev' })
    assert.equal(config.apps[0].shell, true)
  })
})

describe('loadConfig', () => {
  it('loads a valid config file by explicit path', async () => {
    const config = await loadConfig(fixturePath('valid-config.mjs'))
    assert.equal(config.name, 'Test Project')
    assert.equal(config.apps.length, 2)
    assert.equal(config.apps[0].key, 'web')
    assert.equal(config.apps[1].key, 'api')
  })

  it('sets _configDir to the directory containing the config', async () => {
    const config = await loadConfig(fixturePath('valid-config.mjs'))
    assert.equal(config._configDir, path.join(__dirname, 'fixtures'))
  })

  it('applies defaults to apps missing optional fields', async () => {
    const config = await loadConfig(fixturePath('minimal-config.mjs'))
    assert.deepEqual(config.apps[0].args, [])
    assert.deepEqual(config.apps[0].env, {})
    assert.equal(config.apps[0].shell, false)
  })

  it('throws for config with missing required field', async () => {
    await assert.rejects(
      () => loadConfig(fixturePath('missing-key-config.mjs')),
      /"key" is required/,
    )
  })

  it('throws for config with duplicate keys', async () => {
    await assert.rejects(
      () => loadConfig(fixturePath('duplicate-key-config.mjs')),
      /duplicate key "web"/,
    )
  })

  it('throws for config with empty apps array', async () => {
    await assert.rejects(
      () => loadConfig(fixturePath('empty-apps-config.mjs')),
      /non-empty "apps" array/,
    )
  })

  it('throws when explicit path does not exist', async () => {
    await assert.rejects(
      () => loadConfig('/nonexistent/path/config.mjs'),
      /Config file not found/,
    )
  })
})

describe('resolveAppWorkingDirectory', () => {
  it('resolves relative cwd against configDir', () => {
    const config = { _configDir: '/project' }
    const app = { cwd: 'packages/web' }
    assert.equal(resolveAppWorkingDirectory(config, app), '/project/packages/web')
  })

  it('resolves dot cwd to configDir itself', () => {
    const config = { _configDir: '/project' }
    const app = { cwd: '.' }
    assert.equal(resolveAppWorkingDirectory(config, app), '/project')
  })
})

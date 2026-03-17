import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from '../bin/cli.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cliPath = path.join(__dirname, '..', 'bin', 'cli.js')
const execFileAsync = promisify(execFile)

const runCli = async (args = []) => {
  try {
    const { stdout, stderr } = await execFileAsync('node', [cliPath, ...args], {
      timeout: 5000,
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (error) {
    return { stdout: error.stdout || '', stderr: error.stderr || '', exitCode: error.code }
  }
}

describe('parseArgs', () => {
  it('returns empty object for no arguments', () => {
    const result = parseArgs(['node', 'devpanes'])
    assert.deepEqual(result, {})
  })

  it('parses --help flag', () => {
    const result = parseArgs(['node', 'devpanes', '--help'])
    assert.equal(result.help, true)
  })

  it('parses -h flag', () => {
    const result = parseArgs(['node', 'devpanes', '-h'])
    assert.equal(result.help, true)
  })

  it('parses --version flag', () => {
    const result = parseArgs(['node', 'devpanes', '--version'])
    assert.equal(result.version, true)
  })

  it('parses -v flag', () => {
    const result = parseArgs(['node', 'devpanes', '-v'])
    assert.equal(result.version, true)
  })

  it('parses --all flag', () => {
    const result = parseArgs(['node', 'devpanes', '--all'])
    assert.equal(result.all, true)
  })

  it('parses --config with path', () => {
    const result = parseArgs(['node', 'devpanes', '--config', '/path/to/config.mjs'])
    assert.equal(result.config, '/path/to/config.mjs')
  })

  it('parses --apps with comma-separated keys', () => {
    const result = parseArgs(['node', 'devpanes', '--apps', 'web,api'])
    assert.equal(result.apps, 'web,api')
  })

  it('parses multiple flags together', () => {
    const result = parseArgs(['node', 'devpanes', '--all', '--config', 'my.mjs'])
    assert.equal(result.all, true)
    assert.equal(result.config, 'my.mjs')
  })
})

describe('CLI subprocess', () => {
  it('--help exits 0 and prints usage', async () => {
    const { stdout, exitCode } = await runCli(['--help'])
    assert.equal(exitCode, 0)
    assert.ok(stdout.includes('devpanes'))
    assert.ok(stdout.includes('--config'))
  })

  it('--version exits 0 and prints a version number', async () => {
    const { stdout, exitCode } = await runCli(['--version'])
    assert.equal(exitCode, 0)
    assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/)
  })

  it('unknown option exits non-zero with error', async () => {
    const { stderr, exitCode } = await runCli(['--bogus'])
    assert.notEqual(exitCode, 0)
    assert.ok(stderr.includes('Unknown option'))
  })
})

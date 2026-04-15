import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { PassThrough } from 'node:stream'
import { isPortInUse, buildEnvironment, bufferLines } from '../lib/process-manager.js'

describe('isPortInUse', () => {
  it('returns false for an unused port', async () => {
    const result = await isPortInUse(49152 + Math.floor(Math.random() * 16000))
    assert.equal(result, false)
  })

  it('returns true for a port that is in use', async () => {
    const server = net.createServer()
    const port = await new Promise((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve(server.address().port))
      server.on('error', reject)
    })

    try {
      const result = await isPortInUse(port)
      assert.equal(result, true)
    } finally {
      await new Promise(resolve => server.close(resolve))
    }
  })
})

describe('buildEnvironment', () => {
  it('includes process.env values', () => {
    const config = { _configDir: '/project', settings: {} }
    const app = { cwd: '.', env: {} }
    const environment = buildEnvironment(config, app)
    assert.equal(environment.HOME, process.env.HOME)
  })

  it('app env overrides process.env', () => {
    const config = { _configDir: '/project', settings: {} }
    const app = { cwd: '.', env: { HOME: '/custom' } }
    const environment = buildEnvironment(config, app)
    assert.equal(environment.HOME, '/custom')
  })

  it('augments PATH with node_modules/.bin by default', () => {
    const config = { _configDir: '/project', settings: {} }
    const app = { cwd: 'packages/web', env: {} }
    const environment = buildEnvironment(config, app)
    assert.ok(environment.PATH.includes('/project/node_modules/.bin'))
    assert.ok(environment.PATH.includes('/project/packages/web/node_modules/.bin'))
  })

  it('does not augment PATH when pathAugment is false', () => {
    const config = { _configDir: '/project', settings: { pathAugment: false } }
    const app = { cwd: 'packages/web', env: {} }
    const environment = buildEnvironment(config, app)
    assert.ok(!environment.PATH.includes('/project/node_modules/.bin'))
    assert.ok(!environment.PATH.includes('/project/packages/web/node_modules/.bin'))
  })

  it('sets FORCE_COLOR to enable colored output in piped processes', () => {
    const config = { _configDir: '/project', settings: {} }
    const app = { cwd: '.', env: {} }
    const environment = buildEnvironment(config, app)
    assert.equal(environment.FORCE_COLOR, '1')
  })

  it('PATH entries are colon-separated', () => {
    const config = { _configDir: '/project', settings: {} }
    const app = { cwd: '.', env: {} }
    const environment = buildEnvironment(config, app)
    const pathEntries = environment.PATH.split(':')
    assert.ok(pathEntries.length >= 3)
  })
})

describe('bufferLines', () => {
  const createBufferedStream = () => {
    const stream = new PassThrough()
    const lines = []
    bufferLines(stream, line => lines.push(line))
    return { stream, lines }
  }

  it('calls onLine for each complete line in a single chunk', () => {
    const { stream, lines } = createBufferedStream()
    stream.write('line1\nline2\n')
    assert.deepEqual(lines, ['line1', 'line2'])
  })

  it('buffers partial lines across multiple chunks', () => {
    const { stream, lines } = createBufferedStream()
    stream.write('hel')
    assert.deepEqual(lines, [])
    stream.write('lo\n')
    assert.deepEqual(lines, ['hello'])
  })

  it('does not emit trailing content without newline', () => {
    const { stream, lines } = createBufferedStream()
    stream.write('no-newline')
    assert.deepEqual(lines, [])
  })

  it('handles empty lines', () => {
    const { stream, lines } = createBufferedStream()
    stream.write('\n\n')
    assert.deepEqual(lines, ['', ''])
  })

  it('handles mixed complete and partial lines', () => {
    const { stream, lines } = createBufferedStream()
    stream.write('first\nsec')
    assert.deepEqual(lines, ['first'])
    stream.write('ond\nthird\n')
    assert.deepEqual(lines, ['first', 'second', 'third'])
  })
})

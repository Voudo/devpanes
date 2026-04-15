import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { resolveAppWorkingDirectory } from './config.js'

export const isPortInUse = port =>
  new Promise(resolve => {
    const server = net.createServer()
    server.once('error', err => resolve(err.code === 'EADDRINUSE'))
    server.once('listening', () => server.close(() => resolve(false)))
    server.listen(port, '127.0.0.1')
  })

export const buildEnvironment = (config, app) => {
  const configDirectory = config._configDir
  const appWorkingDirectory = resolveAppWorkingDirectory(config, app)
  const shouldAugmentPath = config.settings?.pathAugment !== false

  const pathEntries = shouldAugmentPath
    ? [
        path.join(configDirectory, 'node_modules/.bin'),
        path.join(appWorkingDirectory, 'node_modules/.bin'),
        process.env.PATH,
      ]
    : [process.env.PATH]

  return {
    ...process.env,
    ...app.env,
    FORCE_COLOR: '1',
    PATH: pathEntries.join(':'),
  }
}

export const startInfrastructure = (config, app) =>
  new Promise((resolve, reject) => {
    const childProcess = spawn(app.infra.cmd, app.infra.args, {
      cwd: resolveAppWorkingDirectory(config, app),
      env: buildEnvironment(config, app),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    childProcess.on('error', err => reject(err))
    childProcess.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`exited with code ${code}`))
    })
  })

export const bufferLines = (stream, onLine) => {
  let partial = ''
  let flushTimer = null
  stream.on('data', chunk => {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
    // Normalize ANSI overwrite sequences to \r so carriage return handling catches them
    partial += chunk.toString().replace(/\x1b\[2K/g, '').replace(/\x1b\[\d*G/g, '\r')
    const lines = partial.split('\n')
    partial = lines.pop()
    for (const line of lines) {
      const withoutTrailingReturn = line.replace(/\r$/, '')
      const lastReturn = withoutTrailingReturn.lastIndexOf('\r')
      onLine(lastReturn >= 0 ? withoutTrailingReturn.slice(lastReturn + 1) : withoutTrailingReturn)
    }
    // Handle carriage return in partial: keep only content after last \r
    const lastPartialReturn = partial.lastIndexOf('\r')
    if (lastPartialReturn >= 0) partial = partial.slice(lastPartialReturn + 1)
    if (partial) {
      flushTimer = setTimeout(() => {
        onLine(partial)
        partial = ''
        flushTimer = null
      }, 100)
    }
  })
  stream.on('end', () => {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
  })
}

export const spawnApp = (config, app) => {
  const shouldUseShell = app.shell || app.cmd.includes(' ')
  return spawn(app.cmd, app.args, {
    cwd: resolveAppWorkingDirectory(config, app),
    env: buildEnvironment(config, app),
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    shell: shouldUseShell,
  })
}

export const killProcess = (entry) => {
  const pid = entry.proc.pid
  if (!pid) return
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try { entry.proc.kill('SIGTERM') } catch {}
  }
}

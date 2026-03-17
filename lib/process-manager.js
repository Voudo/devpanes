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
  stream.on('data', chunk => {
    partial += chunk.toString()
    const lines = partial.split('\n')
    partial = lines.pop()
    for (const line of lines) onLine(line)
  })
}

export const spawnApp = (config, app) =>
  spawn(app.cmd, app.args, {
    cwd: resolveAppWorkingDirectory(config, app),
    env: buildEnvironment(config, app),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    shell: app.shell,
  })

export const killProcess = (entry) => {
  const pid = entry.proc.pid
  if (!pid) return
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try { entry.proc.kill('SIGTERM') } catch {}
  }
}

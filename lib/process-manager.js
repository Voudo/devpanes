import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { resolveAppCwd } from './config.js'

export const isPortInUse = port =>
  new Promise(resolve => {
    const server = net.createServer()
    server.once('error', err => resolve(err.code === 'EADDRINUSE'))
    server.once('listening', () => server.close(() => resolve(false)))
    server.listen(port, '127.0.0.1')
  })

export const buildEnv = (config, app) => {
  const configDir = config._configDir
  const appCwd = resolveAppCwd(config, app)
  const pathAugment = config.settings?.pathAugment !== false

  const pathEntries = pathAugment
    ? [
        path.join(configDir, 'node_modules/.bin'),
        path.join(appCwd, 'node_modules/.bin'),
        process.env.PATH,
      ]
    : [process.env.PATH]

  return {
    ...process.env,
    ...app.env,
    PATH: pathEntries.join(':'),
  }
}

export const startInfra = (config, app) =>
  new Promise((resolve, reject) => {
    const proc = spawn(app.infra.cmd, app.infra.args, {
      cwd: resolveAppCwd(config, app),
      env: buildEnv(config, app),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    proc.on('error', err => reject(err))
    proc.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`exited with code ${code}`))
    })
  })

export const bufferLines = (stream, onLine) => {
  let buf = ''
  stream.on('data', chunk => {
    buf += chunk.toString()
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) onLine(line)
  })
}

export const spawnApp = (config, app) =>
  spawn(app.cmd, app.args, {
    cwd: resolveAppCwd(config, app),
    env: buildEnv(config, app),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    shell: app.shell,
  })

export const killProc = (entry) => {
  const pid = entry.proc.pid
  if (!pid) return
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try { entry.proc.kill('SIGTERM') } catch {}
  }
}

import { COLORS, PANE_STATE, MAX_BUFFER_LINES, EXPAND_KEYS, DIM, RESET, RED } from './constants.js'
import {
  write, rows, moveTo, clearLine, cols, resetScrollRegion,
  showCursor, exitAltScreen, enterAltScreen,
} from './terminal.js'
import { isPortInUse, spawnApp, startInfra, bufferLines, killProc } from './process-manager.js'
import { selectAppsInteractive, killMenuInteractive } from './menu.js'
import { createLayout } from './layout.js'

export const createRunner = (config) => {
  const apps = config.apps
  const colors = config.settings?.colors || COLORS
  const maxBufferLines = config.settings?.maxBufferLines || MAX_BUFFER_LINES
  const menuName = config.name || 'Dev Launcher'

  const procs = new Map()
  let inMenu = false
  let isExiting = false

  const layout = createLayout(apps, procs)

  // ─── Pane output ──────────────────────────────────────────────────────

  const writeToPane = (appKey, line) => {
    const entry = procs.get(appKey)
    if (!entry) return

    const formatted = `${entry.color}[${entry.app.label}]${RESET} ${line.replace(/\r$/, '')}`
    entry.lines.push(formatted)
    if (entry.lines.length > maxBufferLines) entry.lines.shift()

    if (entry.state === PANE_STATE.HIDDEN) return
    layout.scheduleRepaint(appKey)
  }

  // ─── Process management ───────────────────────────────────────────────

  const startApp = (app, color) => {
    const proc = spawnApp(config, app)

    procs.set(app.key, {
      proc,
      app,
      color,
      state: PANE_STATE.NORMAL,
      lines: [],
    })

    bufferLines(proc.stdout, line => writeToPane(app.key, line))
    bufferLines(proc.stderr, line => writeToPane(app.key, line))

    const removeAndRedraw = () => {
      procs.delete(app.key)
      if (procs.size === 0) {
        isExiting = true
        const top = layout.statusTop()
        moveTo(top, 1);     clearLine(); write('─'.repeat(cols()))
        moveTo(top + 1, 1); clearLine()
        write(`  ${color}[${app.label}]${RESET} All apps stopped.`)
        moveTo(top + 2, 1); clearLine()
        write(`  ${DIM}Press any key to exit${RESET}`)
        for (let row = top + 3; row <= rows(); row++) {
          moveTo(row, 1); clearLine()
        }
        process.stdin.once('data', () => { cleanup(); process.exit(0) })
        return
      }
      if (!inMenu) layout.drawLayout()
    }

    proc.on('error', err => {
      layout.setStatusMessage(
        `${RED}${app.label}: Failed to start "${app.cmd}" — ${err.message}${RESET}`,
        5000,
      )
      removeAndRedraw()
    })

    proc.on('exit', code => {
      writeToPane(app.key, `${DIM}exited (code ${code})${RESET}`)
      removeAndRedraw()
    })
  }

  const killApp = key => {
    const entry = procs.get(key)
    if (!entry) return
    killProc(entry)
  }

  const killAll = () => {
    for (const key of [...procs.keys()]) killApp(key)
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  const cleanup = () => {
    layout.clearTimers()
    try { process.stdin.setRawMode(false) } catch {}
    showCursor()
    resetScrollRegion()
    moveTo(rows(), 1)
    exitAltScreen()
  }

  // ─── Start more apps ─────────────────────────────────────────────────

  const startMoreApps = async () => {
    const portResults = await Promise.all(
      apps.map(app => app.port ? isPortInUse(app.port) : Promise.resolve(false))
    )
    const alreadyRunning = apps.map(
      (app, index) => procs.has(app.key) || portResults[index]
    )

    if (alreadyRunning.every(Boolean)) return

    const selected = await selectAppsInteractive(apps, alreadyRunning, menuName)
    if (selected === null) {
      // Ctrl+C in menu
      cleanup()
      killAll()
      setTimeout(() => process.exit(0), 500)
      return
    }

    const toStart = selected.filter(
      app => !procs.has(app.key)
        && !portResults[apps.indexOf(app)]
    )

    if (toStart.length > 0) {
      const appsNeedingInfra = toStart.filter(app => app.infra)
      for (const app of appsNeedingInfra) {
        write(`\n  Starting ${app.infra.label} for ${app.label}...`)
        try {
          await startInfra(config, app)
          write(' done\n')
        } catch (err) {
          write(` failed: ${err.message}\n`)
        }
      }

      const colorOffset = procs.size
      toStart.forEach((app, index) =>
        startApp(app, colors[(colorOffset + index) % colors.length])
      )
    }

    layout.drawLayout()
  }

  // ─── Running mode ─────────────────────────────────────────────────────

  const runCommandLoop = () => {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    const onKey = async data => {
      if (inMenu || isExiting) return

      // Quit
      if (data === '\x03' || data === 'q' || data === 'Q') {
        cleanup()
        killAll()
        setTimeout(() => process.exit(0), 500)
        return
      }

      // Number keys: toggle pane visibility
      const numKey = parseInt(data)
      if (numKey >= 1 && numKey <= apps.length) {
        const appKey = apps[numKey - 1].key
        const entry = procs.get(appKey)
        if (entry) {
          entry.state = entry.state === PANE_STATE.HIDDEN
            ? PANE_STATE.NORMAL
            : PANE_STATE.HIDDEN
          layout.drawLayout()
        }
        return
      }

      // Shift+number: toggle expand
      if (data in EXPAND_KEYS) {
        const appIndex = EXPAND_KEYS[data]
        if (appIndex < apps.length) {
          const appKey = apps[appIndex].key
          const entry = procs.get(appKey)
          if (entry) {
            if (entry.state === PANE_STATE.EXPANDED) {
              entry.state = PANE_STATE.NORMAL
            } else {
              for (const otherEntry of procs.values()) {
                if (otherEntry.state === PANE_STATE.EXPANDED) {
                  otherEntry.state = PANE_STATE.NORMAL
                }
              }
              entry.state = PANE_STATE.EXPANDED
            }
            layout.drawLayout()
          }
        }
        return
      }

      // Start more apps
      if (data === 's' || data === 'S') {
        inMenu = true
        process.stdin.removeListener('data', onKey)
        process.stdin.setRawMode(false)
        await startMoreApps()
        process.stdin.setRawMode(true)
        process.stdin.on('data', onKey)
        inMenu = false
        return
      }

      // Kill an app
      if ((data === 'k' || data === 'K') && procs.size > 0) {
        inMenu = true
        const keyToKill = await killMenuInteractive(procs, layout.statusTop)
        inMenu = false
        if (keyToKill) killApp(keyToKill)
        layout.drawStatusBar()
        return
      }
    }

    process.stdin.on('data', onKey)
  }

  // ─── Resize handling ──────────────────────────────────────────────────

  process.stdout.on('resize', () => {
    if (procs.size > 0) layout.drawLayout()
  })

  // ─── Signal handling ──────────────────────────────────────────────────

  process.on('SIGINT', () => {
    cleanup()
    killAll()
    setTimeout(() => process.exit(0), 500)
  })

  // ─── Entry point ──────────────────────────────────────────────────────

  const run = async (options = {}) => {
    // TTY guard
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error('devpanes requires an interactive terminal (TTY).')
      process.exit(1)
    }

    enterAltScreen()

    let toStart

    if (options.all) {
      // --all: start everything, skip menu
      toStart = [...apps]
    } else if (options.apps) {
      // --apps web,api: start specific apps
      const keys = options.apps.split(',').map(k => k.trim())
      toStart = keys.map(key => {
        const app = apps.find(a => a.key === key)
        if (!app) {
          console.error(`Unknown app key: "${key}". Available: ${apps.map(a => a.key).join(', ')}`)
          process.exit(1)
        }
        return app
      })
    } else {
      // Interactive menu
      const portResults = await Promise.all(
        apps.map(app => app.port ? isPortInUse(app.port) : Promise.resolve(false))
      )
      const selected = await selectAppsInteractive(apps, portResults, menuName)

      if (selected === null) {
        cleanup()
        process.exit(0)
      }

      toStart = selected.filter(
        app => !portResults[apps.indexOf(app)]
      )
    }

    if (toStart.length === 0) {
      const reason = options.apps || options.all
        ? 'No apps to start.'
        : 'No apps selected.'
      write(`\n${reason}\n`)
      cleanup()
      setTimeout(() => process.exit(0), 1500)
      return
    }

    // Start infrastructure
    const appsNeedingInfra = toStart.filter(app => app.infra)
    for (const app of appsNeedingInfra) {
      write(`\n  Starting ${app.infra.label} for ${app.label}...`)
      try {
        await startInfra(config, app)
        write(' done\n')
      } catch (err) {
        write(` failed: ${err.message}\n`)
      }
    }

    toStart.forEach((app, index) =>
      startApp(app, colors[index % colors.length])
    )

    layout.drawLayout()
    runCommandLoop()
  }

  return { run }
}

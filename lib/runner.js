import { COLORS, PANE_STATE, MAX_BUFFER_LINES, EXPAND_KEYS, DIM, RESET, RED } from './constants.js'
import {
  write, getRows, moveTo, clearLine, getColumns, resetScrollRegion,
  showCursor, exitAltScreen, enterAltScreen,
} from './terminal.js'
import { isPortInUse, spawnApp, startInfrastructure, bufferLines, killProcess } from './process-manager.js'
import { selectAppsInteractive, killMenuInteractive } from './menu.js'
import { createLayout } from './layout.js'

export const createRunner = (config) => {
  const apps = config.apps
  const colors = config.settings?.colors || COLORS
  const maxBufferLines = config.settings?.maxBufferLines || MAX_BUFFER_LINES
  const menuName = config.name || 'Dev Launcher'

  const processes = new Map()
  let isInMenu = false
  let isExiting = false

  const layout = createLayout(apps, processes)

  // ─── Pane output ──────────────────────────────────────────────────────

  const writeToPane = (appKey, line) => {
    const entry = processes.get(appKey)
    if (!entry) return

    const formatted = `${entry.color}[${entry.app.label}]${RESET} ${line.replace(/\r$/, '')}`
    entry.lines.push(formatted)
    if (entry.lines.length > maxBufferLines) entry.lines.shift()

    if (entry.state === PANE_STATE.HIDDEN) return
    layout.scheduleRepaint(appKey)
  }

  // ─── Process management ───────────────────────────────────────────────

  const startApp = (app, color) => {
    const childProcess = spawnApp(config, app)

    processes.set(app.key, {
      proc: childProcess,
      app,
      color,
      state: PANE_STATE.NORMAL,
      lines: [],
    })

    bufferLines(childProcess.stdout, line => writeToPane(app.key, line))
    bufferLines(childProcess.stderr, line => writeToPane(app.key, line))

    const removeAndRedraw = () => {
      processes.delete(app.key)
      if (processes.size === 0) {
        isExiting = true
        const top = layout.getStatusTopRow()
        moveTo(top, 1);     clearLine(); write('─'.repeat(getColumns()))
        moveTo(top + 1, 1); clearLine()
        write(`  ${color}[${app.label}]${RESET} All apps stopped.`)
        moveTo(top + 2, 1); clearLine()
        write(`  ${DIM}Press any key to exit${RESET}`)
        for (let row = top + 3; row <= getRows(); row++) {
          moveTo(row, 1); clearLine()
        }
        process.stdin.once('data', () => { cleanUp(); process.exit(0) })
        return
      }
      if (!isInMenu) layout.drawLayout()
    }

    childProcess.on('error', err => {
      layout.setStatusMessage(
        `${RED}${app.label}: Failed to start "${app.cmd}" — ${err.message}${RESET}`,
        5000,
      )
      removeAndRedraw()
    })

    childProcess.on('exit', code => {
      writeToPane(app.key, `${DIM}exited (code ${code})${RESET}`)
      removeAndRedraw()
    })
  }

  const killApp = key => {
    const entry = processes.get(key)
    if (!entry) return
    killProcess(entry)
  }

  const killAll = () => {
    for (const key of [...processes.keys()]) killApp(key)
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  const cleanUp = () => {
    layout.clearTimers()
    try { process.stdin.setRawMode(false) } catch {}
    showCursor()
    resetScrollRegion()
    moveTo(getRows(), 1)
    exitAltScreen()
  }

  // ─── Shared helpers ──────────────────────────────────────────────────

  const runInfrastructure = async (appsToStart) => {
    for (const app of appsToStart.filter(a => a.infra)) {
      write(`\n  Starting ${app.infra.label} for ${app.label}...`)
      try {
        await startInfrastructure(config, app)
        write(' done\n')
      } catch (err) {
        write(` failed: ${err.message}\n`)
      }
    }
  }

  const launchApps = (appsToStart, colorOffset = 0) => {
    appsToStart.forEach((app, index) =>
      startApp(app, colors[(colorOffset + index) % colors.length])
    )
  }

  const checkPorts = () => Promise.all(
    apps.map(app => app.port ? isPortInUse(app.port) : Promise.resolve(false))
  )

  // ─── Start more apps ─────────────────────────────────────────────────

  const startMoreApps = async () => {
    const portResults = await checkPorts()
    const alreadyRunning = apps.map(
      (app, index) => processes.has(app.key) || portResults[index]
    )

    if (alreadyRunning.every(Boolean)) return

    const selected = await selectAppsInteractive(apps, alreadyRunning, menuName)
    if (selected === null) {
      cleanUp()
      killAll()
      setTimeout(() => process.exit(0), 500)
      return
    }

    const toStart = selected.filter(
      app => !processes.has(app.key)
        && !portResults[apps.indexOf(app)]
    )

    if (toStart.length > 0) {
      await runInfrastructure(toStart)
      launchApps(toStart, processes.size)
    }

    layout.drawLayout()
  }

  // ─── Running mode ─────────────────────────────────────────────────────

  // ─── Key dispatch ────────────────────────────────────────────────────

  const TOGGLE_VISIBILITY = {
    [PANE_STATE.HIDDEN]: PANE_STATE.NORMAL,
    [PANE_STATE.NORMAL]: PANE_STATE.HIDDEN,
    [PANE_STATE.EXPANDED]: PANE_STATE.HIDDEN,
  }

  const togglePaneVisibility = (appIndex) => {
    const entry = processes.get(apps[appIndex]?.key)
    if (!entry) return
    entry.state = TOGGLE_VISIBILITY[entry.state]
    layout.drawLayout()
  }

  const togglePaneExpand = (appIndex) => {
    if (appIndex >= apps.length) return
    const entry = processes.get(apps[appIndex].key)
    if (!entry) return

    if (entry.state === PANE_STATE.EXPANDED) {
      entry.state = PANE_STATE.NORMAL
    } else {
      for (const other of processes.values()) {
        if (other.state === PANE_STATE.EXPANDED) other.state = PANE_STATE.NORMAL
      }
      entry.state = PANE_STATE.EXPANDED
    }
    layout.drawLayout()
  }

  const quit = () => {
    cleanUp()
    killAll()
    setTimeout(() => process.exit(0), 500)
  }

  const runCommandLoop = () => {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    const keyHandlers = {
      '\x03': quit,
      'q': quit,
      'Q': quit,
      ...Object.fromEntries(
        Object.entries(EXPAND_KEYS).map(([key, index]) =>
          [key, () => togglePaneExpand(index)]
        )
      ),
    }

    const onKey = async data => {
      if (isInMenu || isExiting) return

      // Direct key lookup
      if (keyHandlers[data]) { keyHandlers[data](); return }

      // Number keys: toggle pane visibility
      const numberKey = parseInt(data)
      if (numberKey >= 1 && numberKey <= apps.length) {
        togglePaneVisibility(numberKey - 1)
        return
      }

      // Menu actions (need async + stdin mode switching)
      if (data === 's' || data === 'S') {
        isInMenu = true
        process.stdin.removeListener('data', onKey)
        process.stdin.setRawMode(false)
        await startMoreApps()
        process.stdin.setRawMode(true)
        process.stdin.on('data', onKey)
        isInMenu = false
        return
      }

      if ((data === 'k' || data === 'K') && processes.size > 0) {
        isInMenu = true
        const keyToKill = await killMenuInteractive(processes, layout.getStatusTopRow)
        isInMenu = false
        if (keyToKill) killApp(keyToKill)
        layout.drawStatusBar()
        return
      }
    }

    process.stdin.on('data', onKey)
  }

  // ─── Resize handling ──────────────────────────────────────────────────

  process.stdout.on('resize', () => {
    if (processes.size > 0) layout.drawLayout()
  })

  // ─── Signal handling ──────────────────────────────────────────────────

  process.on('SIGINT', () => {
    cleanUp()
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

    const appsByKey = Object.fromEntries(apps.map(a => [a.key, a]))

    const resolveApps = {
      all: () => [...apps],
      apps: () => options.apps.split(',').map(k => {
        const key = k.trim()
        if (!appsByKey[key]) {
          console.error(`Unknown app key: "${key}". Available: ${apps.map(a => a.key).join(', ')}`)
          process.exit(1)
        }
        return appsByKey[key]
      }),
      menu: async () => {
        const portResults = await checkPorts()
        const selected = await selectAppsInteractive(apps, portResults, menuName)
        if (selected === null) { cleanUp(); process.exit(0) }
        return selected.filter(app => !portResults[apps.indexOf(app)])
      },
    }

    const mode = options.all ? 'all' : options.apps ? 'apps' : 'menu'
    const toStart = await resolveApps[mode]()

    if (toStart.length === 0) {
      write(`\n${mode === 'menu' ? 'No apps selected.' : 'No apps to start.'}\n`)
      cleanUp()
      setTimeout(() => process.exit(0), 1500)
      return
    }

    await runInfrastructure(toStart)
    launchApps(toStart)

    layout.drawLayout()
    runCommandLoop()
  }

  return { run }
}

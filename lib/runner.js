import { COLORS, PANE_STATE, MAX_BUFFER_LINES, EXPAND_KEYS, DIM, RESET, RED } from './constants.js'
import {
  write, getRows, moveTo, clearLine, getColumns, resetScrollRegion,
  showCursor, hideCursor, exitAltScreen, enterAltScreen,
  enableMouseReporting, disableMouseReporting, stripDestructiveEscapes,
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
  let isInInputMode = false
  let isExiting = false
  let inputBuffer = ''

  const layout = createLayout(apps, processes)

  // ─── Pane output ──────────────────────────────────────────────────────

  const writeToPane = (appKey, line) => {
    const entry = processes.get(appKey)
    if (!entry) return

    const formatted = `${entry.color}[${entry.app.label}]${RESET} ${stripDestructiveEscapes(line).replace(/\r$/, '')}`
    entry.lines.push(formatted)
    if (entry.lines.length > maxBufferLines) entry.lines.shift()

    if (entry.scrollOffset > 0) {
      entry.scrollOffset++
      entry.scrollOffset = Math.min(entry.scrollOffset, Math.max(0, entry.lines.length - 1))
    }

    if (entry.state === PANE_STATE.HIDDEN) return
    if (isInMenu) return
    layout.scheduleRepaint(appKey)
  }

  // ─── Process management ───────────────────────────────────────────────

  const startApp = (app, color) => {
    const childProcess = spawnApp(config, app)

    childProcess.stdin.on('error', () => {})

    processes.set(app.key, {
      proc: childProcess,
      app,
      color,
      state: PANE_STATE.NORMAL,
      lines: [],
      scrollOffset: 0,
      isStopped: false,
    })

    bufferLines(childProcess.stdout, line => writeToPane(app.key, line))
    bufferLines(childProcess.stderr, line => writeToPane(app.key, line))

    const markProcessAsStopped = () => {
      if (isExiting) return
      const entry = processes.get(app.key)
      if (!entry || entry.isStopped) return
      entry.isStopped = true

      if (layout.getFocusedAppKey() === app.key && isInInputMode) {
        exitInputMode()
      }

      const allStopped = [...processes.values()].every(e => e.isStopped)
      if (allStopped) {
        layout.setStatusMessage(
          `${DIM}All apps stopped — s to restart, q to quit${RESET}`,
          0,
        )
      }

      if (!isInMenu) layout.drawLayout()
    }

    childProcess.on('error', err => {
      writeToPane(app.key, `${RED}Failed to start "${app.cmd}" — ${err.message}${RESET}`)
      layout.setStatusMessage(
        `${RED}${app.label}: Failed to start "${app.cmd}" — ${err.message}${RESET}`,
        5000,
      )
      markProcessAsStopped()
    })

    childProcess.on('exit', code => {
      writeToPane(app.key, `${DIM}exited (code ${code})${RESET}`)
      markProcessAsStopped()
    })
  }

  const killApp = key => {
    const entry = processes.get(key)
    if (!entry || entry.isStopped) return
    killProcess(entry)
  }

  const killAll = () => {
    for (const key of [...processes.keys()]) killApp(key)
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  const cleanUp = () => {
    layout.clearTimers()
    disableMouseReporting()
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
      (app, index) => {
        const entry = processes.get(app.key)
        return (entry && !entry.isStopped) || portResults[index]
      }
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
      app => {
        const entry = processes.get(app.key)
        return (!entry || entry.isStopped) && !portResults[apps.indexOf(app)]
      }
    )

    if (toStart.length > 0) {
      await runInfrastructure(toStart)
      layout.setStatusMessage(null, 0)
      launchApps(toStart, processes.size)
    }

    layout.drawLayout()
  }

  // ─── Running mode ─────────────────────────────────────────────────────

  // ─── Key dispatch ────────────────────────────────────────────────────

  const getRunningAppKey = (index) => [...processes.keys()][index]

  const TOGGLE_VISIBILITY = {
    [PANE_STATE.HIDDEN]: PANE_STATE.NORMAL,
    [PANE_STATE.NORMAL]: PANE_STATE.HIDDEN,
    [PANE_STATE.EXPANDED]: PANE_STATE.HIDDEN,
  }

  const togglePaneVisibility = (runningIndex) => {
    const appKey = getRunningAppKey(runningIndex)
    const entry = processes.get(appKey)
    if (!entry) return

    const wasHidden = entry.state === PANE_STATE.HIDDEN
    entry.state = TOGGLE_VISIBILITY[entry.state]

    if (wasHidden) entry.scrollOffset = 0
    if (entry.state === PANE_STATE.HIDDEN && layout.getFocusedAppKey() === appKey) {
      layout.setFocusedAppKey(null)
    }

    layout.drawLayout()
  }

  const togglePaneExpand = (runningIndex) => {
    const appKey = getRunningAppKey(runningIndex)
    const entry = processes.get(appKey)
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

  const scrollPane = (appKey, delta) => {
    const entry = processes.get(appKey)
    if (!entry || entry.state === PANE_STATE.HIDDEN) return

    const paneHeight = layout.getContentHeight()
    const maxOffset = Math.max(0, entry.lines.length - paneHeight)
    entry.scrollOffset = Math.max(0, Math.min(maxOffset, entry.scrollOffset + delta))
    layout.repaintPane(appKey)
  }

  const scrollFocusedPane = (delta) => {
    const focusedKey = layout.getFocusedAppKey()
    if (!focusedKey) return
    scrollPane(focusedKey, delta)
  }

  const focusPane = (appKey) => {
    const previousKey = layout.getFocusedAppKey()
    if (previousKey === appKey) return
    layout.setFocusedAppKey(appKey)
    if (previousKey) layout.repaintPane(previousKey)
    layout.repaintPane(appKey)
    layout.drawStatusBar()
  }

  const cycleFocus = () => {
    const visibleEntries = [...processes.entries()].filter(
      ([, entry]) => entry.state !== PANE_STATE.HIDDEN
    )
    if (visibleEntries.length === 0) return

    const currentKey = layout.getFocusedAppKey()
    const currentIndex = visibleEntries.findIndex(([key]) => key === currentKey)
    const nextIndex = (currentIndex + 1) % visibleEntries.length
    focusPane(visibleEntries[nextIndex][0])
  }

  const clearScrollState = () => {
    for (const entry of processes.values()) {
      entry.scrollOffset = 0
    }
    layout.setFocusedAppKey(null)
    layout.drawLayout()
  }

  // ─── Input mode ───────────────────────────────────────────────────────

  const refreshInputDisplay = () => {
    layout.setInputLine(inputBuffer)
    layout.drawInputLine()
  }

  const enterInputMode = () => {
    const focusedKey = layout.getFocusedAppKey()
    if (!focusedKey) return
    const entry = processes.get(focusedKey)
    if (!entry?.proc?.stdin?.writable) return
    isInInputMode = true
    inputBuffer = ''
    layout.setInputMode(true)
    layout.setInputLine('')
    layout.repaintPane(focusedKey)
    layout.drawStatusBar()
  }

  const exitInputMode = () => {
    isInInputMode = false
    inputBuffer = ''
    layout.setInputMode(false)
    layout.setInputLine(null)
    hideCursor()
    layout.drawStatusBar()
    const focusedKey = layout.getFocusedAppKey()
    if (focusedKey) layout.repaintPane(focusedKey)
  }

  // ─── Mouse handling ───────────────────────────────────────────────────

  const parseMouseEvent = (data) => {
    const match = data.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/)
    if (!match) return null
    return {
      button: parseInt(match[1]),
      column: parseInt(match[2]),
      row: parseInt(match[3]),
      isRelease: match[4] === 'm',
    }
  }

  const findPaneAtColumn = (column) => {
    const panes = layout.computePanes()
    return panes.find(pane =>
      column >= pane.columnStart && column < pane.columnStart + pane.width
    )
  }

  const handleMouseEvent = (event) => {
    if (event.isRelease) return

    const pane = findPaneAtColumn(event.column)
    if (!pane) return

    const appKey = pane.entry.app.key

    if (event.button === 0) {
      focusPane(appKey)
    } else if (event.button === 64 || event.button === 65) {
      focusPane(appKey)
      scrollPane(appKey, event.button === 64 ? 3 : -3)
    }
  }

  const quit = () => {
    isExiting = true
    cleanUp()
    killAll()
    setTimeout(() => process.exit(0), 500)
  }

  const runCommandLoop = () => {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    enableMouseReporting()

    const keyHandlers = {
      '\x03': quit,
      'q': quit,
      'Q': quit,
      '\t': () => cycleFocus(),
      '\x1b': () => clearScrollState(),
      '\x1b[A': () => scrollFocusedPane(1),
      '\x1b[B': () => scrollFocusedPane(-1),
      '\x1b[5~': () => scrollFocusedPane(layout.getContentHeight()),
      '\x1b[6~': () => scrollFocusedPane(-layout.getContentHeight()),
      ...Object.fromEntries(
        Object.entries(EXPAND_KEYS).map(([key, index]) =>
          [key, () => togglePaneExpand(index)]
        )
      ),
    }

    const onKey = async data => {
      if (isInMenu || isExiting) return

      // Input mode: buffer keystrokes and send on Enter
      if (isInInputMode) {
        if (data === '\x1b' || data === '\x03') {
          exitInputMode()
          return
        }
        if (data.startsWith('\x1b')) return
        if (data === '\r') {
          const focusedKey = layout.getFocusedAppKey()
          const entry = focusedKey && processes.get(focusedKey)
          if (entry?.proc?.stdin?.writable) {
            entry.proc.stdin.write(inputBuffer + '\n')
            writeToPane(focusedKey, `${DIM}> ${inputBuffer}${RESET}`)
          }
          inputBuffer = ''
          refreshInputDisplay()
          return
        }
        if (data === '\x7f' || data === '\x08') {
          inputBuffer = inputBuffer.slice(0, -1)
          refreshInputDisplay()
          return
        }
        inputBuffer += data
        refreshInputDisplay()
        return
      }

      // Mouse events
      const mouseEvent = parseMouseEvent(data)
      if (mouseEvent) { handleMouseEvent(mouseEvent); return }

      // Direct key lookup
      if (keyHandlers[data]) { keyHandlers[data](); return }

      // Number keys: toggle pane visibility
      const numberKey = parseInt(data)
      if (numberKey >= 1 && numberKey <= processes.size) {
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
        const runningProcesses = new Map(
          [...processes].filter(([, entry]) => !entry.isStopped)
        )
        if (runningProcesses.size === 0) return
        isInMenu = true
        const keyToKill = await killMenuInteractive(runningProcesses, layout.getStatusTopRow)
        isInMenu = false
        if (keyToKill) killApp(keyToKill)
        layout.drawStatusBar()
        return
      }

      // Enter input mode (requires focused pane)
      if ((data === 'i' || data === '\r') && layout.getFocusedAppKey()) {
        enterInputMode()
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
    isExiting = true
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

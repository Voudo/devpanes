import { BOLD, DIM, RESET } from './constants.js'
import {
  write, clearScreen, showCursor, moveTo, clearLine, cols,
} from './terminal.js'

export const selectAppsInteractive = (apps, alreadyRunning, menuName) =>
  new Promise(resolve => {
    const checked = apps.map((_, index) => alreadyRunning[index])
    let cursor = 0

    const render = () => {
      clearScreen()
      showCursor()
      write(`${BOLD}${menuName || 'Dev Launcher'}${RESET}\n\n`)
      for (let index = 0; index < apps.length; index++) {
        const app = apps[index]
        const checkMark = checked[index] ? 'x' : ' '
        const cursorMark = index === cursor ? '>' : ' '
        const runningNote = alreadyRunning[index]
          ? `  ${DIM}(already running)${RESET}`
          : ''
        const infraNote = app.infra
          ? `  ${DIM}(${app.infra.label})${RESET}`
          : ''
        const portNote = app.port
          ? `  port ${app.port}`
          : ''
        write(`  ${cursorMark} [${checkMark}] ${app.label.padEnd(16)}${portNote}${runningNote}${infraNote}\n`)
      }
      write(`\n${DIM}↑↓ move  Space toggle  A toggle all  Enter start  Esc cancel${RESET}\n`)
    }

    render()

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    const onKey = data => {
      if (data === '\x03') {
        process.stdin.removeListener('data', onKey)
        resolve(null) // signal Ctrl+C
        return
      } else if (data === '\x1b[A') {
        cursor = (cursor - 1 + apps.length) % apps.length
      } else if (data === '\x1b[B') {
        cursor = (cursor + 1) % apps.length
      } else if (data === ' ') {
        checked[cursor] = !checked[cursor]
      } else if (data === 'a' || data === 'A') {
        const allChecked = checked.every(Boolean)
        checked.fill(!allChecked)
      } else if (data === '\x1b' && data.length === 1) {
        process.stdin.setRawMode(false)
        process.stdin.removeListener('data', onKey)
        resolve([])
        return
      } else if (data === '\r' || data === '\n') {
        process.stdin.setRawMode(false)
        process.stdin.removeListener('data', onKey)
        resolve(apps.filter((_, index) => checked[index]))
        return
      }
      render()
    }

    process.stdin.on('data', onKey)
  })

export const killMenuInteractive = (procs, statusTop) =>
  new Promise(resolve => {
    const entries = [...procs.values()]
    if (entries.length === 0) { resolve(null); return }

    let cursor = 0

    const render = () => {
      const top = statusTop()
      moveTo(top, 1); clearLine(); write('─'.repeat(cols()))
      moveTo(top + 1, 1); clearLine(); write('  Select app to stop:')
      for (let index = 0; index < entries.length; index++) {
        const cursorMark = index === cursor ? '>' : ' '
        moveTo(top + 2 + index, 1); clearLine()
        write(`    ${cursorMark} ${entries[index].app.label}`)
      }
      moveTo(top + 2 + entries.length, 1); clearLine()
      moveTo(top + 3 + entries.length, 1); clearLine()
      write(`  ${DIM}↑↓ move  Enter confirm  Esc cancel${RESET}`)
    }

    render()

    const onKey = data => {
      if (data === '\x03') {
        process.stdin.removeListener('data', onKey)
        resolve(null)
        return
      } else if (data === '\x1b[A') {
        cursor = (cursor - 1 + entries.length) % entries.length
        render()
      } else if (data === '\x1b[B') {
        cursor = (cursor + 1) % entries.length
        render()
      } else if (data === '\r' || data === '\n') {
        process.stdin.removeListener('data', onKey)
        resolve(entries[cursor].app.key)
      } else if (data === '\x1b') {
        process.stdin.removeListener('data', onKey)
        resolve(null)
      }
    }

    process.stdin.on('data', onKey)
  })

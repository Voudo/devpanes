import { BOLD, DIM, RESET } from './constants.js'
import {
  write, clearScreen, showCursor, moveTo, clearLine, getColumns,
} from './terminal.js'

// Shared interactive menu loop: takes a render fn, key→action map, and
// resolves the promise when an action returns a value.
const interactiveMenu = (render, keyBindings) =>
  new Promise(resolve => {
    render()

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    const done = value => {
      process.stdin.removeListener('data', onKey)
      resolve(value)
    }

    const onKey = data => {
      // Walk bindings in order — first match wins
      for (const [test, action] of keyBindings) {
        if (test(data)) {
          const result = action(done)
          if (result !== undefined) return
          render()
          return
        }
      }
    }

    process.stdin.on('data', onKey)
  })

const isUp    = data => data === '\x1b[A'
const isDown  = data => data === '\x1b[B'
const isEnter = data => data === '\r' || data === '\n'
const isEsc   = data => data === '\x1b' && data.length === 1
const isCtrlC = data => data === '\x03'

export const selectAppsInteractive = (apps, alreadyRunning, menuName) => {
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

  return interactiveMenu(render, [
    [isCtrlC, done => done(null)],
    [isUp,    () => { cursor = (cursor - 1 + apps.length) % apps.length }],
    [isDown,  () => { cursor = (cursor + 1) % apps.length }],
    [data => data === ' ', () => { checked[cursor] = !checked[cursor] }],
    [data => data === 'a' || data === 'A', () => {
      checked.fill(!checked.every(Boolean))
    }],
    [isEsc, done => { process.stdin.setRawMode(false); done([]) }],
    [isEnter, done => {
      process.stdin.setRawMode(false)
      done(apps.filter((_, index) => checked[index]))
    }],
  ])
}

export const killMenuInteractive = (processes, statusTop) => {
  const entries = [...processes.values()]
  if (entries.length === 0) return Promise.resolve(null)

  let cursor = 0

  const render = () => {
    const top = statusTop()
    moveTo(top, 1); clearLine(); write('─'.repeat(getColumns()))
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

  return interactiveMenu(render, [
    [isCtrlC, done => done(null)],
    [isUp,    () => { cursor = (cursor - 1 + entries.length) % entries.length }],
    [isDown,  () => { cursor = (cursor + 1) % entries.length }],
    [isEnter, done => done(entries[cursor].app.key)],
    [isEsc,   done => done(null)],
  ])
}

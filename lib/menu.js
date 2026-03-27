import { BOLD, DIM, RESET } from './constants.js'
import {
  write, clearScreen, showCursor, moveTo, clearLine, getColumns,
} from './terminal.js'

// ─── Filter helpers ──────────────────────────────────────────────────────

export const fuzzyMatch = (query, text) => {
  if (query === '') return true
  const lowerText = text.toLowerCase()
  let position = 0
  for (const character of query.toLowerCase()) {
    position = lowerText.indexOf(character, position)
    if (position === -1) return false
    position++
  }
  return true
}

const getFilteredIndices = (items, filterText, getLabel) =>
  items.reduce((indices, item, index) => {
    if (fuzzyMatch(filterText, getLabel(item))) indices.push(index)
    return indices
  }, [])

// ─── Shared interactive menu loop ────────────────────────────────────────

// Takes a render fn, key→action map, and resolves the promise when an
// action returns a value.  Actions receive (done, data).
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
          const result = action(done, data)
          if (result !== undefined) return
          render()
          return
        }
      }
    }

    process.stdin.on('data', onKey)
  })

// ─── Key predicates ──────────────────────────────────────────────────────

const isUp        = data => data === '\x1b[A'
const isDown      = data => data === '\x1b[B'
const isEnter     = data => data === '\r' || data === '\n'
const isEsc       = data => data === '\x1b' && data.length === 1
const isCtrlC     = data => data === '\x03'
const isCtrlA     = data => data === '\x01'
const isBackspace = data => data === '\x7f' || data === '\x08'
const isPrintable = data => data.length === 1 && data > ' ' && data <= '~'

// ─── App selection menu ──────────────────────────────────────────────────

export const selectAppsInteractive = (apps, alreadyRunning, menuName) => {
  const checked = apps.map((_, index) => alreadyRunning[index])
  let cursor = 0
  let filterText = ''

  const getVisibleIndices = () =>
    getFilteredIndices(apps, filterText, app => app.label)

  const clampCursor = () => {
    const count = getVisibleIndices().length
    if (count === 0) cursor = 0
    else cursor = Math.min(cursor, count - 1)
  }

  const render = () => {
    const visibleIndices = getVisibleIndices()
    clearScreen()
    showCursor()
    write(`${BOLD}${menuName || 'Dev Launcher'}${RESET}`)
    if (filterText) write(`  filter: ${filterText}`)
    write('\n\n')

    if (visibleIndices.length === 0) {
      write(`  ${DIM}No matches${RESET}\n`)
    } else {
      for (let position = 0; position < visibleIndices.length; position++) {
        const index = visibleIndices[position]
        const app = apps[index]
        const checkMark = checked[index] ? 'x' : ' '
        const cursorMark = position === cursor ? '>' : ' '
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
    }
    write(`\n${DIM}↑↓ move  Space toggle  ^A all  Enter start  Esc cancel  Type to filter${RESET}\n`)
  }

  return interactiveMenu(render, [
    [isCtrlC, done => done(null)],
    [isUp,    () => {
      const indices = getVisibleIndices()
      if (indices.length > 0) cursor = (cursor - 1 + indices.length) % indices.length
    }],
    [isDown,  () => {
      const indices = getVisibleIndices()
      if (indices.length > 0) cursor = (cursor + 1) % indices.length
    }],
    [data => data === ' ', () => {
      const indices = getVisibleIndices()
      if (indices.length > 0) checked[indices[cursor]] = !checked[indices[cursor]]
    }],
    [isCtrlA, () => {
      const indices = getVisibleIndices()
      if (indices.length === 0) return
      const isAllChecked = indices.every(index => checked[index])
      for (const index of indices) checked[index] = !isAllChecked
    }],
    [isBackspace, () => {
      if (filterText.length > 0) {
        filterText = filterText.slice(0, -1)
        clampCursor()
      }
    }],
    [isEsc, done => {
      if (filterText) {
        filterText = ''
        cursor = 0
      } else {
        process.stdin.setRawMode(false)
        done([])
      }
    }],
    [isEnter, done => {
      process.stdin.setRawMode(false)
      done(apps.filter((_, index) => checked[index]))
    }],
    [isPrintable, (_done, data) => {
      filterText += data
      cursor = 0
      clampCursor()
    }],
  ])
}

// ─── Kill menu ───────────────────────────────────────────────────────────

export const killMenuInteractive = (processes, statusTop) => {
  const entries = [...processes.values()]
  if (entries.length === 0) return Promise.resolve(null)

  let cursor = 0
  let filterText = ''

  const getVisibleIndices = () =>
    getFilteredIndices(entries, filterText, entry => entry.app.label)

  const clampCursor = () => {
    const count = getVisibleIndices().length
    if (count === 0) cursor = 0
    else cursor = Math.min(cursor, count - 1)
  }

  const render = () => {
    const visibleIndices = getVisibleIndices()
    const top = statusTop()
    moveTo(top, 1); clearLine(); write('─'.repeat(getColumns()))

    let headerText = '  Select app to stop:'
    if (filterText) headerText += `  filter: ${filterText}`
    moveTo(top + 1, 1); clearLine(); write(headerText)

    for (let position = 0; position < visibleIndices.length; position++) {
      const cursorMark = position === cursor ? '>' : ' '
      moveTo(top + 2 + position, 1); clearLine()
      write(`    ${cursorMark} ${entries[visibleIndices[position]].app.label}`)
    }
    // Clear rows no longer occupied by filtered entries
    for (let row = top + 2 + visibleIndices.length; row < top + 2 + entries.length; row++) {
      moveTo(row, 1); clearLine()
    }
    moveTo(top + 2 + entries.length, 1); clearLine()
    moveTo(top + 3 + entries.length, 1); clearLine()
    write(`  ${DIM}↑↓ move  Enter confirm  Esc cancel  Type to filter${RESET}`)
  }

  return interactiveMenu(render, [
    [isCtrlC, done => done(null)],
    [isUp,    () => {
      const indices = getVisibleIndices()
      if (indices.length > 0) cursor = (cursor - 1 + indices.length) % indices.length
    }],
    [isDown,  () => {
      const indices = getVisibleIndices()
      if (indices.length > 0) cursor = (cursor + 1) % indices.length
    }],
    [isEnter, done => {
      const indices = getVisibleIndices()
      done(indices.length > 0 ? entries[indices[cursor]].app.key : null)
    }],
    [isBackspace, () => {
      if (filterText.length > 0) {
        filterText = filterText.slice(0, -1)
        clampCursor()
      }
    }],
    [isEsc, done => {
      if (filterText) {
        filterText = ''
        cursor = 0
      } else {
        done(null)
      }
    }],
    [isPrintable, (_done, data) => {
      filterText += data
      cursor = 0
      clampCursor()
    }],
  ])
}

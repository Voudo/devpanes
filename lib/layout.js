import { DIM, RESET, BOLD, PANE_STATE } from './constants.js'
import {
  write, getColumns, getRows, moveTo, clearLine, clearScreen, hideCursor,
  truncateToWidth,
} from './terminal.js'

export const createLayout = (apps, processes) => {
  let statusMessage = null
  let statusMessageTimer = null
  let focusedAppKey = null

  const getStatusRowCount = () => apps.length + 4
  const getStatusTopRow = () => getRows() - getStatusRowCount() + 1

  const drawStatusBar = () => {
    const top = getStatusTopRow()
    const totalColumns = getColumns()

    // Divider
    moveTo(top, 1); clearLine()
    write('─'.repeat(totalColumns))

    // Tab bar
    moveTo(top + 1, 1); clearLine()
    const runningEntries = [...processes.values()]
    const STATE_DISPLAY = {
      [PANE_STATE.HIDDEN]:   { suffix: ` ${DIM}hidden${RESET}`, isDimmed: true },
      [PANE_STATE.EXPANDED]: { suffix: ` ${BOLD}wide${RESET}`,  isDimmed: false },
      [PANE_STATE.NORMAL]:   { suffix: '',                       isDimmed: false },
    }

    const tabBar = runningEntries.map(entry => {
      const appIndex = apps.findIndex(app => app.key === entry.app.key)
      const { suffix, isDimmed } = STATE_DISPLAY[entry.state]
      const labelColor = isDimmed ? DIM : entry.color
      return `${labelColor}[${appIndex + 1}] ${entry.app.label}${RESET}${suffix}`
    }).join('   ')
    write(`  ${tabBar}`)

    // Status message
    moveTo(top + 2, 1); clearLine()
    if (statusMessage) {
      write(`  ${statusMessage}`)
    }

    // Hints
    moveTo(top + 3, 1); clearLine()
    if (runningEntries.length > 0) {
      const scrollHint = focusedAppKey
        ? 'esc unfocus  ↑↓ scroll  '
        : 'click/tab focus  '
      write(`  ${DIM}${scrollHint}1-${apps.length} show/hide  !@#$ expand  s start  k kill  q quit${RESET}`)
    }

    // Clear remaining rows
    for (let row = top + 4; row <= getRows(); row++) {
      moveTo(row, 1); clearLine()
    }
  }

  const setStatusMessage = (message, durationMs = 4000) => {
    statusMessage = message
    if (statusMessageTimer) clearTimeout(statusMessageTimer)
    statusMessageTimer = setTimeout(() => {
      statusMessage = null
      drawStatusBar()
    }, durationMs)
    drawStatusBar()
  }

  const computePanes = () => {
    const visibleEntries = [...processes.values()].filter(
      entry => entry.state !== PANE_STATE.HIDDEN
    )
    const visibleCount = visibleEntries.length
    if (visibleCount === 0) return []

    const separatorCount = visibleCount - 1
    const availableColumns = getColumns() - separatorCount
    const expandedEntry = visibleEntries.find(
      entry => entry.state === PANE_STATE.EXPANDED
    )

    let widths
    if (expandedEntry && visibleCount > 1) {
      const expandedWidth = Math.floor(availableColumns * 2 / 3)
      const remainingWidth = availableColumns - expandedWidth
      const normalCount = visibleCount - 1
      const normalWidth = Math.floor(remainingWidth / normalCount)
      const extraColumns = remainingWidth - normalWidth * normalCount

      widths = visibleEntries.map((entry, index) => {
        if (entry === expandedEntry) return expandedWidth
        const normalIndex = visibleEntries
          .slice(0, index)
          .filter(other => other !== expandedEntry).length
        return normalWidth + (normalIndex < extraColumns ? 1 : 0)
      })
    } else {
      const baseWidth = Math.floor(availableColumns / visibleCount)
      const extraColumns = availableColumns - baseWidth * visibleCount
      widths = visibleEntries.map(
        (_, index) => baseWidth + (index < extraColumns ? 1 : 0)
      )
    }

    const contentTop = 2
    const contentBottom = getStatusTopRow() - 1

    let currentColumn = 1
    return visibleEntries.map((entry, index) => {
      const pane = {
        entry,
        columnStart: currentColumn,
        width: widths[index],
        headerRow: 1,
        contentTop,
        contentBottom,
        height: Math.max(0, contentBottom - contentTop + 1),
      }
      currentColumn += widths[index] + 1
      return pane
    })
  }

  const drawPaneHeader = pane => {
    const isFocused = pane.entry.app.key === focusedAppKey
    const scrollOffset = pane.entry.scrollOffset || 0

    const boldPrefix = isFocused ? BOLD : ''
    const label = ` ${pane.entry.app.label} `
    const scrollTag = scrollOffset > 0 ? ` ↑${scrollOffset} ` : ''
    const contentLength = label.length + scrollTag.length
    const dashCount = Math.max(0, pane.width - contentLength)

    moveTo(pane.headerRow, pane.columnStart)
    write(truncateToWidth(
      `${pane.entry.color}${boldPrefix}${label}${RESET}${'─'.repeat(dashCount)}${DIM}${scrollTag}${RESET}`,
      pane.width,
    ))
  }

  const repaintPaneContent = pane => {
    const { entry, width, contentTop, height, columnStart } = pane
    if (height <= 0) return

    const scrollOffset = entry.scrollOffset || 0
    const totalLines = entry.lines.length
    const endIndex = Math.max(0, totalLines - scrollOffset)
    const startIndex = Math.max(0, endIndex - height)
    const visibleLines = entry.lines.slice(startIndex, endIndex)
    const emptyRowCount = height - visibleLines.length

    for (let row = 0; row < emptyRowCount; row++) {
      moveTo(contentTop + row, columnStart)
      write(' '.repeat(width))
    }

    for (let row = 0; row < visibleLines.length; row++) {
      moveTo(contentTop + emptyRowCount + row, columnStart)
      write(truncateToWidth(visibleLines[row], width))
    }
  }

  const drawSeparators = panes => {
    if (panes.length < 2) return
    const bottom = getStatusTopRow() - 1
    for (const pane of panes.slice(0, -1)) {
      const separatorColumn = pane.columnStart + pane.width
      for (let row = 1; row <= bottom; row++) {
        moveTo(row, separatorColumn)
        write(`${DIM}│${RESET}`)
      }
    }
  }

  const drawLayout = () => {
    hideCursor()
    clearScreen()

    const panes = computePanes()

    if (panes.length === 0 && processes.size > 0) {
      const centerRow = Math.floor((getStatusTopRow() - 1) / 2)
      moveTo(centerRow, 1)
      write(
        `${DIM}  All panes hidden — press a number key to show${RESET}`
      )
    }

    for (const pane of panes) {
      drawPaneHeader(pane)
      repaintPaneContent(pane)
    }

    drawSeparators(panes)
    drawStatusBar()
    moveTo(getRows(), 1)
  }

  // Debounced repaint
  const pendingRepaints = new Set()
  let repaintTimer = null

  const scheduleRepaint = appKey => {
    pendingRepaints.add(appKey)
    if (repaintTimer) return
    repaintTimer = setTimeout(() => {
      repaintTimer = null
      const panes = computePanes()
      for (const key of pendingRepaints) {
        const pane = panes.find(p => p.entry.app.key === key)
        if (pane) {
          drawPaneHeader(pane)
          repaintPaneContent(pane)
        }
      }
      pendingRepaints.clear()
      moveTo(getRows(), 1)
    }, 16)
  }

  const repaintPane = appKey => {
    const panes = computePanes()
    const pane = panes.find(p => p.entry.app.key === appKey)
    if (!pane) return
    drawPaneHeader(pane)
    repaintPaneContent(pane)
    moveTo(getRows(), 1)
  }

  const getContentHeight = () => {
    const contentTop = 2
    const contentBottom = getStatusTopRow() - 1
    return Math.max(0, contentBottom - contentTop + 1)
  }

  const setFocusedAppKey = key => { focusedAppKey = key }
  const getFocusedAppKey = () => focusedAppKey

  const clearTimers = () => {
    if (repaintTimer) { clearTimeout(repaintTimer); repaintTimer = null }
    if (statusMessageTimer) {
      clearTimeout(statusMessageTimer); statusMessageTimer = null
    }
  }

  return {
    computePanes,
    drawLayout,
    drawStatusBar,
    setStatusMessage,
    scheduleRepaint,
    getStatusTopRow,
    clearTimers,
    repaintPane,
    getContentHeight,
    setFocusedAppKey,
    getFocusedAppKey,
  }
}

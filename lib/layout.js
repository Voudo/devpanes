import { DIM, RESET, BOLD, PANE_STATE } from './constants.js'
import {
  write, cols, rows, moveTo, clearLine, clearScreen, hideCursor,
  truncateToWidth,
} from './terminal.js'

export const createLayout = (apps, procs) => {
  let statusMessage = null
  let statusMessageTimer = null

  const statusRows = () => apps.length + 4
  const statusTop = () => rows() - statusRows() + 1

  const drawStatusBar = () => {
    const top = statusTop()
    const totalCols = cols()

    // Divider
    moveTo(top, 1); clearLine()
    write('─'.repeat(totalCols))

    // Tab bar
    moveTo(top + 1, 1); clearLine()
    const runningEntries = [...procs.values()]
    const tabBar = runningEntries.map(entry => {
      const appIndex = apps.findIndex(app => app.key === entry.app.key)
      const num = appIndex + 1
      const stateLabel = entry.state === PANE_STATE.HIDDEN
        ? ` ${DIM}hidden${RESET}`
        : entry.state === PANE_STATE.EXPANDED
          ? ` ${BOLD}wide${RESET}`
          : ''
      const labelColor = entry.state === PANE_STATE.HIDDEN ? DIM : entry.color
      return `${labelColor}[${num}] ${entry.app.label}${RESET}${stateLabel}`
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
      write(`  ${DIM}1-${apps.length} show/hide  !@#$ expand  s start  k kill  q quit${RESET}`)
    }

    // Clear remaining rows
    for (let row = top + 4; row <= rows(); row++) {
      moveTo(row, 1); clearLine()
    }
  }

  const setStatusMessage = (msg, durationMs = 4000) => {
    statusMessage = msg
    if (statusMessageTimer) clearTimeout(statusMessageTimer)
    statusMessageTimer = setTimeout(() => {
      statusMessage = null
      drawStatusBar()
    }, durationMs)
    drawStatusBar()
  }

  const computePanes = () => {
    const visibleEntries = [...procs.values()].filter(
      entry => entry.state !== PANE_STATE.HIDDEN
    )
    const visibleCount = visibleEntries.length
    if (visibleCount === 0) return []

    const separatorCount = visibleCount - 1
    const availableCols = cols() - separatorCount
    const expandedEntry = visibleEntries.find(
      entry => entry.state === PANE_STATE.EXPANDED
    )

    let widths
    if (expandedEntry && visibleCount > 1) {
      const expandedWidth = Math.floor(availableCols * 2 / 3)
      const remainingWidth = availableCols - expandedWidth
      const normalCount = visibleCount - 1
      const normalWidth = Math.floor(remainingWidth / normalCount)
      const extraCols = remainingWidth - normalWidth * normalCount

      widths = visibleEntries.map((entry, index) => {
        if (entry === expandedEntry) return expandedWidth
        const normalIndex = visibleEntries
          .slice(0, index)
          .filter(other => other !== expandedEntry).length
        return normalWidth + (normalIndex < extraCols ? 1 : 0)
      })
    } else {
      const baseWidth = Math.floor(availableCols / visibleCount)
      const extraCols = availableCols - baseWidth * visibleCount
      widths = visibleEntries.map(
        (_, index) => baseWidth + (index < extraCols ? 1 : 0)
      )
    }

    const contentTop = 2
    const contentBottom = statusTop() - 1

    let currentCol = 1
    return visibleEntries.map((entry, index) => {
      const pane = {
        entry,
        colStart: currentCol,
        width: widths[index],
        headerRow: 1,
        contentTop,
        contentBottom,
        height: Math.max(0, contentBottom - contentTop + 1),
      }
      currentCol += widths[index] + 1
      return pane
    })
  }

  const repaintPaneContent = pane => {
    const { entry, width, contentTop, height, colStart } = pane
    if (height <= 0) return

    const visibleLines = entry.lines.slice(-height)
    const emptyRowCount = height - visibleLines.length

    for (let row = 0; row < emptyRowCount; row++) {
      moveTo(contentTop + row, colStart)
      write(' '.repeat(width))
    }

    for (let row = 0; row < visibleLines.length; row++) {
      moveTo(contentTop + emptyRowCount + row, colStart)
      write(truncateToWidth(visibleLines[row], width))
    }
  }

  const drawSeparators = panes => {
    if (panes.length < 2) return
    const bottom = statusTop() - 1
    for (const pane of panes.slice(0, -1)) {
      const sepCol = pane.colStart + pane.width
      for (let row = 1; row <= bottom; row++) {
        moveTo(row, sepCol)
        write(`${DIM}│${RESET}`)
      }
    }
  }

  const drawLayout = () => {
    hideCursor()
    clearScreen()

    const panes = computePanes()

    if (panes.length === 0 && procs.size > 0) {
      const centerRow = Math.floor((statusTop() - 1) / 2)
      moveTo(centerRow, 1)
      write(
        `${DIM}  All panes hidden — press a number key to show${RESET}`
      )
    }

    for (const pane of panes) {
      const label = ` ${pane.entry.app.label} `
      const dashCount = Math.max(0, pane.width - label.length)
      moveTo(pane.headerRow, pane.colStart)
      write(truncateToWidth(
        `${pane.entry.color}${label}${RESET}${'─'.repeat(dashCount)}`,
        pane.width,
      ))
      repaintPaneContent(pane)
    }

    drawSeparators(panes)
    drawStatusBar()
    moveTo(rows(), 1)
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
        if (pane) repaintPaneContent(pane)
      }
      pendingRepaints.clear()
      moveTo(rows(), 1)
    }, 16)
  }

  const clearTimers = () => {
    if (repaintTimer) { clearTimeout(repaintTimer); repaintTimer = null }
    if (statusMessageTimer) {
      clearTimeout(statusMessageTimer); statusMessageTimer = null
    }
  }

  return {
    drawLayout,
    drawStatusBar,
    setStatusMessage,
    scheduleRepaint,
    statusTop,
    clearTimers,
  }
}

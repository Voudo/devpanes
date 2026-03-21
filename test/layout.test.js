import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { PANE_STATE } from '../lib/constants.js'
import { createLayout } from '../lib/layout.js'

const originalColumnsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'columns')
const originalRowsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'rows')

const setTerminalSize = (columns, rows) => {
  Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true })
  Object.defineProperty(process.stdout, 'rows', { value: rows, configurable: true })
}

const restoreTerminalSize = () => {
  if (originalColumnsDescriptor) Object.defineProperty(process.stdout, 'columns', originalColumnsDescriptor)
  if (originalRowsDescriptor) Object.defineProperty(process.stdout, 'rows', originalRowsDescriptor)
}

const makeEntry = (key, label, state = PANE_STATE.NORMAL) => ({
  app: { key, label },
  color: '\x1b[36m',
  state,
  lines: [],
  scrollOffset: 0,
})

const makeProcesses = (...entries) => {
  const map = new Map()
  for (const [key, label, state] of entries) {
    map.set(key, makeEntry(key, label, state))
  }
  return map
}

describe('computePanes', () => {
  const apps = [
    { key: 'web', label: 'Web' },
    { key: 'api', label: 'API' },
    { key: 'db', label: 'DB' },
  ]

  beforeEach(() => setTerminalSize(80, 24))
  afterEach(() => restoreTerminalSize())

  it('returns empty array when no processes are running', () => {
    const layout = createLayout(apps, new Map())
    assert.deepEqual(layout.computePanes(), [])
  })

  it('returns empty array when all panes are hidden', () => {
    const processes = makeProcesses(['web', 'Web', PANE_STATE.HIDDEN])
    const panes = createLayout(apps, processes).computePanes()
    assert.deepEqual(panes, [])
  })

  it('gives single pane the full width', () => {
    const processes = makeProcesses(['web', 'Web'])
    const panes = createLayout(apps, processes).computePanes()

    assert.equal(panes.length, 1)
    assert.equal(panes[0].width, 80)
    assert.equal(panes[0].columnStart, 1)
  })

  it('splits two panes equally minus separator', () => {
    const processes = makeProcesses(['web', 'Web'], ['api', 'API'])
    const panes = createLayout(apps, processes).computePanes()

    assert.equal(panes.length, 2)
    // 80 columns - 1 separator = 79 available, 79/2 = 39 each, 1 extra to first
    assert.equal(panes[0].width + panes[1].width, 79)
    assert.equal(panes[0].width, 40)
    assert.equal(panes[1].width, 39)
  })

  it('splits three panes equally minus separators', () => {
    const processes = makeProcesses(['web', 'Web'], ['api', 'API'], ['db', 'DB'])
    const panes = createLayout(apps, processes).computePanes()

    assert.equal(panes.length, 3)
    // 80 - 2 separators = 78, 78/3 = 26 each
    const totalWidth = panes.reduce((sum, pane) => sum + pane.width, 0)
    assert.equal(totalWidth, 78)
  })

  it('gives expanded pane 2/3 of the width', () => {
    const processes = makeProcesses(['web', 'Web', PANE_STATE.EXPANDED], ['api', 'API'])
    const panes = createLayout(apps, processes).computePanes()

    assert.equal(panes.length, 2)
    // 80 - 1 separator = 79, expanded = floor(79 * 2/3) = 52
    assert.equal(panes[0].width, 52)
    assert.equal(panes[1].width, 27)
  })

  it('gives expanded pane 2/3 with two normal panes', () => {
    const processes = makeProcesses(['web', 'Web', PANE_STATE.EXPANDED], ['api', 'API'], ['db', 'DB'])
    const panes = createLayout(apps, processes).computePanes()

    assert.equal(panes.length, 3)
    // 80 - 2 separators = 78, expanded = floor(78 * 2/3) = 52, remaining = 26, normal = 13 each
    assert.equal(panes[0].width, 52)
    assert.equal(panes[1].width + panes[2].width, 26)
  })

  it('skips hidden panes in width calculation', () => {
    const processes = makeProcesses(['web', 'Web'], ['api', 'API', PANE_STATE.HIDDEN], ['db', 'DB'])
    const panes = createLayout(apps, processes).computePanes()

    assert.equal(panes.length, 2)
    assert.equal(panes[0].width + panes[1].width, 79)
  })

  it('sets correct columnStart positions', () => {
    const processes = makeProcesses(['web', 'Web'], ['api', 'API'])
    const panes = createLayout(apps, processes).computePanes()

    assert.equal(panes[0].columnStart, 1)
    assert.equal(panes[1].columnStart, panes[0].width + 2)
  })

  it('computes positive height from terminal rows', () => {
    const processes = makeProcesses(['web', 'Web'])
    const panes = createLayout(apps, processes).computePanes()

    assert.ok(panes[0].height > 0)
    assert.equal(panes[0].contentTop, 2)
    assert.ok(panes[0].contentBottom > panes[0].contentTop)
  })

  it('handles odd column counts with correct remainder distribution', () => {
    setTerminalSize(81, 24)
    const processes = makeProcesses(['web', 'Web'], ['api', 'API'])
    const panes = createLayout(apps, processes).computePanes()

    // 81 - 1 separator = 80, 80/2 = 40 each exactly
    assert.equal(panes[0].width, 40)
    assert.equal(panes[1].width, 40)
  })
})

describe('focusedAppKey', () => {
  const apps = [
    { key: 'web', label: 'Web' },
    { key: 'api', label: 'API' },
  ]

  it('starts with no focused pane', () => {
    const layout = createLayout(apps, new Map())
    assert.equal(layout.getFocusedAppKey(), null)
  })

  it('sets and gets focused app key', () => {
    const layout = createLayout(apps, new Map())
    layout.setFocusedAppKey('web')
    assert.equal(layout.getFocusedAppKey(), 'web')
  })

  it('clears focused app key with null', () => {
    const layout = createLayout(apps, new Map())
    layout.setFocusedAppKey('web')
    layout.setFocusedAppKey(null)
    assert.equal(layout.getFocusedAppKey(), null)
  })
})

describe('getContentHeight', () => {
  const apps = [
    { key: 'web', label: 'Web' },
    { key: 'api', label: 'API' },
    { key: 'db', label: 'DB' },
  ]

  beforeEach(() => setTerminalSize(80, 24))
  afterEach(() => restoreTerminalSize())

  it('returns positive content height', () => {
    const layout = createLayout(apps, new Map())
    const height = layout.getContentHeight()
    assert.ok(height > 0)
  })

  it('matches pane height from computePanes', () => {
    const processes = makeProcesses(['web', 'Web'])
    const layout = createLayout(apps, processes)
    const panes = layout.computePanes()
    assert.equal(layout.getContentHeight(), panes[0].height)
  })

  it('accounts for status bar rows', () => {
    // 24 rows, status bar = apps.length + 4 = 7 rows, content top = 2
    // content bottom = 24 - 7 = 17, height = 17 - 2 + 1 = 16
    const layout = createLayout(apps, new Map())
    assert.equal(layout.getContentHeight(), 16)
  })
})

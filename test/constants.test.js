import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { COLORS, DIM, RESET, BOLD, RED, PANE_STATE, MAX_BUFFER_LINES, EXPAND_KEYS } from '../lib/constants.js'

describe('COLORS', () => {
  it('has 7 ANSI color codes', () => {
    assert.equal(COLORS.length, 7)
  })

  it('each color starts with ANSI escape', () => {
    for (const color of COLORS) {
      assert.ok(color.startsWith('\x1b['), `expected ANSI escape, got: ${JSON.stringify(color)}`)
    }
  })
})

describe('ANSI constants', () => {
  it('DIM is an ANSI escape', () => {
    assert.ok(DIM.startsWith('\x1b['))
  })

  it('RESET is an ANSI escape', () => {
    assert.ok(RESET.startsWith('\x1b['))
  })

  it('BOLD is an ANSI escape', () => {
    assert.ok(BOLD.startsWith('\x1b['))
  })

  it('RED is an ANSI escape', () => {
    assert.ok(RED.startsWith('\x1b['))
  })
})

describe('PANE_STATE', () => {
  it('has exactly three states', () => {
    const keys = Object.keys(PANE_STATE)
    assert.equal(keys.length, 3)
    assert.ok(keys.includes('HIDDEN'))
    assert.ok(keys.includes('NORMAL'))
    assert.ok(keys.includes('EXPANDED'))
  })

  it('values are distinct strings', () => {
    const values = Object.values(PANE_STATE)
    assert.equal(new Set(values).size, 3)
    for (const value of values) {
      assert.equal(typeof value, 'string')
    }
  })
})

describe('MAX_BUFFER_LINES', () => {
  it('is a positive integer', () => {
    assert.ok(Number.isInteger(MAX_BUFFER_LINES))
    assert.ok(MAX_BUFFER_LINES > 0)
  })
})

describe('EXPAND_KEYS', () => {
  it('maps 7 shift-number characters to indices 0-6', () => {
    const expectedKeys = ['!', '@', '#', '$', '%', '^', '&']
    assert.deepEqual(Object.keys(EXPAND_KEYS), expectedKeys)
    for (let i = 0; i < expectedKeys.length; i++) {
      assert.equal(EXPAND_KEYS[expectedKeys[i]], i)
    }
  })
})

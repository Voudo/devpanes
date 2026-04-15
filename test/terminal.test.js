import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { truncateToWidth, stripDestructiveEscapes } from '../lib/terminal.js'
import { RESET } from '../lib/constants.js'

describe('truncateToWidth', () => {
  describe('plain text', () => {
    it('pads short text to maxWidth with spaces', () => {
      const result = truncateToWidth('hi', 5)
      assert.equal(result, 'hi   ' + RESET)
    })

    it('truncates long text to maxWidth', () => {
      const result = truncateToWidth('hello world', 5)
      assert.equal(result, 'hello' + RESET)
    })

    it('handles exact fit with no padding', () => {
      const result = truncateToWidth('abc', 3)
      assert.equal(result, 'abc' + RESET)
    })

    it('handles empty string with padding', () => {
      const result = truncateToWidth('', 5)
      assert.equal(result, '     ' + RESET)
    })

    it('handles maxWidth of 1', () => {
      const result = truncateToWidth('hello', 1)
      assert.equal(result, 'h' + RESET)
    })

    it('handles maxWidth of 0', () => {
      const result = truncateToWidth('hello', 0)
      assert.equal(result, RESET)
    })
  })

  describe('ANSI escape codes', () => {
    it('preserves color codes and counts only visible characters', () => {
      const result = truncateToWidth('\x1b[31mhello\x1b[0m', 5)
      // text already ends with RESET, truncateToWidth appends its own RESET after
      // but the \x1b[0m in the input is consumed as part of the text scan,
      // so result is the scanned content + appended RESET
      assert.equal(result, '\x1b[31mhello\x1b[0m')
    })

    it('truncates visible text but keeps opening color code', () => {
      const result = truncateToWidth('\x1b[31mhello world\x1b[0m', 5)
      assert.equal(result, '\x1b[31mhello' + RESET)
    })

    it('pads when colored text is shorter than maxWidth', () => {
      const result = truncateToWidth('\x1b[31mhi\x1b[0m', 5)
      assert.equal(result, '\x1b[31mhi\x1b[0m   ' + RESET)
    })

    it('handles multiple escape sequences', () => {
      const result = truncateToWidth('\x1b[1mA\x1b[0m\x1b[31mB\x1b[0m', 2)
      // Scan stops after 2 visible chars; trailing \x1b[0m from input is not consumed
      assert.equal(result, '\x1b[1mA\x1b[0m\x1b[31mB' + RESET)
    })

    it('handles text that is only ANSI codes with no visible chars', () => {
      const result = truncateToWidth('\x1b[31m\x1b[0m', 3)
      assert.equal(result, '\x1b[31m\x1b[0m   ' + RESET)
    })

    it('handles escape code at the start followed by truncation', () => {
      const result = truncateToWidth('\x1b[36m[Web]\x1b[0m output', 5)
      // [Web] = 5 visible chars, scan stops; trailing escape + text truncated
      assert.equal(result, '\x1b[36m[Web]' + RESET)
    })
  })

  describe('edge cases', () => {
    it('always ends with RESET', () => {
      const cases = ['', 'hello', '\x1b[31mred\x1b[0m']
      for (const input of cases) {
        const result = truncateToWidth(input, 10)
        assert.ok(result.endsWith(RESET), `expected RESET suffix for input: ${JSON.stringify(input)}`)
      }
    })
  })
})

describe('stripDestructiveEscapes', () => {
  it('removes clear screen sequences', () => {
    assert.equal(stripDestructiveEscapes('\x1b[2J'), '')
    assert.equal(stripDestructiveEscapes('\x1b[2J\x1b[3J\x1b[H'), '')
  })

  it('removes cursor movement sequences', () => {
    assert.equal(stripDestructiveEscapes('\x1b[5A'), '')
    assert.equal(stripDestructiveEscapes('\x1b[3B'), '')
    assert.equal(stripDestructiveEscapes('\x1b[10C'), '')
    assert.equal(stripDestructiveEscapes('\x1b[2D'), '')
    assert.equal(stripDestructiveEscapes('\x1b[1;1H'), '')
    assert.equal(stripDestructiveEscapes('\x1b[1;1f'), '')
  })

  it('removes clear line sequences', () => {
    assert.equal(stripDestructiveEscapes('\x1b[2K'), '')
    assert.equal(stripDestructiveEscapes('\x1b[0K'), '')
  })

  it('removes scroll region and private mode sequences', () => {
    assert.equal(stripDestructiveEscapes('\x1b[r'), '')
    assert.equal(stripDestructiveEscapes('\x1b[?1049h'), '')
    assert.equal(stripDestructiveEscapes('\x1b[?25l'), '')
  })

  it('preserves color and style codes', () => {
    assert.equal(stripDestructiveEscapes('\x1b[31mhello\x1b[0m'), '\x1b[31mhello\x1b[0m')
    assert.equal(stripDestructiveEscapes('\x1b[1m\x1b[36mbold cyan\x1b[0m'), '\x1b[1m\x1b[36mbold cyan\x1b[0m')
  })

  it('strips destructive sequences while preserving colors in mixed text', () => {
    const input = '\x1b[2J\x1b[H\x1b[36mServer ready\x1b[0m'
    assert.equal(stripDestructiveEscapes(input), '\x1b[36mServer ready\x1b[0m')
  })

  it('preserves plain text', () => {
    assert.equal(stripDestructiveEscapes('hello world'), 'hello world')
  })
})
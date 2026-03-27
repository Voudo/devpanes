import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fuzzyMatch } from '../lib/menu.js'

describe('fuzzyMatch', () => {
  it('matches empty query against any text', () => {
    assert.equal(fuzzyMatch('', 'anything'), true)
    assert.equal(fuzzyMatch('', ''), true)
  })

  it('matches exact text', () => {
    assert.equal(fuzzyMatch('web', 'web'), true)
  })

  it('matches substring', () => {
    assert.equal(fuzzyMatch('api', 'my-api-server'), true)
  })

  it('matches characters in order (fuzzy)', () => {
    assert.equal(fuzzyMatch('ws', 'web-server'), true)
    assert.equal(fuzzyMatch('mas', 'my-api-server'), true)
  })

  it('is case insensitive', () => {
    assert.equal(fuzzyMatch('WEB', 'web-server'), true)
    assert.equal(fuzzyMatch('web', 'Web-Server'), true)
  })

  it('rejects when characters are not in order', () => {
    assert.equal(fuzzyMatch('sw', 'web-server'), false)
  })

  it('rejects when a character is missing', () => {
    assert.equal(fuzzyMatch('webx', 'web-server'), false)
  })

  it('rejects non-empty query against empty text', () => {
    assert.equal(fuzzyMatch('a', ''), false)
  })
})

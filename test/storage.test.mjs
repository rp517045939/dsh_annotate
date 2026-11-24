import test from 'node:test'
import assert from 'node:assert/strict'
import { loadClient, installFakePlatform, note } from './helpers.mjs'

installFakePlatform()

const { mod } = await loadClient()
const { activateSession, addNote, removeNote, loadSession, store } = mod.__test__

test('notes persist per session and come back on re-activation', () => {
  activateSession('session-a')
  assert.equal(store.notes.length, 0)

  const first = note({ id: 'n1', sessionId: 'session-a', comment: '第一条' })
  addNote(first)
  assert.equal(store.notes.length, 1)
  assert.equal(store.notes[0].comment, '第一条')

  const raw = JSON.parse(globalThis.localStorage.getItem('dsh.annotate.v1.session-a'))
  assert.equal(raw.v, 1)
  assert.equal(raw.notes.length, 1)
  assert.equal(raw.notes[0].anchor.kind, 'range')

  activateSession('session-b')
  assert.equal(store.notes.length, 0, 'session-b must start empty')

  activateSession('session-a')
  assert.equal(store.notes.length, 1)
  assert.equal(store.notes[0].comment, '第一条')

  removeNote('n1')
  assert.equal(store.notes.length, 0)
  const after = JSON.parse(globalThis.localStorage.getItem('dsh.annotate.v1.session-a'))
  assert.equal(after.notes.length, 0)
})

test('overall comment is stored with the session', () => {
  activateSession('session-c')
  store.overall = '整体意见'
  // saveSession is internal; a note write persists the overall alongside it.
  addNote(note({ id: 'n2', sessionId: 'session-c', comment: 'x' }))
  const loaded = loadSession('session-c')
  assert.equal(loaded.overall, '整体意见')
})

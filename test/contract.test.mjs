import test from 'node:test'
import assert from 'node:assert/strict'
import { loadClient, installFakePlatform } from './helpers.mjs'

const { definition, mod } = await loadClient()

test('module contract matches the third-party browser-half shape', () => {
  assert.equal(definition.id, 'dsh-annotate')
  assert.equal(typeof definition.factory, 'function')
  assert.equal(mod.name, 'dsh-annotate-client')
  assert.deepEqual(mod.inject, ['slots'])
  assert.equal(typeof mod.apply, 'function')
})

test('apply mounts the tray, the send bridge, the overlay and the message action', () => {
  const { ctx, registered } = installFakePlatform()
  mod.apply(ctx)
  assert.deepEqual(registered.map((entry) => entry.id), [
    'annotate-tray',
    'annotate-bridge',
    'annotate-overlay',
    'annotate-action',
  ])
  assert.deepEqual(registered.map((entry) => entry.name), [
    'conversation.input.overlay',
    'conversation.input.overlay',
    'shell.overlay',
    'conversation.chat.assistant-actions',
  ])
})

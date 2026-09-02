/**
 * A link naming the Saved tab opens it.
 *
 * Nothing here asserts what getActiveType() holds. The Saved tab is not a
 * calculator and does not change it — only that the list rendered rather than
 * throwing on an active type the URL never named.
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { bootApp, activeTab, $ } from './helpers/boot-app.js'

let dom

before(async () => {
  ;({ dom } = await bootApp('https://example.test/saved'))
})

test('booting at /saved opens the Saved tab', () => {
  assert.equal(activeTab(), 'saved')
  assert.equal(dom.window.location.pathname, '/saved')
  assert.ok($('.saved-head'), 'the saved list rendered rather than throwing')
})

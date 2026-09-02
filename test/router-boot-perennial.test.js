/** A link naming the perennial worksheet opens it. */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { bootApp, activeTab } from './helpers/boot-app.js'

let dom

before(async () => {
  ;({ dom } = await bootApp('https://example.test/perennial'))
})

test('booting at /perennial opens the perennial tab', () => {
  assert.equal(activeTab(), 'perennial')
  assert.equal(dom.window.location.pathname, '/perennial')
})

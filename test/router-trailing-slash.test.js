/**
 * /cover-crop/ is the same address as /cover-crop.
 *
 * A static host resolving a directory can land a reload on the slashed form, so
 * it has to name the same tab.
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { bootApp, activeTab } from './helpers/boot-app.js'

before(async () => {
  await bootApp('https://example.test/cover-crop/')
})

test('a trailing slash still resolves to the cover crop tab', () => {
  assert.equal(activeTab(), 'covercrop')
})

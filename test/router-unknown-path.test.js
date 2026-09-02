/**
 * An unknown path names no tab either, the same as a bare base URL, and must
 * fall back to the stored preference without throwing.
 *
 * On the deployed site this is what 404.html serves, so it is not a hypothetical
 * URL: any path no longer routed arrives here.
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { bootApp, activeTab } from './helpers/boot-app.js'

let error

before(async () => {
  ;({ error } = await bootApp('https://example.test/nonsense', { prefs: { tab: 'covercrop' } }))
})

test('an unknown path does not crash the boot', () => {
  assert.equal(error, null, `expected no error, got ${error}`)
})

test('an unknown path falls back to the stored preference', () => {
  assert.equal(activeTab(), 'covercrop')
})

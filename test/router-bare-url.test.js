/**
 * A bare base URL names no tab, so it must not override the stored preference —
 * that is what brings a returning user back to where they were.
 *
 * The preference is seeded to cover crop, which is NOT the 'perennial' default,
 * so a pass cannot be the default agreeing by accident.
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { bootApp, activeTab } from './helpers/boot-app.js'

let dom

before(async () => {
  ;({ dom } = await bootApp('https://example.test/', { prefs: { tab: 'covercrop' } }))
})

test('a bare base URL leaves the stored tab preference alone', () => {
  assert.equal(activeTab(), 'covercrop', 'the stored preference won, not the default perennial')
})

test('the URL is then synced to match the preference it followed', () => {
  assert.equal(dom.window.location.pathname, '/cover-crop')
})

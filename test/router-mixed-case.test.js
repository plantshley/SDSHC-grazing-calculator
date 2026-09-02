/**
 * A slug is matched case-insensitively, and the address is then corrected.
 *
 * These URLs get typed off a handout and read out at workshops, neither of which
 * carries the case. Opening the right worksheet is the first half; rewriting the
 * address to the canonical spelling is the second, so a link shared onward from
 * there is the one everything else uses.
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { bootApp, activeTab } from './helpers/boot-app.js'

let dom

before(async () => {
  ;({ dom } = await bootApp('https://example.test/Cover-Crop'))
})

test('a mixed-case path opens the worksheet it names', () => {
  assert.equal(activeTab(), 'covercrop')
})

test('and the address bar is corrected to the canonical spelling', () => {
  assert.equal(dom.window.location.pathname, '/cover-crop')
})

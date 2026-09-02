/**
 * The query string and the fragment survive every tab change.
 *
 * ?noga=1 is the author's analytics opt-out and is read on EVERY load, so a tab
 * change that dropped it would turn reporting back on for the one browser that
 * asked to be left out.
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { bootApp, click } from './helpers/boot-app.js'

let dom

before(async () => {
  ;({ dom } = await bootApp('https://example.test/perennial?noga=1#notes'))
})

test('the query string and fragment survive the initial boot', () => {
  assert.equal(dom.window.location.pathname, '/perennial')
  assert.equal(dom.window.location.search, '?noga=1')
  assert.equal(dom.window.location.hash, '#notes')
})

test('the query string and fragment survive a tab change', () => {
  click(dom, '.tab[data-tab="covercrop"]')
  assert.equal(dom.window.location.pathname, '/cover-crop')
  assert.equal(dom.window.location.search, '?noga=1', 'query string carried over')
  assert.equal(dom.window.location.hash, '#notes', 'fragment carried over')
})

test('switching again keeps carrying both', () => {
  click(dom, '.tab[data-tab="saved"]')
  assert.equal(dom.window.location.pathname, '/saved')
  assert.equal(dom.window.location.search, '?noga=1')
  assert.equal(dom.window.location.hash, '#notes')
})

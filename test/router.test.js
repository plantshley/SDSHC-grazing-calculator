/**
 * Every tab has an address.
 *
 * Two halves that have to stay in step and live in different files: the `slug`
 * on each descriptor in src/calculators.js, which is what the app reads, and
 * the ROUTES list in vite.config.js, which is what the build writes a copy of
 * index.html at. A slug added to one and not the other is a link that names the
 * right tab and 404s on the first visit, which nothing else here would catch.
 *
 * The app half boots main.js against jsdom at a URL that names the cover crop
 * worksheet. main.js is a singleton, so this file gets one boot and one starting
 * URL; app.test.js covers the bare-URL case by being the one that boots at '/'.
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const SHELL = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const CONFIG = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

let dom

before(async () => {
  // No base path in the test build (import.meta.env is a Vite thing), so the
  // routes sit directly under '/', which is what BASE_PATH falls back to.
  dom = new JSDOM(SHELL, { url: 'https://example.test/cover-crop', pretendToBeVisual: true })

  global.window = dom.window
  global.document = dom.window.document
  Object.defineProperty(global, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  })
  global.localStorage = dom.window.localStorage
  global.addEventListener = dom.window.addEventListener.bind(dom.window)
  global.removeEventListener = dom.window.removeEventListener.bind(dom.window)
  global.MutationObserver = dom.window.MutationObserver
  global.HTMLElement = dom.window.HTMLElement
  global.Node = dom.window.Node
  global.Blob = dom.window.Blob
  dom.window.scrollTo = () => {}
  dom.window.confirm = () => true
  dom.window.alert = () => {}
  dom.window.print = () => {}
  global.confirm = dom.window.confirm
  global.alert = dom.window.alert

  await import('../src/main.js')
})

const $ = (sel) => document.querySelector(sel)

function click(sel) {
  const el = typeof sel === 'string' ? $(sel) : sel
  assert.ok(el, `expected to find ${sel}`)
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  return el
}

const activeTab = () => $('.tab.active')?.dataset.tab ?? null

test('a slug names a tab and the two halves agree on the list', async () => {
  const { CALCULATORS } = await import('../src/calculators.js')
  const fromApp = [...CALCULATORS.map((d) => d.slug), 'saved']

  for (const desc of CALCULATORS) {
    assert.ok(desc.slug, `${desc.id} carries a slug`)
    assert.match(desc.slug, /^[a-z0-9-]+$/, `${desc.id}'s slug is URL-safe`)
  }
  assert.equal(new Set(fromApp).size, fromApp.length, 'no two tabs answer to the same path')

  // The build writes a copy of index.html at each of these. Parsed rather than
  // imported: vite.config.js pulls in vite itself, which is not what this is
  // asking about.
  const declared = CONFIG.match(/const ROUTES = \[([^\]]*)\]/)
  assert.ok(declared, 'vite.config.js declares a ROUTES list')
  const fromBuild = [...declared[1].matchAll(/'([^']+)'/g)].map((m) => m[1])

  assert.deepEqual(
    [...fromBuild].sort(),
    [...fromApp].sort(),
    'every slug the app can show has a file written for it, and no more'
  )
})

test('the URL decides which tab opens', () => {
  assert.equal(activeTab(), 'covercrop', 'opened on the worksheet the path named')
})

test('changing tabs rewrites the address without stacking up history', () => {
  const before = dom.window.history.length

  click('.tab[data-tab="saved"]')
  assert.equal(dom.window.location.pathname, '/saved')

  click('.tab[data-tab="perennial"]')
  assert.equal(dom.window.location.pathname, '/perennial')

  click('.tab[data-tab="covercrop"]')
  assert.equal(dom.window.location.pathname, '/cover-crop', 'the slug, not the id')

  assert.equal(
    dom.window.history.length,
    before,
    'the URL is replaced, so Back still leaves the app rather than walking the tabs'
  )
})

test('the query string survives a tab change', () => {
  // ?noga=1 is the author's analytics opt-out and is read on every load, so a
  // tab change that dropped it would turn reporting back on.
  dom.window.history.replaceState(null, '', '/cover-crop?noga=1')
  click('.tab[data-tab="saved"]')
  assert.equal(dom.window.location.pathname, '/saved')
  assert.equal(dom.window.location.search, '?noga=1')
})

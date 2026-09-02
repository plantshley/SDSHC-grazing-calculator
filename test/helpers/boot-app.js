/**
 * Boot main.js against a jsdom copy of the app shell, at a chosen URL.
 *
 * ONE BOOT PER TEST FILE. main.js is a module singleton: it reads the URL, the
 * preferences and the stored working copies once, in its boot block, and every
 * later import in the same process hands back the module it already evaluated.
 * A file that wants a second starting URL is a second file.
 *
 * Not itself a `*.test.js`, so `node --test "test/**\/*.test.js"` walks past it.
 *
 * app.test.js and covercrop.test.js still carry their own copy of this. They
 * were written before there was a second one and they set up more than this
 * does; folding them in is a separate job from routing.
 */

import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const SHELL = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

/** The key prefs.js reads. Seeding it stands in for a previous visit. */
const PREFS_KEY = 'sdshc-gc-prefs'

/**
 * @param {string} url        what the address bar says when the app starts
 * @param {object} [options]
 * @param {object} [options.prefs]  stored preferences, written BEFORE main.js
 *   reads them. Seed `tab` to something other than the 'perennial' default when
 *   the test is about a fallback, so a pass cannot be the default agreeing by
 *   accident.
 * @returns {Promise<{dom: JSDOM, error: Error|null}>} `error` is whatever boot
 *   threw, for the tests whose whole point is that it threw nothing.
 */
export async function bootApp(url, { prefs } = {}) {
  const dom = new JSDOM(SHELL, { url, pretendToBeVisual: true })

  global.window = dom.window
  global.document = dom.window.document
  // Node 22 defines globalThis.navigator with a getter and no setter, so a
  // plain assignment throws.
  Object.defineProperty(global, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  })
  global.localStorage = dom.window.localStorage
  // A module calling bare addEventListener() gets window's in a browser.
  global.addEventListener = dom.window.addEventListener.bind(dom.window)
  global.removeEventListener = dom.window.removeEventListener.bind(dom.window)
  global.MutationObserver = dom.window.MutationObserver
  global.HTMLElement = dom.window.HTMLElement
  global.Node = dom.window.Node
  global.Blob = dom.window.Blob

  // jsdom implements none of these and throws "not implemented" rather than
  // returning, which would abort a click handler part way through.
  dom.window.scrollTo = () => {}
  dom.window.confirm = () => true
  dom.window.alert = () => {}
  dom.window.print = () => {}
  global.confirm = dom.window.confirm
  global.alert = dom.window.alert

  if (prefs) dom.window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))

  let error = null
  try {
    await import('../../src/main.js')
  } catch (err) {
    error = err
  }
  return { dom, error }
}

export const $ = (sel) => document.querySelector(sel)

/** Which tab the page is showing, off the strip rather than off the pref. */
export const activeTab = () => $('.tab.active')?.dataset.tab ?? null

export function click(dom, sel) {
  const el = typeof sel === 'string' ? $(sel) : sel
  if (!el) throw new Error(`expected to find ${sel}`)
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  return el
}

/**
 * The build side of routing: vite.config.js's routeCopies() plugin writes a
 * copy of index.html at every route plus 404.html, and none of those copies
 * should be in the service worker's precache manifest — only index.html,
 * which is what navigateFallback serves offline. Precaching four more copies
 * of the same document would be paying install size to say the same thing.
 *
 * This runs `npm run build` itself rather than assuming dist/ is already
 * built, so it is correct in CI as well as locally. That makes it slower than
 * the rest of the suite; it is still worth having in the same run because a
 * change to routeCopies() or to the workbox globPatterns is exactly the kind
 * of thing routing changes touch without meaning to.
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(ROOT, 'dist')

/**
 * Read out of vite.config.js rather than written again here.
 *
 * The slug list is already in two files and router.test.js is what holds those
 * two together. A third copy typed into this file would be one this test could
 * never fail on: a route added to the config and not to the copy here would
 * build a file nothing checks, which is the whole failure this file exists for.
 */
const CONFIG = readFileSync(resolve(ROOT, 'vite.config.js'), 'utf8')
const ROUTE_FILES = (() => {
  const declared = CONFIG.match(/const ROUTES = \[([^\]]*)\]/)
  assert.ok(declared, 'vite.config.js declares a ROUTES list')
  const slugs = [...declared[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
  assert.ok(slugs.length, 'the ROUTES list was parsed, not just matched empty')
  return ['404.html', ...slugs.map((s) => `${s}.html`)]
})()

before(() => {
  execFileSync('npm', ['run', 'build'], {
    cwd: ROOT,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  })
})

test('the build writes a copy of index.html at every route and at 404', () => {
  for (const name of ROUTE_FILES) {
    assert.ok(existsSync(resolve(DIST, name)), `dist/${name} exists`)
  }
})

test('every route copy is byte-identical to dist/index.html', () => {
  const index = readFileSync(resolve(DIST, 'index.html'))
  for (const name of ROUTE_FILES) {
    const copy = readFileSync(resolve(DIST, name))
    assert.ok(copy.equals(index), `dist/${name} is byte-identical to dist/index.html`)
  }
})

test('none of the route copies are in the precache manifest, only index.html', () => {
  const sw = readFileSync(resolve(DIST, 'sw.js'), 'utf8')

  // The route copy names must not appear anywhere in the service worker at
  // all — not just outside the manifest — since none of them should be
  // referenced by workbox in any capacity (precache, warm-runtime, etc).
  for (const name of ROUTE_FILES) {
    assert.ok(!sw.includes(name), `${name} does not appear anywhere in dist/sw.js`)
  }

  // index.html DOES appear — it is the precached document navigateFallback
  // serves offline.
  assert.ok(sw.includes('index.html'), 'index.html is referenced in dist/sw.js')
})

/**
 * Preferences, and the one migration in them.
 *
 * The split being pinned here: a PLACE IN A WORKSHEET is per calculator, a WAY
 * OF WORKING is not. Before there was a second worksheet, `step`, `maxStep` and
 * `openSteps` sat flat at the top level and described the only calculator there
 * was. They belong to perennial, and somebody who has not opened the app since
 * must not be put back on step 1 of a sheet they were halfway through.
 *
 * prefs.js caches on first read, so each scenario imports its own copy of the
 * module: a query string on a file: specifier is what gives Node a separate
 * instance. Without it the first test's storage would be the only one any of
 * them ever saw.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const KEY = 'sdshc-gc-prefs'
const store = new Map()

globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

let instance = 0

/** A prefs.js that has read nothing yet, over the given stored blob. */
async function freshPrefs(stored) {
  store.clear()
  if (stored !== undefined) store.set(KEY, JSON.stringify(stored))
  instance += 1
  return import(`../src/prefs.js?case=${instance}`)
}

const readBack = () => JSON.parse(store.get(KEY))

test('v1 flat keys land under the perennial wizard', async () => {
  const { getWizard } = await freshPrefs({ theme: 'dark', step: 3, maxStep: 4, openSteps: [2] })

  assert.deepEqual(getWizard('perennial'), { step: 3, maxStep: 4, openSteps: [2] })
})

test('the v1 keys are gone from storage afterwards, not migrated on every load', async () => {
  const { getPref } = await freshPrefs({ step: 3, maxStep: 4, openSteps: [2] })
  // Reading anything is what triggers the migration, and it normalises on disk
  // so the next session does not do it again.
  getPref('theme')

  const stored = readBack()
  assert.equal(stored.step, undefined)
  assert.equal(stored.maxStep, undefined)
  assert.equal(stored.openSteps, undefined)
  assert.equal(stored.wizard.perennial.step, 3)
})

test('a wizard block already written by this build wins over the v1 keys', async () => {
  // Both present means a build that writes `wizard` has already run. The flat
  // keys are then stale leftovers and must not overwrite the newer answer.
  const { getWizard } = await freshPrefs({
    step: 3,
    maxStep: 4,
    wizard: { perennial: { step: 1, maxStep: 1, openSteps: [] } },
  })
  assert.equal(getWizard('perennial').step, 1)
})

test('a stored wizard block holding one calculator still leaves the others usable', async () => {
  // The shallow spread over DEFAULTS is not enough for this key: a block with
  // only perennial in it would replace the whole default and leave every other
  // calculator undefined, which getWizard() has to survive.
  const { getWizard } = await freshPrefs({ wizard: { perennial: { step: 2, maxStep: 2, openSteps: [] } } })

  assert.equal(getWizard('perennial').step, 2)
  assert.deepEqual(getWizard('covercrop'), { step: 0, maxStep: 0, openSteps: [] })
  assert.deepEqual(getWizard('nothing-by-this-name'), { step: 0, maxStep: 0, openSteps: [] })
})

test('nothing stored at all is every default, and no migration write', async () => {
  const { getWizard, getPref } = await freshPrefs(undefined)

  assert.deepEqual(getWizard('perennial'), { step: 0, maxStep: 0, openSteps: [] })
  assert.equal(getPref('tab'), 'perennial')
  assert.equal(getPref('showAll'), false)
  assert.equal(store.has(KEY), false, 'a read with nothing to migrate writes nothing')
})

test('one calculator moving through the worksheet does not move the other', async () => {
  const { setWizard, getWizard } = await freshPrefs(undefined)

  setWizard('perennial', { step: 3, maxStep: 4 })
  setWizard('covercrop', { step: 1 })

  assert.deepEqual(getWizard('perennial'), { step: 3, maxStep: 4, openSteps: [] })
  assert.deepEqual(getWizard('covercrop'), { step: 1, maxStep: 0, openSteps: [] })
})

test('setWizard merges rather than replacing what it was not told about', async () => {
  const { setWizard, getWizard } = await freshPrefs(undefined)

  setWizard('perennial', { step: 2, maxStep: 4, openSteps: [1, 2] })
  setWizard('perennial', { step: 3 })

  assert.deepEqual(getWizard('perennial'), { step: 3, maxStep: 4, openSteps: [1, 2] })
})

test('which sections are unfolded is per calculator', async () => {
  const { setStepOpen, isStepOpen, setOpenSteps } = await freshPrefs(undefined)

  setStepOpen('perennial', 2, true)
  assert.equal(isStepOpen('perennial', 2), true)
  assert.equal(isStepOpen('covercrop', 2), false, 'the other worksheet is untouched')

  setStepOpen('perennial', 2, false)
  assert.equal(isStepOpen('perennial', 2), false)

  setOpenSteps('perennial', [0, 3])
  assert.equal(isStepOpen('perennial', 0), true)
  assert.equal(isStepOpen('perennial', 3), true)
  assert.equal(isStepOpen('perennial', 1), false)
})

test('the global preferences stay global', async () => {
  // theme, font, tab, showAll and showStagePhotos are a way of working, not a
  // place in a worksheet, so they are NOT under wizard[type].
  const { setPref, getPref } = await freshPrefs(undefined)

  setPref('showAll', true)
  setPref('font', 'mono')

  const stored = readBack()
  assert.equal(stored.showAll, true)
  assert.equal(stored.font, 'mono')
  assert.equal(getPref('showAll'), true)
})

test('a corrupt prefs blob falls back to the defaults rather than throwing', async () => {
  store.clear()
  store.set(KEY, '{ not json')
  instance += 1
  const { getPref, getWizard } = await import(`../src/prefs.js?case=${instance}`)

  assert.equal(getPref('tab'), 'perennial')
  assert.deepEqual(getWizard('perennial'), { step: 0, maxStep: 0, openSteps: [] })
})

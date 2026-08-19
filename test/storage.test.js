/**
 * The record store, headless.
 *
 * The rules being pinned here are the ones a second calculator put pressure on:
 * a record from before `calcType` existed is a perennial one and must not lose a
 * branch; a record of the OTHER type must not be grafted with perennial branches
 * it has no use for; and the two file readers still tell a backup from one
 * calculation BY NAME rather than by whatever happens to parse.
 *
 * No jsdom. storage.js touches nothing but localStorage, so a Map behind the
 * four methods it uses is the whole environment it needs. It has to be in place
 * before the module is imported, because a static import is hoisted above
 * everything in the file body.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}

const {
  saveWorking,
  loadWorking,
  clearWorking,
  listCalcs,
  saveCalc,
  exportCalcJSON,
  importCalcJSON,
  exportBackupJSON,
  importBackupJSON,
} = await import('../src/storage.js')

const { SCHEMA_VERSION } = await import('../src/calc.js')

const KEY = 'sdshc-gc-calcs'
const reset = () => store.clear()

/* ─────────────────────────────── migration ─────────────────────────────── */

test('a record from before calcType existed is a perennial one', () => {
  reset()
  // Written by v1: no schemaVersion, no calcType, and the branches half there.
  store.set(KEY, JSON.stringify([{ id: 'old-1', name: 'North quarter' }]))

  const [rec] = listCalcs()
  assert.equal(rec.calcType, 'perennial', 'the type is assumed, never guessed from shape')
  assert.equal(rec.schemaVersion, 2)
  // Every branch the perennial worksheet writes into has to exist, or a render
  // reading calc.dm.mode throws on a record nobody can then delete.
  for (const branch of ['samples', 'frame', 'dm', 'usable', 'demand', 'pasture']) {
    assert.ok(rec[branch] !== undefined, `${branch} is filled in`)
  }
  assert.ok(Array.isArray(rec.samples), 'samples is an array, not an object')
  assert.deepEqual(rec.goals, [])
})

test('an ancient record gets dates rather than sorting above everything', () => {
  reset()
  store.set(KEY, JSON.stringify([{ id: 'old-2', name: 'No dates' }]))
  const [rec] = listCalcs()
  // Without this the list sorts on the string "undefined", which compares above
  // any ISO date.
  assert.ok(rec.createdAt, 'createdAt is filled in')
  assert.equal(rec.updatedAt, rec.createdAt)
})

test('a record naming a type this build does not have is kept, not dropped', () => {
  reset()
  store.set(
    KEY,
    JSON.stringify([{ id: 'future-1', name: 'From a newer build', calcType: 'silage', schemaVersion: 9 }])
  )
  const list = listCalcs()
  assert.equal(list.length, 1, 'never drop a record because it is unfamiliar')
  assert.equal(list[0].calcType, 'perennial', 'coerced so it renders as something')
})

test('one unreadable record does not take the rest of the list with it', () => {
  reset()
  store.set(
    KEY,
    JSON.stringify([{ id: 'a', name: 'Keeps' }, null, 'not an object', { name: 'no id' }])
  )
  const list = listCalcs()
  assert.equal(list.length, 1)
  assert.equal(list[0].id, 'a')
})

/* ───────────────────────── the working copies ──────────────────────────── */

test('each calculator has its own working key and neither can take the other', () => {
  reset()
  saveWorking({ id: 'p', calcType: 'perennial', name: 'Perennial work' })
  saveWorking({ id: 'c', calcType: 'covercrop', name: 'Cover crop work' })

  // The perennial key is the ORIGINAL one and must not have moved: somebody
  // mid-worksheet when they upgraded still has to find their work.
  assert.ok(store.has('sdshc-gc-working'), 'perennial stays in sdshc-gc-working')
  assert.ok(store.has('sdshc-gc-working-covercrop'))

  assert.equal(loadWorking('perennial').name, 'Perennial work')
  assert.equal(loadWorking('covercrop').name, 'Cover crop work')

  clearWorking('covercrop')
  assert.equal(loadWorking('covercrop'), null)
  assert.equal(loadWorking('perennial').name, 'Perennial work', 'the other one survives')
})

test('the type comes off the record, not off whatever is on screen', () => {
  reset()
  // printSavedCalc() borrows a record of the other type. Writing it to the
  // active calculator's key would put it where the wrong worksheet reads.
  saveWorking({ id: 'c', calcType: 'covercrop', name: 'Borrowed' })
  assert.equal(loadWorking('perennial'), null, 'the perennial key is untouched')
  assert.equal(loadWorking('covercrop').name, 'Borrowed')
})

test('a working copy that will not parse is null, not a throw', () => {
  reset()
  store.set('sdshc-gc-working', '{ not json')
  assert.equal(loadWorking('perennial'), null)
})

/* ───────────────────────── files in and out ────────────────────────────── */

test('a calculation file carries calcType and drops tag and sortIndex', () => {
  const text = exportCalcJSON({
    id: 'x',
    calcType: 'perennial',
    name: 'North',
    samples: ['20'],
    tag: 'blue',
    sortIndex: 3,
  })
  const parsed = JSON.parse(text)
  // tag and sortIndex describe one device's LIST. calcType describes the
  // calculation, and without it the file cannot be filed on the way back in.
  assert.equal(parsed.calcType, 'perennial')
  assert.equal(parsed.tag, undefined)
  assert.equal(parsed.sortIndex, undefined)
  assert.equal(parsed.schemaVersion, SCHEMA_VERSION)
})

test('importCalcJSON accepts a v1 file, which has no calcType at all', () => {
  const result = importCalcJSON(JSON.stringify({ id: 'v1', name: 'Old file', samples: ['20'] }))
  assert.ok(result.ok)
  assert.equal(result.calc.calcType, 'perennial')
})

test('importCalcJSON accepts a file identified only by its calcType', () => {
  // The gate used to be "has a samples array", which no second worksheet has.
  const result = importCalcJSON(JSON.stringify({ id: 'v2', name: 'New file', calcType: 'perennial' }))
  assert.ok(result.ok, result.error)
})

test('importCalcJSON still refuses a backup BY NAME', () => {
  const backup = exportBackupJSON()
  const result = importCalcJSON(backup)
  assert.equal(result.ok, false)
  // Restoring one calculation over a list of twelve is the mistake this format
  // has to make impossible, so the message names the control that would work.
  assert.match(result.error, /Restore backup/)
})

test('importCalcJSON still refuses whatever merely parses', () => {
  for (const junk of ['{"hello":1}', '[]', 'null', '"a string"', 'not json at all']) {
    assert.equal(importCalcJSON(junk).ok, false, `refused: ${junk}`)
  }
})

test('importBackupJSON names the near miss for a single calculation of either shape', () => {
  const v1 = importBackupJSON(JSON.stringify({ id: 'a', samples: [] }))
  assert.equal(v1.ok, false)
  assert.match(v1.error, /Upload a calculation/)

  // The same near miss for a file with no samples array — the check that used to
  // be shape-only and would have fallen through to the generic refusal.
  const v2 = importBackupJSON(JSON.stringify({ id: 'b', calcType: 'perennial' }))
  assert.equal(v2.ok, false)
  assert.match(v2.error, /Upload a calculation/)
})

test('a backup keeps tag and sortIndex, because it restores a list onto itself', () => {
  reset()
  saveCalc({ id: 'a', calcType: 'perennial', name: 'A', tag: 'blue' })
  saveCalc({ id: 'b', calcType: 'perennial', name: 'B' })

  const parsed = JSON.parse(exportBackupJSON())
  assert.equal(parsed.kind, 'sdshc-grazing-calculator-backup')
  assert.equal(parsed.calculations.length, 2)
  assert.equal(parsed.calculations.find((c) => c.id === 'a').tag, 'blue')

  const back = importBackupJSON(JSON.stringify(parsed))
  assert.ok(back.ok, back.error)
  assert.equal(back.calcs.length, 2)
})

test('an empty backup is refused rather than used to delete everything', () => {
  const result = importBackupJSON(
    JSON.stringify({ kind: 'sdshc-grazing-calculator-backup', calculations: [] })
  )
  assert.equal(result.ok, false)
})

/* ─────────────────────────────── saveCalc ──────────────────────────────── */

test('saveCalc keeps whatever new fields a record carries', () => {
  reset()
  // The record is a whole-object spread, which is what lets a new field — a
  // calcType, a new branch — persist without storage.js being told about it.
  saveCalc({ id: 'a', calcType: 'perennial', name: 'A', season: 'cool' })
  const [rec] = listCalcs()
  assert.equal(rec.calcType, 'perennial')
  assert.equal(rec.season, 'cool')
  assert.equal(rec.schemaVersion, SCHEMA_VERSION)
})

test('a record with no id is reported rather than written', () => {
  reset()
  assert.deepEqual(saveCalc({ name: 'nameless' }), { ok: false, error: 'MissingId' })
  assert.equal(listCalcs().length, 0)
})

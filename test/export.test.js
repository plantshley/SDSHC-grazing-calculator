/**
 * CSV export. toCSV is pure, so it needs no DOM.
 *
 * The escaping tests are the ones that matter. A CSV opened in Excel is not
 * inert: a cell beginning with =, +, - or @ is evaluated, and a pasture named
 * with a leading minus is not far-fetched.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { toCSV } from '../src/export.js'
import { compute } from '../src/calc.js'
import { computeRecord } from '../src/calculators.js'

const FIXTURE = {
  name: 'North pasture, June',
  pastureName: 'North quarter',
  goals: ['days', 'acres', 'animals'],
  forageType: 'coolSeasonGrass',
  samples: [20, 25, 30, 25, 25],
  frame: { key: 'small' },
  dm: { mode: 'stage', stageKey: 'headOut', stagePct: 45 },
  usable: { mode: 'lbs', amountLeaving: 600 },
  demand: { animalWeight: 1200, bodyWeightPct: 2.6, numAnimals: 50 },
  pasture: { totalAcres: 160, ungrazeableAcres: 10, desiredDays: 30 },
}

const csvFor = (calc = FIXTURE) => toCSV(calc, compute(calc))

test('the CSV carries every step and the results', () => {
  const csv = csvFor()
  for (const heading of [
    'Step 1: clip and weigh',
    'Step 2: forage available',
    'Step 3: usable forage',
    'Step 4: daily demand',
    'Step 5: results',
  ]) {
    assert.ok(csv.includes(heading), `has ${heading}`)
  }

  assert.ok(csv.includes('Average weight (g),25'))
  assert.ok(csv.includes('Total production (lbs/ac),2500'))
  assert.ok(csv.includes('Available forage (lbs/ac),1125'))
  assert.ok(csv.includes('Usable forage (lbs/ac),525'))
  // The spreadsheet keeps two decimals rather than the screen's rounding, so a
  // figure carried into further arithmetic does not start out already rounded.
  // The page shows 50.5 days; the file says 50.48.
  assert.ok(csv.includes('GRAZING DAYS,50.48'))
  assert.ok(csv.includes('ANIMALS ALLOWED,84'), 'head count is floored, not rounded')
})

test('it records where the figures came from', () => {
  const csv = csvFor()
  assert.ok(csv.includes('Small hoop, 0.96 sq ft'), 'the frame')
  assert.ok(csv.includes('Chart: Cool season grasses, Head out'), 'the chart cell')
  assert.ok(csv.includes('NRPH Exhibit 4-2'), 'and the source of the chart')
})

test('only the selected goals are exported', () => {
  const csv = csvFor({ ...FIXTURE, goals: ['days'] })
  assert.ok(csv.includes('GRAZING DAYS'))
  assert.ok(!csv.includes('ANIMALS ALLOWED'))
  assert.ok(!csv.includes('ACRES NEEDED PER DAY'))
})

test('warnings travel with the export', () => {
  const csv = csvFor({ ...FIXTURE, usable: { mode: 'lbs', amountLeaving: 9000 } })
  assert.ok(csv.includes('Check these'))
  assert.ok(csv.includes('nothing to graze'))
})

test('a field that Excel would execute is neutralised', () => {
  const csv = csvFor({ ...FIXTURE, name: '=1+1', pastureName: '-cmd|calc' })
  assert.ok(csv.includes("'=1+1"), 'a leading = is prefixed with an apostrophe')
  assert.ok(csv.includes("'-cmd|calc"), 'and so is a leading minus')
  assert.ok(!/^,?=1\+1/m.test(csv), 'the raw formula never reaches a cell')
})

test('commas, quotes and newlines are quoted rather than breaking the row', () => {
  const csv = csvFor({ ...FIXTURE, name: 'North, "big" pasture' })
  assert.ok(csv.includes('"North, ""big"" pasture"'), 'RFC 4180 quoting')

  const multiline = csvFor({ ...FIXTURE, pastureName: 'line one\nline two' })
  assert.ok(multiline.includes('"line one\nline two"'), 'a newline stays inside its cell')
})

test('rows are CRLF separated', () => {
  assert.ok(csvFor().includes('\r\n'), 'Excel on Windows expects CRLF')
})

test('blank sample rows are left out of the export', () => {
  const csv = csvFor({ ...FIXTURE, samples: [20, '', 30, null, ''] })
  const sampleRows = csv
    .split('\r\n')
    .filter((r) => /^\d+,/.test(r))
    .length
  assert.equal(sampleRows, 2, 'only the samples actually weighed')
})

test('an empty calculation exports without throwing', () => {
  const blank = {
    name: '',
    goals: [],
    samples: [],
    frame: {},
    dm: {},
    usable: {},
    demand: {},
    pasture: {},
  }
  const csv = toCSV(blank, compute(blank))
  assert.ok(csv.includes('SDSHC Grazing Calculator'))
})

/* ───────────────────── one exporter, two worksheets ────────────────────── */

/**
 * The rows come off the calculation's own descriptor, so the tests above are
 * also the proof that a record written before there was a second worksheet
 * still exports: FIXTURE carries no `calcType` at all.
 */
test('a record with no calcType is a perennial one', () => {
  assert.equal(FIXTURE.calcType, undefined, 'the fixture predates the discriminator')
  const csv = csvFor()
  assert.ok(csv.includes('Step 1: clip and weigh'), 'the perennial worksheet, unasked')
  assert.ok(!csv.includes('Grazing Cover Crops'))
})

const CC_FIXTURE = {
  calcType: 'covercrop',
  name: 'East cover, October',
  pastureName: 'East 40',
  goals: ['days', 'acres', 'animals'],
  season: 'cool',
  stand: { height: 18 },
  residual: { height: 4 },
  utilization: { mode: 'period', periodKey: 'five', ownPct: '' },
  demand: { animalWeight: 1200, bodyWeightPct: 3, numAnimals: 100 },
  pasture: { totalAcres: 40, ungrazeableAcres: '', desiredDays: 5, paddockWidth: '' },
}

const ccCsvFor = (calc = CC_FIXTURE) => toCSV(calc, computeRecord(calc))

test('a cover crop record exports its own worksheet through the same plumbing', () => {
  const csv = ccCsvFor()

  assert.ok(csv.includes('Worksheet,Grazing Cover Crops'))
  for (const heading of [
    'Step 1: measure height',
    'Step 2: residual left',
    'Step 3: usable forage',
    'Step 4: daily demand',
    'Step 5: results',
  ]) {
    assert.ok(csv.includes(heading), `has ${heading}`)
  }

  // The worksheet's own worked example, so these are the figures on the paper.
  assert.ok(csv.includes('Total air-dry production (lbs/ac),4640'))
  assert.ok(csv.includes('Available forage (lbs/ac),3500'))
  assert.ok(csv.includes('Usable forage (lbs/ac),2275'))
  assert.ok(csv.includes('GRAZING DAYS,25.28'), 'two decimals, same as the other sheet')
  assert.ok(csv.includes('ACRES NEEDED PER DAY,1.58'))

  // Nothing from the other worksheet leaks in.
  assert.ok(!csv.includes('Step 1: clip and weigh'))
  assert.ok(!csv.includes('NRPH Exhibit 4-2'))
})

test('where a cover crop figure came from travels with it', () => {
  assert.ok(ccCsvFor().includes('Occupation period: 5 days'), 'the table, and which row')
  assert.ok(
    ccCsvFor({ ...CC_FIXTURE, utilization: { mode: 'own', periodKey: 'five', ownPct: 55 } }).includes(
      'Utilization source,Entered directly'
    ),
    'or that somebody typed it'
  )
  assert.ok(ccCsvFor().includes('Dominant season,Cool-season dominant'))
})

test('the escaping is the plumbing, so it covers both worksheets', () => {
  const csv = ccCsvFor({ ...CC_FIXTURE, name: '=1+1', pastureName: 'North, "big" field' })
  assert.ok(csv.includes("'=1+1"), 'a leading = is prefixed on this sheet too')
  assert.ok(csv.includes('"North, ""big"" field"'))
})

test('a calcType from a build that does not exist yet still exports', () => {
  // storage.js coerces an unknown type on the way in, but a file handed
  // straight to the exporter has not been through it. Falling back beats
  // throwing: the contract is that a record is never dropped for being strange.
  const csv = toCSV({ ...FIXTURE, calcType: 'silage' }, compute(FIXTURE))
  assert.ok(csv.includes('SDSHC Grazing Calculator'))
})

test('an empty cover crop calculation exports without throwing', () => {
  const blank = {
    calcType: 'covercrop',
    name: '',
    goals: [],
    season: '',
    stand: {},
    residual: {},
    utilization: {},
    demand: {},
    pasture: {},
  }
  const csv = toCSV(blank, computeRecord(blank))
  assert.ok(csv.includes('SDSHC Grazing Calculator'))
})

/* ───────────── an unanswered goal is blank in the file too ─────────────── */

/**
 * Same rule as the dash on screen and the dash on a saved card, one file further
 * out. compute() hands back `null` while a goal's inputs are not all in, and
 * `Number.isFinite(null)` is false — so the spreadsheet used to read
 * "GRAZING DAYS,0" for a calculation somebody was half way through, which is the
 * normal way to work: one pasture at a time.
 */
test('a goal with no answer yet exports blank, not zero', () => {
  const half = { ...FIXTURE, demand: { ...FIXTURE.demand, numAnimals: '' } }
  const csv = csvFor(half)

  assert.ok(csv.includes('GRAZING DAYS,\r\n') || csv.includes('GRAZING DAYS,\n'),
    `expected a blank cell, got: ${csv.split(/\r?\n/).find((r) => r.startsWith('GRAZING DAYS'))}`)
  assert.ok(!/GRAZING DAYS,0\b/.test(csv), 'never a confident zero')
})

test('the same holds for the head count, which is floored rather than rounded', () => {
  const half = { ...CC_FIXTURE, pasture: { ...CC_FIXTURE.pasture, desiredDays: '' } }
  const csv = ccCsvFor(half)
  assert.ok(!/ANIMALS ALLOWED,0\b/.test(csv), 'a floor of null is not zero head')
})

test('a real zero still exports as zero', () => {
  // The rule is about UNANSWERED, not about small. A calculation whose figures
  // genuinely work out to nothing must still say so.
  const none = { ...FIXTURE, usable: { mode: 'lbs', amountLeaving: 9000 } }
  assert.ok(/GRAZING DAYS,0\b/.test(csvFor(none)), 'nothing to graze is an answer')
})

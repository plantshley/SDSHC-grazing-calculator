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

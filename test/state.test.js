import { test } from 'node:test'
import assert from 'node:assert/strict'

import { getPath, setPath, newCalculation, resolved } from '../src/state.js'
import { compute } from '../src/calc.js'

test('setPath creates the container the NEXT key needs', () => {
  // The bug this guards: testing the CURRENT key produced {samples: {'0': 42}},
  // and calc.js does `Array.isArray(x) ? x : []`, so a samples object read as
  // zero samples with no warning anywhere.
  const a = {}
  setPath(a, 'samples.0', 42)
  assert.ok(Array.isArray(a.samples), 'samples is an array')
  assert.deepEqual(a.samples, [42])

  const b = {}
  setPath(b, 'dm.mix.0.share', '60')
  assert.ok(!Array.isArray(b.dm), 'dm is an object')
  assert.ok(Array.isArray(b.dm.mix), 'mix is an array')
  assert.ok(!Array.isArray(b.dm.mix[0]), 'a mix row is an object')
  assert.equal(b.dm.mix[0].share, '60')
})

test('a path built from nothing still computes', () => {
  const c = {}
  setPath(c, 'samples.0', 25)
  setPath(c, 'frame.key', 'small')
  setPath(c, 'dm.mode', 'own')
  setPath(c, 'dm.ownPct', 45)
  const r = compute(c)
  assert.equal(r.avgGrams, 25, 'the samples survived being created by path')
  assert.equal(r.totalProduction, 2500)
})

test('setPath writes into existing containers without replacing them', () => {
  const calc = newCalculation()
  const samples = calc.samples
  setPath(calc, 'samples.2', '30')
  assert.equal(calc.samples, samples, 'the same array, not a new one')
  assert.equal(calc.samples[2], '30')
  assert.equal(calc.samples.length, 5, 'and the other rows are untouched')
})

test('getPath returns undefined rather than throwing on a missing branch', () => {
  assert.equal(getPath({}, 'a.b.c'), undefined)
  assert.equal(getPath(null, 'a'), undefined)
  assert.equal(getPath({ a: { b: 1 } }, 'a.b'), 1)
})

test('resolved fills the chart percentage without storing it', () => {
  const calc = newCalculation()
  calc.forageType = 'coolSeasonGrass'
  calc.dm.stageKey = 'headOut'

  const r = resolved(calc)
  assert.equal(r.dm.stagePct, 45, 'looked up at compute time')
  assert.equal(calc.dm.stagePct, undefined, 'and never written back to the record')
})

test('resolved treats any non-own, non-mix mode as the chart', () => {
  // calc.js resolveDryMatter() uses "stage" as its fallback for anything it
  // does not recognise. If this function tested `=== 'stage'` the two would
  // disagree and an unrecognised mode would silently read as 0% dry matter.
  const calc = newCalculation()
  calc.forageType = 'warmMidGrass'
  calc.dm.stageKey = 'mature'
  calc.dm.mode = 'something-a-later-version-added'

  assert.equal(resolved(calc).dm.stagePct, 90)
  assert.equal(compute(resolved(calc)).dryMatterPct, 90)
})

test('a stage that does not belong to the chosen row resolves to nothing', () => {
  const calc = newCalculation()
  calc.forageType = 'coolSeasonGrass'
  calc.dm.stageKey = 'flowering' // a forb stage
  assert.equal(resolved(calc).dm.stagePct, '', 'not a plausible wrong number')
})

test('the mixed fallback reads the row that travels with the picked cell', () => {
  const calc = newCalculation()
  calc.forageType = 'mixed'
  calc.dm.stageTypeId = 'succulentForb'
  calc.dm.stageKey = 'flowering'
  assert.equal(resolved(calc).dm.stagePct, 35)
})

test('mix rows get their percentages from the chart, never from the user', () => {
  const calc = newCalculation()
  calc.dm.mode = 'mix'
  calc.dm.mix = [
    { typeId: 'coolSeasonGrass', stageKey: 'headOut', share: '60' },
    { typeId: 'warmTallGrass', stageKey: 'vegetative', share: '40' },
  ]
  const r = resolved(calc)
  assert.equal(r.dm.mix[0].pct, 45)
  assert.equal(r.dm.mix[1].pct, 30)
  // 45 x 0.6 + 30 x 0.4 = 39
  assert.equal(compute(r).dryMatterPct, 39)
})

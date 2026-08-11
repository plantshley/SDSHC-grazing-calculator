import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  compute,
  averageSample,
  frameMultiplier,
  blendDryMatter,
  demand,
  paddockSides,
  inputsForGoals,
  checklistForGoals,
  num,
  safeDiv,
  nonNegative,
  GRAMS_TO_LBS_PER_ACRE,
  SQ_FT_PER_ACRE,
} from '../src/calc.js'

/**
 * The golden fixture.
 *
 * These numbers were run through the paper GRAZIERS MATH WORKSHEET by hand and
 * every intermediate below matches it. If a change here makes one of these
 * fail, the change is wrong until the paper worksheet says otherwise.
 *
 *   25 g average, small hoop, 45% dry matter, leave 600 lbs/ac,
 *   1,200 lb animals at 2.6%, 50 head, 160 acres less 10 ungrazeable,
 *   30 planned days.
 */
const FIXTURE = {
  goals: ['days', 'acres', 'animals'],
  samples: [20, 25, 30, 25, 25],
  frame: { key: 'small' },
  dm: { mode: 'stage', stagePct: 45 },
  usable: { mode: 'lbs', amountLeaving: 600 },
  demand: { animalWeight: 1200, bodyWeightPct: 2.6, numAnimals: 50 },
  pasture: { totalAcres: 160, ungrazeableAcres: 10, desiredDays: 30 },
}

const near = (actual, expected, tolerance, label) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected about ${expected}, got ${actual}`
  )

test('golden fixture reproduces the paper worksheet', () => {
  const r = compute(FIXTURE)

  assert.equal(r.avgGrams, 25, 'average sample weight')
  assert.equal(r.sampleCount, 5)

  assert.equal(r.totalProduction, 2500, 'total production lbs/ac')
  assert.equal(r.availableForage, 1125, 'available forage lbs/ac')
  assert.equal(r.usableForage, 525, 'usable forage lbs/ac')

  // 1200 x (2.6/100) is 31.200000000000003 in binary floating point. The model
  // deliberately does not round intermediates, because rounding at each step
  // propagates error into the answer. Display rounding is the formatter's job.
  near(r.perAnimalDemand, 31.2, 1e-9, 'lbs per animal per day')
  near(r.herdDemand, 1560, 1e-9, 'herd lbs per day')

  assert.equal(r.acresAvailable, 150)
  assert.equal(r.totalUsableForage, 78750, 'total usable forage lbs')

  near(r.acresPerDay, 2.97, 0.01, 'acres per day')
  near(r.sqFtPerDay, 129434, 5, 'square feet per day')
  near(r.paddockWidth, 359.8, 0.5, 'paddock side')
  near(r.paddockLength, 359.8, 0.5, 'paddock side')

  near(r.grazingDays, 50.5, 0.05, 'grazing days')
  near(r.animalsAllowed, 84.1, 0.05, 'animals allowed')
  near(r.animalDays, 2524, 1, 'animal days')

  assert.deepEqual(r.warnings, [], 'a clean worksheet raises no warnings')
})

test('the three goals are consistent with each other', () => {
  const r = compute(FIXTURE)
  // Every goal solves acres x usable = animals x perAnimal x days for a
  // different unknown, so feeding one answer back must reproduce the others.
  near(r.acresPerDay * r.grazingDays, r.acresAvailable, 0.01, 'acres/day x days')
  near(
    r.animalsAllowed * r.perAnimalDemand * r.desiredDays,
    r.totalUsableForage,
    1,
    'animals x demand x days'
  )
})

test('frame multipliers match the worksheet, not the exact arithmetic', () => {
  // 43,560 / 453.592 / 0.96 is 100.03, and the worksheet prints 100. A user
  // checking this screen against paper must not find them disagreeing.
  assert.equal(frameMultiplier('small'), 100)
  assert.equal(frameMultiplier('large'), 50)
  near(GRAMS_TO_LBS_PER_ACRE / 0.96, 100, 0.05, 'the rounding is defensible')
  near(GRAMS_TO_LBS_PER_ACRE / 1.92, 50, 0.05, 'the rounding is defensible')
})

test('a custom frame area uses the exact conversion', () => {
  const m = frameMultiplier('custom', 2)
  near(m, GRAMS_TO_LBS_PER_ACRE / 2, 0.001, 'custom multiplier')
  assert.equal(frameMultiplier('custom', 0), 0, 'a zero area cannot divide')
  assert.equal(frameMultiplier('custom', ''), 0, 'a blank area cannot divide')
})

test('blank sample rows are skipped, not counted as zero', () => {
  // The form shows ten boxes and most people fill five. Counting the empties
  // would halve every result with nothing on screen to explain it.
  const r = averageSample([20, 25, 30, '', null, undefined])
  assert.equal(r.count, 3)
  assert.equal(r.avgGrams, 25)
})

test('an explicit zero sample still counts', () => {
  const r = averageSample([0, 10])
  assert.equal(r.count, 2)
  assert.equal(r.avgGrams, 5)
})

test('no samples yields zero sub-results and no answer at all', () => {
  const r = compute({ ...FIXTURE, samples: [] })
  assert.equal(r.avgGrams, 0)
  assert.equal(r.totalProduction, 0)
  assert.equal(r.usableForage, 0)

  // Not 0. "0 grazing days" is a wrong answer wearing the clothes of a right
  // one; null renders as a dash and the card says what is still needed.
  assert.equal(r.grazingDays, null)
  assert.equal(r.animalsAllowed, null)
  assert.equal(r.acresPerDay, null)
  assert.ok(r.missing.days.includes('samples'))
})

test('a blank input withholds the answer instead of reporting zero', () => {
  // Leaving planned days blank used to show "0 head allowed", because
  // Number('') is 0 and the division guarded a zero divisor by returning 0.
  const r = compute({
    ...FIXTURE,
    pasture: { ...FIXTURE.pasture, desiredDays: '' },
  })
  assert.equal(r.animalsAllowed, null, 'the herd size is not zero, it is unknown')
  assert.deepEqual(r.missing.animals, ['desiredDays'])

  // The goals that do not need planned days are unaffected.
  assert.ok(r.grazingDays > 0)
  assert.deepEqual(r.missing.days, [])
})

test('an explicit zero is an answer, not a blank', () => {
  // Someone who types 0 meant 0, and gets the arithmetic that follows from it.
  const r = compute({
    ...FIXTURE,
    usable: { mode: 'lbs', amountLeaving: 0 },
  })
  assert.deepEqual(r.missing.days, [], 'zero counts as answered')
  assert.equal(r.usableForage, 1125, 'and is used as entered')
})

test('each goal only waits on the inputs it actually needs', () => {
  const noHerd = compute({
    ...FIXTURE,
    demand: { ...FIXTURE.demand, numAnimals: '' },
  })
  assert.equal(noHerd.grazingDays, null, 'days needs a herd size')
  assert.equal(noHerd.acresPerDay, null, 'acres needs a herd size')
  assert.ok(noHerd.animalsAllowed > 0, 'animals allowed does not, it is the answer')

  const noPasture = compute({
    ...FIXTURE,
    pasture: { ...FIXTURE.pasture, totalAcres: '' },
  })
  assert.equal(noPasture.grazingDays, null, 'days needs the pasture')
  assert.equal(noPasture.animalsAllowed, null, 'animals needs the pasture')
  assert.ok(noPasture.acresPerDay > 0, 'acres needed does not, it is the answer')
})

test('a harvest of zero percent is explained rather than left as a bare zero', () => {
  const r = compute({ ...FIXTURE, usable: { mode: 'pct', harvestPct: 0 } })
  assert.equal(r.usableForage, 0)
  assert.ok(
    r.warnings.some((w) => w.includes('0%')),
    'the pounds mode warns in this case, so the percent mode must too'
  )
})

test('an unknown frame size warns instead of silently zeroing production', () => {
  const r = compute({ ...FIXTURE, frame: { key: 'nonsense' } })
  assert.equal(r.totalProduction, 0)
  assert.ok(r.warnings.some((w) => w.includes('not a frame size')))
})

test('harvest percent mode agrees with the pounds mode', () => {
  const lbsMode = compute(FIXTURE)
  // 525 usable of 1125 available is 46.67%.
  const pctMode = compute({
    ...FIXTURE,
    usable: { mode: 'pct', harvestPct: lbsMode.harvestPctEquivalent },
  })
  near(pctMode.usableForage, 525, 0.01, 'the two modes are the same calculation')
  near(pctMode.amountLeaving, 600, 0.01, 'and report the same residual')
})

test('leaving more than is available clamps to zero and warns', () => {
  const r = compute({ ...FIXTURE, usable: { mode: 'lbs', amountLeaving: 5000 } })
  assert.equal(r.usableForage, 0)
  assert.equal(r.grazingDays, 0)
  assert.ok(
    r.warnings.some((w) => w.includes('nothing to graze')),
    'says why the answer is zero'
  )
})

test('a negative residual is treated as zero rather than credited', () => {
  // The invariant is not that a result can never rise. Treating a typo as 0
  // does remove a real constraint. It is that a negative figure is worth the
  // same as zero and is never handed back as a bonus.
  const r = compute({ ...FIXTURE, usable: { mode: 'lbs', amountLeaving: -600 } })
  assert.equal(r.usableForage, 1125, 'not 1725')
  assert.ok(r.warnings.some((w) => w.includes('below zero')))
})

test('ungrazeable acres above the total clamp and warn', () => {
  const r = compute({
    ...FIXTURE,
    pasture: { ...FIXTURE.pasture, totalAcres: 100, ungrazeableAcres: 150 },
  })
  assert.equal(r.acresAvailable, 0)
  assert.equal(r.totalUsableForage, 0)
  assert.ok(r.warnings.some((w) => w.includes('no acres are left')))
})

test('dry matter above 100 is capped and warned', () => {
  const r = compute({ ...FIXTURE, dm: { mode: 'own', ownPct: 140 } })
  assert.equal(r.dryMatterPct, 100)
  assert.ok(r.warnings.some((w) => w.includes('cannot be above 100')))
})

test('harvest percent above 100 is capped and warned', () => {
  const r = compute({ ...FIXTURE, usable: { mode: 'pct', harvestPct: 150 } })
  assert.equal(r.usableForage, 1125)
  assert.equal(r.amountLeaving, 0)
  assert.ok(r.warnings.some((w) => w.includes('above 100')))
})

test('a weighted mix blends by share', () => {
  const { pct, shareTotal } = blendDryMatter([
    { pct: 40, share: 75 },
    { pct: 20, share: 25 },
  ])
  assert.equal(pct, 35)
  assert.equal(shareTotal, 100)
})

test('mix shares are weights, so they need not total 100', () => {
  const a = blendDryMatter([
    { pct: 40, share: 60 },
    { pct: 20, share: 30 },
  ])
  const b = blendDryMatter([
    { pct: 40, share: 2 },
    { pct: 20, share: 1 },
  ])
  near(a.pct, b.pct, 0.0001, 'the same ratio is the same blend')
})

test('a mix that does not total 100 still computes, and says so', () => {
  const r = compute({
    ...FIXTURE,
    dm: { mode: 'mix', mix: [{ pct: 45, share: 60 }, { pct: 35, share: 20 }] },
  })
  assert.ok(r.dryMatterPct > 0)
  assert.ok(r.warnings.some((w) => w.includes('not 100%')))
})

test('an empty mix yields zero rather than NaN', () => {
  const r = compute({ ...FIXTURE, dm: { mode: 'mix', mix: [] } })
  assert.equal(r.dryMatterPct, 0)
  assert.equal(r.availableForage, 0)
})

test('an implausible intake rate is flagged but still computed', () => {
  const r = demand(1200, 26, 50, [])
  assert.equal(r.perAnimal, 312)
  const warnings = []
  demand(1200, 26, 50, warnings)
  assert.ok(warnings.some((w) => w.includes('above the usual')))
})

test('paddock defaults to a square and solves the other side when given one', () => {
  const square = paddockSides(10000)
  assert.equal(square.width, 100)
  assert.equal(square.length, 100)

  const given = paddockSides(10000, 50)
  assert.equal(given.width, 50)
  assert.equal(given.length, 200)

  assert.deepEqual(paddockSides(0), { width: 0, length: 0 })
  assert.deepEqual(paddockSides(10000, -5), { width: 100, length: 100 }, 'a negative side is ignored')
})

test('num rejects Infinity as well as NaN, and strips formatting', () => {
  assert.equal(num('1,200'), 1200)
  assert.equal(num('$1,200.50'), 1200.5)
  assert.equal(num(Infinity), 0)
  assert.equal(num(-Infinity), 0)
  assert.equal(num(NaN), 0)
  assert.equal(num('not a number'), 0)
  assert.equal(num(''), 0)
  assert.equal(num(null), 0)
})

test('safeDiv guards only a zero divisor', () => {
  assert.equal(safeDiv(10, 0), 0)
  assert.equal(safeDiv(10, -2), -5, 'a negative divisor passes through')
  assert.equal(safeDiv(10, 2), 5)
})

test('nonNegative reports what it clamped', () => {
  const warnings = []
  assert.equal(nonNegative(-5, 'Total acres', warnings), 0)
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0].includes('Total acres'))
  assert.equal(nonNegative(5, 'Total acres', warnings), 5)
  assert.equal(warnings.length, 1, 'a valid figure adds no warning')
})

test('no figure reaching the screen is ever non-finite', () => {
  // Values chosen to overflow: two finite inputs whose product is not.
  const hostile = {
    goals: ['days', 'acres', 'animals'],
    samples: [Number.MAX_VALUE, Number.MAX_VALUE],
    frame: { key: 'custom', customArea: Number.MIN_VALUE },
    dm: { mode: 'own', ownPct: 100 },
    usable: { mode: 'lbs', amountLeaving: 0 },
    demand: { animalWeight: Number.MAX_VALUE, bodyWeightPct: 100, numAnimals: Number.MAX_VALUE },
    pasture: {
      totalAcres: Number.MAX_VALUE,
      ungrazeableAcres: 0,
      desiredDays: Number.MIN_VALUE,
      paddockWidth: Number.MIN_VALUE,
    },
  }
  const r = compute(hostile)
  for (const [key, value] of Object.entries(r)) {
    if (typeof value !== 'number') continue
    assert.ok(Number.isFinite(value), `${key} is ${value}`)
  }
})

test('compute survives junk without throwing', () => {
  for (const input of [undefined, {}, { samples: 'not an array' }, { goals: null }, { dm: null }]) {
    const r = compute(input)
    assert.ok(Number.isFinite(r.usableForage))
    assert.ok(Array.isArray(r.warnings))
  }
})

test('an acre is 43,560 square feet', () => {
  assert.equal(SQ_FT_PER_ACRE, 43560)
})

/* ─────────────────────── goal requirements ─────────────────────────────── */

test('each goal asks for exactly what it needs', () => {
  const days = inputsForGoals(['days'])
  assert.ok(days.required.includes('numAnimals'))
  assert.ok(days.required.includes('totalAcres'))
  assert.ok(!days.required.includes('desiredDays'), 'days are the answer, not an input')

  const animals = inputsForGoals(['animals'])
  assert.ok(animals.required.includes('desiredDays'))
  assert.ok(!animals.required.includes('numAnimals'), 'the herd is the answer, not an input')

  const acres = inputsForGoals(['acres'])
  assert.ok(acres.required.includes('numAnimals'))
  assert.ok(!acres.required.includes('totalAcres'), 'acreage is the answer, not an input')
})

test('selecting a second goal never relaxes the first goal needs', () => {
  const both = inputsForGoals(['acres', 'animals'])
  // desiredDays is optional for acres and required for animals.
  assert.ok(both.required.includes('desiredDays'))
  assert.ok(!both.optional.includes('desiredDays'))
})

test('one goal produces a flat checklist', () => {
  const { shared, groups } = checklistForGoals(['days'])
  assert.equal(groups.length, 0)
  assert.ok(shared.includes('numAnimals'))
  assert.ok(shared.includes('samples'))
})

test('several goals split into a shared block and per-goal sections', () => {
  const { shared, groups } = checklistForGoals(['days', 'animals'])
  assert.ok(shared.includes('samples'), 'the sampling figures are always shared')
  // Both need the pasture, so it is shared rather than repeated.
  assert.ok(shared.includes('totalAcres'))
  const byGoal = Object.fromEntries(groups.map((g) => [g.goal, g.keys]))
  assert.ok(byGoal.days.includes('numAnimals'))
  assert.ok(byGoal.animals.includes('desiredDays'))
  assert.ok(!byGoal.days.includes('totalAcres'), 'shared keys are not repeated per goal')
})

test('all three goals leave nothing extra in the shared block', () => {
  const { shared, groups } = checklistForGoals(['days', 'acres', 'animals'])
  assert.deepEqual(
    shared.filter((k) => !['samples', 'frame', 'dryMatter', 'amountLeaving', 'animalWeight', 'bodyWeightPct'].includes(k)),
    [],
    'no goal-specific key is needed by all three'
  )
  assert.equal(groups.length, 3)
})

test('an unknown goal is ignored rather than throwing', () => {
  assert.deepEqual(checklistForGoals(['nonsense']), { shared: [], groups: [] })
  assert.deepEqual(checklistForGoals(null), { shared: [], groups: [] })
})

/**
 * The Grazing Cover Crops worksheet, checked against the paper.
 *
 * The constants below are TRANSCRIBED from the worksheet, not looped out of
 * src/data/covercrop.js. Reading them from the source would make this a test
 * that the code equals itself; the point is that somebody typed the table in
 * correctly, which is the same rule forage.test.js follows for Exhibit 4-2.
 *
 * The worked example on page 1 of the worksheet is the golden fixture, and it is
 * the reason the cool-season base here is 1,140 rather than the 140 the sheet
 * prints in its constants block. See COOL_SEASON_BASE in data/covercrop.js.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { computeCoverCrop, GOAL_INPUTS, STEP_INPUTS, COVER_CROP_BODY_WEIGHT_PCT } from '../src/calc-covercrop.js'
import { SEASONS, UTILIZATION_PERIODS, utilizationForPeriod, seasonById } from '../src/data/covercrop.js'
import { newCoverCropCalculation, resolvedCoverCrop } from '../src/state-covercrop.js'

/* ─────────────────────── the table, transcribed by hand ────────────────── */

const PAPER = {
  warm: { base: 1275, anchor: 4, perInch: 200 },
  cool: { base: 1140, anchor: 4, perInch: 250 },
  mix: { base: 0, anchor: 0, perInch: 215 },
}

const PAPER_UTILIZATION = {
  half: 80,
  two: 75,
  three: 75,
  four: 70,
  five: 65,
  long: 60,
}

test('the season constants match the worksheet', () => {
  for (const [id, expected] of Object.entries(PAPER)) {
    const season = seasonById(id)
    assert.ok(season, `${id} is in the table`)
    assert.equal(season.base, expected.base, `${id} base`)
    assert.equal(season.anchor, expected.anchor, `${id} anchor`)
    assert.equal(season.perInch, expected.perInch, `${id} per inch`)
  }
  assert.equal(SEASONS.length, 3, 'three seasons, no more')
})

test('the utilization table matches the worksheet', () => {
  for (const [key, pct] of Object.entries(PAPER_UTILIZATION)) {
    assert.equal(utilizationForPeriod(key), pct, key)
  }
  assert.equal(UTILIZATION_PERIODS.length, 6)
  // 3 days really is 75%, the same as 2 days. The JotForm repeats it, so it is
  // the table rather than a transcription slip, and a "tidy-up" that made it 72
  // or 73 would be inventing a figure.
  assert.equal(utilizationForPeriod('two'), utilizationForPeriod('three'))
})

test('an unknown occupation period is null, never a silent first-row fallback', () => {
  assert.equal(utilizationForPeriod('seven'), null)
  assert.equal(utilizationForPeriod(''), null)
  assert.equal(utilizationForPeriod(undefined), null)
})

test('the mix estimate is a different SHAPE of formula, not the same one retuned', () => {
  // Warm and cool are base + rate × (h − 4). Mix is a flat rate over the whole
  // height with no base at all. Collapsing the two would make a 4-inch mixed
  // stand worth a base it never had.
  assert.equal(PAPER.mix.anchor, 0)
  assert.equal(PAPER.mix.base, 0)
  assert.equal(seasonById('mix').anchor, 0)
})

/* ──────────────────────────── the golden fixture ───────────────────────── */

/** The worked example printed on page 1 of the worksheet. */
function example(extra = {}) {
  const calc = {
    ...newCoverCropCalculation(),
    goals: ['days'],
    season: 'cool',
    stand: { height: '18' },
    residual: { height: '4' },
    utilization: { mode: 'period', periodKey: 'five', ownPct: '' },
    demand: { animalWeight: '1200', bodyWeightPct: '3', numAnimals: '100' },
    pasture: { totalAcres: '40', ungrazeableAcres: '', desiredDays: '', paddockWidth: '' },
    ...extra,
  }
  return computeCoverCrop(resolvedCoverCrop(calc))
}

test("the worksheet's own example comes out as printed", () => {
  const r = example()

  //  1,140 first 4 in. + 250/in. × (18 − 4) = 4,640
  assert.equal(r.totalProduction, 4640)
  //  1,140 first 4 in. + 250/in. × ( 4 − 4) = 1,140
  assert.equal(r.residualProduction, 1140)
  //  4,640 − 1,140 = 3,500
  assert.equal(r.availableForage, 3500)
  //  3,500 × 65% = 2,275
  assert.equal(r.utilizationPct, 65)
  assert.equal(r.usableForage, 2275)
  //  1,200 × 3% = 36 per head, × 100 head = 3,600
  assert.equal(r.perAnimalDemand, 36)
  assert.equal(r.herdDemand, 3600)
  //  2,275 × 40 acres = 91,000 ÷ 3,600 = 25.28, printed as 25
  assert.equal(r.totalUsableForage, 91000)
  assert.ok(Math.abs(r.grazingDays - 25.277) < 0.01, `grazing days ${r.grazingDays}`)
  assert.deepEqual(r.warnings, [])
})

test("the example's other branch: days in, acres out", () => {
  const r = example({
    goals: ['acres'],
    pasture: { totalAcres: '40', ungrazeableAcres: '', desiredDays: '5', paddockWidth: '' },
  })
  //  3,600 herd demand ÷ 2,275 usable = 1.582 acres a day
  assert.ok(Math.abs(r.acresPerDay - 1.582) < 0.01, `acres per day ${r.acresPerDay}`)
  //  × 5 days = 7.91, printed as 8
  assert.ok(Math.abs(r.acresForDesiredDays - 7.912) < 0.01, `for 5 days ${r.acresForDesiredDays}`)
})

/* ───────────────────────────── the formulas ────────────────────────────── */

test('production at exactly the anchor height is the base and nothing more', () => {
  for (const id of ['warm', 'cool']) {
    const r = computeCoverCrop(
      resolvedCoverCrop({
        ...newCoverCropCalculation(),
        season: id,
        stand: { height: '4' },
        residual: { height: '0' },
      })
    )
    assert.equal(r.totalProduction, PAPER[id].base, `${id} at 4 inches`)
  }
})

test('production at ten inches, all three seasons', () => {
  const at = (id) =>
    computeCoverCrop(
      resolvedCoverCrop({
        ...newCoverCropCalculation(),
        season: id,
        stand: { height: '10' },
        residual: { height: '0' },
      })
    ).totalProduction

  assert.equal(at('warm'), 1275 + 200 * 6)
  assert.equal(at('cool'), 1140 + 250 * 6)
  // No base, and the whole height counts, not the height above four.
  assert.equal(at('mix'), 215 * 10)
})

test('a stand below the anchor is clamped to zero and says why', () => {
  // The subtraction happens INSIDE the formula, so nonNegative() on the input
  // cannot catch it: 1,140 + 250 × (2 − 4) is 640, a smaller but entirely made
  // up number for a stand the estimate does not describe.
  const r = computeCoverCrop(
    resolvedCoverCrop({
      ...newCoverCropCalculation(),
      season: 'cool',
      stand: { height: '2' },
      residual: { height: '0' },
    })
  )
  assert.equal(r.totalProduction, 0)
  assert.ok(
    r.warnings.some((w) => /below the 4 inches/.test(w)),
    `a warning names the floor: ${JSON.stringify(r.warnings)}`
  )
})

test('a mixed stand below four inches is fine, because it has no anchor', () => {
  const r = computeCoverCrop(
    resolvedCoverCrop({
      ...newCoverCropCalculation(),
      season: 'mix',
      stand: { height: '2' },
      residual: { height: '0' },
    })
  )
  assert.equal(r.totalProduction, 430)
  assert.deepEqual(r.warnings, [])
})

test('a residual at or above the stand leaves nothing, with a warning', () => {
  const r = example({ residual: { height: '18' } })
  assert.equal(r.availableForage, 0)
  assert.ok(
    r.warnings.some((w) => /nothing available to graze/.test(w)),
    `a warning says so: ${JSON.stringify(r.warnings)}`
  )
})

test('a residual TALLER than the stand is still zero, never negative', () => {
  const r = example({ residual: { height: '30' } })
  assert.equal(r.availableForage, 0)
  assert.equal(r.usableForage, 0)
})

test('utilization can be typed instead of picked, and is capped at 100', () => {
  const own = example({ utilization: { mode: 'own', periodKey: '', ownPct: '50' } })
  assert.equal(own.utilizationPct, 50)
  assert.equal(own.usableForage, 1750)

  const over = example({ utilization: { mode: 'own', periodKey: '', ownPct: '140' } })
  assert.equal(over.utilizationPct, 100)
  assert.ok(over.warnings.some((w) => /above 100/.test(w)))
})

test('the intake rate arrives filled in at the working figure, not blank', () => {
  // The printed worksheet fixes this at 3%. The default here is 2.6%, inside the
  // NRCS range of 2.5% to 3%, and the field is editable: the fixture above types
  // 3 into it, which is how the worksheet's own example is reproduced.
  assert.equal(COVER_CROP_BODY_WEIGHT_PCT, 2.6)
  assert.equal(newCoverCropCalculation().demand.bodyWeightPct, 2.6)
})

/* ─────────────────── blank is not zero, and never a bonus ──────────────── */

test('a goal whose inputs are not all in has NO answer, not zero', () => {
  const r = computeCoverCrop(
    resolvedCoverCrop({ ...newCoverCropCalculation(), goals: ['days', 'acres', 'animals'] })
  )
  assert.equal(r.grazingDays, null)
  assert.equal(r.acresPerDay, null)
  assert.equal(r.animalsAllowed, null)
  // Zero days is an answer, and a wrong one: it says this field feeds nothing.
  assert.notEqual(r.grazingDays, 0)
})

test('each goal names exactly what it is still missing', () => {
  const r = computeCoverCrop(
    resolvedCoverCrop({ ...newCoverCropCalculation(), goals: ['days'] })
  )
  for (const key of [...GOAL_INPUTS.shared, ...GOAL_INPUTS.days.required]) {
    // bodyWeightPct ships filled in, so it is ANSWERED on a brand new
    // calculation. That is the point of a default: the figure is on screen and
    // can be argued with, rather than being demanded.
    if (key === 'bodyWeightPct') {
      assert.ok(!r.missing.days.includes(key), 'the intake rate arrives answered')
      continue
    }
    assert.ok(r.missing.days.includes(key), `days is missing ${key}`)
  }
  // Ungrazeable acres never blocks: nothing ungrazeable is the normal case.
  assert.ok(!r.missing.days.includes('ungrazeableAcres'))
})

test('an explicit zero counts as answered', () => {
  const r = example({
    pasture: { totalAcres: '40', ungrazeableAcres: '0', desiredDays: '', paddockWidth: '' },
  })
  assert.equal(r.grazingDays !== null, true, 'a zero for ungrazeable acres does not block')
  assert.equal(r.acresAvailable, 40)
})

test('what is outstanding is sorted onto the step that asks for it', () => {
  const r = computeCoverCrop(
    resolvedCoverCrop({ ...newCoverCropCalculation(), goals: ['days'] })
  )
  assert.equal(r.missingByStep.length, STEP_INPUTS.length)
  assert.ok(r.missingByStep[0].includes('season'))
  assert.ok(r.missingByStep[0].includes('height'))
  assert.ok(r.missingByStep[1].includes('residualHeight'))
  assert.ok(r.missingByStep[2].includes('utilization'))
  assert.ok(r.missingByStep[3].includes('animalWeight'))
  // Step 5 names its shortfalls on the result cards themselves.
  assert.deepEqual(r.missingByStep[4], [])
})

/* ──────────────────────── negatives and junk ───────────────────────────── */

test('a negative figure is worth the same as zero, and is never a bonus', () => {
  const negative = example({
    residual: { height: '-10' },
    pasture: { totalAcres: '40', ungrazeableAcres: '-20', desiredDays: '', paddockWidth: '' },
  })
  const blank = example({
    residual: { height: '0' },
    pasture: { totalAcres: '40', ungrazeableAcres: '0', desiredDays: '', paddockWidth: '' },
  })
  // A "-10" residual must not be ADDED back to available forage, and "-20"
  // ungrazeable acres must not grow the field.
  assert.equal(negative.acresAvailable, blank.acresAvailable)
  assert.ok(negative.availableForage <= blank.availableForage)
  assert.ok(negative.warnings.length > 0, 'and it says so')
})

test('no figure is ever non-finite, whatever is typed', () => {
  const junk = ['', 'abc', '-1e400', '1e400', 'NaN', 'Infinity', '0', '-0', '   ', '1,200']
  for (const value of junk) {
    const r = computeCoverCrop(
      resolvedCoverCrop({
        ...newCoverCropCalculation(),
        goals: ['days', 'acres', 'animals'],
        season: 'cool',
        stand: { height: value },
        residual: { height: value },
        utilization: { mode: 'own', periodKey: '', ownPct: value },
        demand: { animalWeight: value, bodyWeightPct: value, numAnimals: value },
        pasture: {
          totalAcres: value,
          ungrazeableAcres: value,
          desiredDays: value,
          paddockWidth: value,
        },
      })
    )
    for (const [key, figure] of Object.entries(r)) {
      if (typeof figure !== 'number') continue
      assert.ok(Number.isFinite(figure), `${key} is finite for input ${JSON.stringify(value)}`)
    }
  }
})

test('an unknown season resolves to no rates rather than to the first one', () => {
  const r = computeCoverCrop(
    resolvedCoverCrop({
      ...newCoverCropCalculation(),
      season: 'not-a-season',
      stand: { height: '18' },
      residual: { height: '4' },
    })
  )
  assert.equal(r.totalProduction, 0)
  assert.equal(r.availableForage, 0)
})

test('resolvedCoverCrop stores nothing it looked up back onto the record', () => {
  // The lookups belong to compute time. A percentage written into a record is a
  // copy of the table that a later correction cannot reach.
  const calc = { ...newCoverCropCalculation(), season: 'cool' }
  const before = JSON.stringify(calc)
  resolvedCoverCrop(calc)
  assert.equal(JSON.stringify(calc), before, 'the record is untouched')
})

/* ──────────────── a key this build cannot look up is not an answer ─────── */

/**
 * The failure these guard is quiet, which is why they are here.
 *
 * A season or a period whose id nothing matches resolves to null rates, every
 * rate behind it reads as 0, and the arithmetic runs to completion: total
 * production 0, usable forage 0, "0 grazing days" on screen with no warning and
 * no dash. Zero days is an answer, and a wrong one.
 *
 * Reachable from an uploaded calculation file, and from any record already
 * stored if these ids are ever changed.
 */
test('a season this build does not know is unanswered, not zero', () => {
  const r = example({ season: 'warmish' })

  assert.equal(r.grazingDays, null, 'a dash, not 0 days')
  assert.ok(r.missing.days.includes('season'), 'and the setup question is named')
  assert.match(r.warnings.join(' '), /warmish/, 'the warning quotes what was stored')
  assert.match(r.warnings.join(' '), /season this calculator knows/)
})

test('an occupation period this build does not know is unanswered too', () => {
  const r = example({ utilization: { mode: 'period', periodKey: 'fortnight', ownPct: '' } })

  assert.equal(r.grazingDays, null)
  assert.ok(r.missing.days.includes('utilization'))
  assert.match(r.warnings.join(' '), /fortnight/)
})

test('a season that resolves is answered, and an own percent needs no season key', () => {
  assert.ok(example().grazingDays > 0, 'the fixture still computes')
  const own = example({ utilization: { mode: 'own', periodKey: 'nonsense', ownPct: '65' } })
  assert.ok(own.grazingDays > 0, 'a typed percent does not care what the period key says')
})

/* ─────────────────────────── warnings say it once ──────────────────────── */

test('a negative height is complained about once, not twice', () => {
  const r = example({ stand: { height: '-5' } })
  const hits = r.warnings.filter((w) => /Average height/.test(w) && /below zero/i.test(w))
  assert.equal(hits.length, 1, `said ${hits.length} times: ${JSON.stringify(r.warnings)}`)

  const res = example({ residual: { height: '-5' } })
  const resHits = res.warnings.filter((w) => /Residual height/.test(w) && /below zero/i.test(w))
  assert.equal(resHits.length, 1)
})

test('resolvedCoverCrop is safe with nothing to resolve', () => {
  assert.doesNotThrow(() => resolvedCoverCrop())
  assert.doesNotThrow(() => computeCoverCrop(resolvedCoverCrop()))
})

/* ─────────────────────── one keystroke off, and plausible ──────────────── */

/**
 * 144 inches is transcribed here rather than imported, the same rule the tables
 * above follow. It is a judgement about what a cover crop can be, so a test that
 * read it out of the source would only prove the file can be read.
 */
test('a height that can only be a typo is queried, and still worked out', () => {
  // 18 mistyped as 180. Positive, finite, above the anchor: nothing else on this
  // worksheet has any reason to question it.
  const r = example({ stand: { height: '180' } })

  assert.match(r.warnings.join(' '), /180 inches is over 12 feet/)
  assert.ok(r.totalProduction > 0, 'flagged, not refused')
  assert.ok(r.grazingDays > 0, 'and the answer is still given')
})

test('the query does not fire on a stand somebody could be standing in', () => {
  // Sorghum-sudan and pearl millet genuinely reach eight to ten feet. A warning
  // on those would be dismissed unread by the people most likely to see it.
  for (const inches of ['18', '72', '96', '120', '144']) {
    const r = example({ season: 'warm', stand: { height: inches } })
    assert.ok(
      !r.warnings.some((w) => /over 12 feet/.test(w)),
      `${inches} inches is a real stand and must not be queried`
    )
  }
})

test('the residual is measured the same way and gets the same query', () => {
  const r = example({ stand: { height: '200' }, residual: { height: '150' } })
  assert.match(r.warnings.join(' '), /Residual height of 150 inches is over 12 feet/)
})

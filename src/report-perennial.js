/**
 * What a perennial calculation says when it leaves the app, as data.
 *
 * The two content producers only — the CSV's rows and the share image's lines.
 * All the file plumbing stays in export.js: the escaper, the download anchor,
 * the canvas, the filename. A second worksheet needs its own worksheet steps
 * written out, not its own copy of a Blob and an <a download>.
 *
 * Both return DATA rather than a file, which is what lets export.js stay the one
 * place that knows how a file is made.
 */

import { FORMATTERS } from './ui/format.js'
import { GOALS, areaUnit } from './calc.js'
import { forageById, MIXED, stagesFor } from './data/forage.js'

/**
 * Two decimals, and a BLANK for a goal that has no answer yet.
 *
 * compute() returns `null`, not 0, while a goal's inputs are not all in, and
 * `Number.isFinite(null)` is false — so this used to write "GRAZING DAYS,0" into
 * the spreadsheet for a half-finished calculation. Zero days is an answer, and a
 * wrong one. Same rule as the dash on a saved card and the dash on screen, one
 * file further out. A non-finite NUMBER still collapses to 0, which is the
 * overflow contract and a different case.
 */
const round = (n) =>
  n === null || n === undefined ? '' : Number.isFinite(n) ? Math.round(n * 100) / 100 : 0

/** A head count is floored, and the same blank applies. */
const heads = (n) => (n === null || n === undefined ? '' : Math.floor(n))

/** Everything entered and everything computed, in worksheet order. */
export function csvRowsFor(calc, res) {
  const rows = [
    ['SDSHC Grazing Calculator'],
    ['Calculation', calc.name || ''],
    ['Pasture', calc.pastureName || ''],
    ['Date', new Date().toLocaleDateString()],
    ['Working out', calc.goals.map((g) => GOALS.find((x) => x.key === g)?.short ?? g).join(', ')],
    ['Forage type', forageLabel(calc)],
    [],

    ['Step 1: clip and weigh'],
    ['Sample', 'Weight (g)'],
    ...calc.samples
      .map((s, i) => [i + 1, s === '' || s == null ? '' : Number(s)])
      .filter((r) => r[1] !== ''),
    ['Samples used', res.sampleCount],
    ['Average weight (g)', round(res.avgGrams)],
    [],

    ['Step 2: forage available'],
    ['Frame', frameLabel(calc)],
    ['Grams to lbs/ac multiplier', round(res.frameMultiplier)],
    ['Total production (lbs/ac)', round(res.totalProduction)],
    ['Dry matter source', dryMatterLabel(calc)],
    ['Dry matter (%)', round(res.dryMatterPct)],
    ['Available forage (lbs/ac)', round(res.availableForage)],
    [],

    ['Step 3: usable forage'],
    ['Forage left behind (lbs/ac)', round(res.amountLeaving)],
    ['Harvest (%)', round(res.harvestPctEquivalent)],
    ['Usable forage (lbs/ac)', round(res.usableForage)],
    [],

    ['Step 4: daily demand'],
    ['Animal weight (lbs)', round(Number(calc.demand?.animalWeight) || 0)],
    ['Percent of body weight', round(Number(calc.demand?.bodyWeightPct) || 0)],
    ['Demand per animal (lbs/day)', round(res.perAnimalDemand)],
    ['Number of animals', res.numAnimals || ''],
    ['Demand for the herd (lbs/day)', round(res.herdDemand)],
    [],

    ['Step 5: results'],
  ]

  if (res.totalAcres) {
    rows.push(
      ['Total acres', round(res.totalAcres)],
      ['Ungrazeable acres', round(res.ungrazeableAcres)],
      ['Grazeable acres', round(res.acresAvailable)],
      ['Total usable forage (lbs)', round(res.totalUsableForage)]
    )
  }
  if (res.desiredDays) rows.push(['Planned grazing days', round(res.desiredDays)])

  if (calc.goals.includes('days')) {
    rows.push([], ['GRAZING DAYS', round(res.grazingDays)], ['Animal-days', round(res.animalDays)])
  }
  if (calc.goals.includes('acres')) {
    rows.push(
      [],
      ['ACRES NEEDED PER DAY', round(res.acresPerDay)],
      ['Square feet per day', round(res.sqFtPerDay)],
      ['Paddock (ft x ft)', `${round(res.paddockWidth)} x ${round(res.paddockLength)}`],
      ['Acres for planned days', round(res.acresForDesiredDays)]
    )
  }
  if (calc.goals.includes('animals')) {
    rows.push([], ['ANIMALS ALLOWED', heads(res.animalsAllowed)])
  }

  if (res.warnings?.length) {
    rows.push([], ['Check these'], ...res.warnings.map((w) => [w]))
  }

  rows.push(
    [],
    ['Based on the SDSHC Graziers Math Worksheet.'],
    ['Dry matter from NRPH Exhibit 4-2, NRCS, September 1997.']
  )

  return rows
}

/**
 * The share image's content: the headline answers, the figures behind them, and
 * enough provenance that the picture still means something a season later.
 */
export function imageLinesFor(calc, res) {
  const headlines = []
  if (calc.goals.includes('days')) {
    headlines.push({ label: 'Grazing days', value: FORMATTERS.days(res.grazingDays) })
  }
  if (calc.goals.includes('acres')) {
    // The paddock is a NOTE under the figure rather than part of it. Inside the
    // value it doubled the string's length, and a card sharing a row with two
    // others has no width to spend on that.
    headlines.push({
      label: 'Acres needed per day',
      value: FORMATTERS.acres(res.acresPerDay),
      note: `${FORMATTERS.number(res.paddockWidth)} x ${FORMATTERS.number(res.paddockLength)} ft`,
    })
  }
  if (calc.goals.includes('animals')) {
    headlines.push({ label: 'Animals allowed', value: FORMATTERS.head(res.animalsAllowed) })
  }

  const rows = [
    ['Average sample weight', FORMATTERS.grams(res.avgGrams)],
    ['Total production', FORMATTERS.lbsPerAcre(res.totalProduction)],
    ['Dry matter', FORMATTERS.pct(res.dryMatterPct)],
    ['Available forage', FORMATTERS.lbsPerAcre(res.availableForage)],
    ['Left behind', FORMATTERS.lbsPerAcre(res.amountLeaving)],
    ['Usable forage', FORMATTERS.lbsPerAcre(res.usableForage)],
    ['Demand per animal', FORMATTERS.lbsPerDay(res.perAnimalDemand)],
  ]
  if (res.numAnimals) rows.push(['Herd demand', FORMATTERS.lbsPerDay(res.herdDemand)])
  if (res.acresAvailable) rows.push(['Grazeable acres', FORMATTERS.acres(res.acresAvailable)])

  const parts = [calc.pastureName, forageLabel(calc), new Date().toLocaleDateString()].filter(
    Boolean
  )

  return {
    headlines,
    rows,
    subtitle: parts.join('  ·  '),
    footnote: 'Based on the SDSHC Graziers Math Worksheet. NRPH Exhibit 4-2, NRCS 1997.',
  }
}

/* ────────────────────────────── labels ─────────────────────────────────── */

export function forageLabel(calc) {
  if (calc.forageType === MIXED.id) return MIXED.label
  return forageById(calc.forageType)?.label ?? ''
}

function frameLabel(calc) {
  const key = calc.frame?.key
  if (key === 'small') return 'Small hoop, 0.96 sq ft'
  if (key === 'large') return 'Large hoop, 1.92 sq ft'
  // In the unit it was measured in, not converted to square feet. The row
  // below it already carries the multiplier the model worked out, so this
  // one is here to be checked against the frame in the pickup.
  const unit = areaUnit(calc.frame?.areaUnit)?.label ?? 'sq ft'
  return `Custom, ${calc.frame?.customArea || '?'} ${unit}`
}

function dryMatterLabel(calc) {
  const mode = calc.dm?.mode
  if (mode === 'own') return 'Air-dried own sample'
  if (mode === 'mix') return 'Weighted mix of types'
  const typeId = calc.forageType === MIXED.id ? calc.dm?.stageTypeId : calc.forageType
  const stage = stagesFor(typeId).find((s) => s.key === calc.dm?.stageKey)
  return stage ? `Chart: ${forageById(typeId)?.label}, ${stage.label}` : 'Chart'
}

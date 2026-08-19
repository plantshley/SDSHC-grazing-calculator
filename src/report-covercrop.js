/**
 * What a cover crop calculation says when it leaves the app, as data.
 *
 * Mirrors report-perennial.js exactly: rows for the CSV, lines for the share
 * image, and no file plumbing. The provenance rows are this worksheet's own —
 * the season and where the utilization figure came from — because a spreadsheet
 * opened next season has to say which estimate produced the numbers in it.
 */

import { FORMATTERS } from './ui/format.js'
import { GOALS } from './calc-covercrop.js'
import { seasonById, UTILIZATION_PERIODS } from './data/covercrop.js'

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

export function seasonLabel(calc) {
  return seasonById(calc.season)?.label ?? ''
}

/**
 * Where the utilization percent came from, not just what it was.
 *
 * "65%" a season later says nothing about whether it was the table's answer for
 * a five-day occupation or a figure somebody typed, and those are different
 * claims about the same field.
 */
function utilizationLabel(calc) {
  if (calc.utilization?.mode === 'own') return 'Entered directly'
  const period = UTILIZATION_PERIODS.find((p) => p.key === calc.utilization?.periodKey)
  return period ? `Occupation period: ${period.label}` : 'Not chosen'
}

export function csvRowsFor(calc, res) {
  const rows = [
    ['SDSHC Grazing Calculator'],
    ['Worksheet', 'Grazing Cover Crops'],
    ['Calculation', calc.name || ''],
    ['Field', calc.pastureName || ''],
    ['Date', new Date().toLocaleDateString()],
    ['Working out', calc.goals.map((g) => GOALS.find((x) => x.key === g)?.short ?? g).join(', ')],
    ['Dominant season', seasonLabel(calc)],
    [],

    ['Step 1: measure height'],
    ['Average height (in)', round(res.standHeight)],
    ['Total air-dry production (lbs/ac)', round(res.totalProduction)],
    [],

    ['Step 2: residual left'],
    ['Residual height (in)', round(res.residualHeight)],
    ['Residual air-dry production (lbs/ac)', round(res.residualProduction)],
    ['Available forage (lbs/ac)', round(res.availableForage)],
    [],

    ['Step 3: usable forage'],
    ['Utilization source', utilizationLabel(calc)],
    ['Utilization (%)', round(res.utilizationPct)],
    ['Left behind (lbs/ac)', round(res.forageLeftBehind)],
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

  rows.push([], ['Based on the SDSHC Grazing Cover Crops worksheet.'])

  return rows
}

export function imageLinesFor(calc, res) {
  const headlines = []
  if (calc.goals.includes('days')) {
    headlines.push({ label: 'Grazing days', value: FORMATTERS.days(res.grazingDays) })
  }
  if (calc.goals.includes('acres')) {
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
    ['Average height', `${FORMATTERS.decimal(res.standHeight)} in`],
    ['Total production', FORMATTERS.lbsPerAcre(res.totalProduction)],
    ['Residual left', `${FORMATTERS.decimal(res.residualHeight)} in`],
    ['Available forage', FORMATTERS.lbsPerAcre(res.availableForage)],
    ['Utilization', FORMATTERS.pct(res.utilizationPct)],
    ['Usable forage', FORMATTERS.lbsPerAcre(res.usableForage)],
    ['Demand per animal', FORMATTERS.lbsPerDay(res.perAnimalDemand)],
  ]
  if (res.numAnimals) rows.push(['Herd demand', FORMATTERS.lbsPerDay(res.herdDemand)])
  if (res.acresAvailable) rows.push(['Grazeable acres', FORMATTERS.acres(res.acresAvailable)])

  // The season is in the subtitle rather than left to the rows, so a picture
  // landing in a text message says which worksheet it came off before anybody
  // reads a figure on it.
  const parts = [calc.pastureName, `Cover crop: ${seasonLabel(calc)}`, new Date().toLocaleDateString()]

  return {
    headlines,
    rows,
    subtitle: parts.filter(Boolean).join('  ·  '),
    footnote: 'Based on the SDSHC Grazing Cover Crops worksheet.',
  }
}

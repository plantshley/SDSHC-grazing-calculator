/**
 * The Grazing Cover Crops worksheet, as arithmetic.
 *
 * A second model rather than a branch inside compute(). The two worksheets share
 * their last three steps exactly and share nothing at all in their first two —
 * one starts from clipped samples through a hoop, the other from a yardstick —
 * so a merged function would be one whose every line is behind an `if`.
 *
 * What they really share is the arithmetic, and that IS shared: demand(),
 * daysFrom(), acresFrom(), animalsFrom() and paddockSides() are imported below
 * from calc.js, which is where they have always been exported on their own.
 *
 * Imports the primitives from calc.js and NOTHING else. calc.js itself still
 * imports nothing, and the season constants and the occupation-period table stay
 * out of here for the same reason Exhibit 4-2 does: they are looked up by
 * state-covercrop.js and this module is handed plain numbers, so it can be
 * tested against the paper worksheet on its own.
 *
 * Every rule calc.js states applies here word for word:
 *  - every arithmetic result passes through num(), finite() or safeDiv()
 *  - every quantity passes through nonNegative()
 *  - blank is not zero, and an unanswered goal has no answer: a goal whose
 *    inputs are not all in returns null, never 0
 */

import {
  num,
  finite,
  safeDiv,
  nonNegative,
  demand,
  daysFrom,
  acresFrom,
  animalsFrom,
  paddockSides,
  SQ_FT_PER_ACRE,
} from './calc.js'

/**
 * Intake as a percent of body weight, per day.
 *
 * The printed worksheet fixes this at 3%. The default here is 2.6%, which is
 * SDSHC's working figure across both worksheets and sits inside the NRCS range
 * of 2.5% to 3%. The field is editable, so a 3% worksheet is reproduced by
 * typing 3 into it.
 */
export const COVER_CROP_BODY_WEIGHT_PCT = 2.6

/**
 * A height past which somebody has mistyped, in inches.
 *
 * Twelve feet. Not a worksheet constant and not a limit: the estimate is a
 * straight line with no upper end, and a stand really is measured with a
 * yardstick, so this is only a figure worth a second look.
 *
 * The failure it catches is one keystroke. An 18 inch stand typed as 180 gives
 * 45,140 lbs/ac and offers a hundred head a year of grazing, and every figure on
 * the way there looks like a figure. Nothing else on this worksheet would query
 * it: 180 is positive, finite, and above the anchor.
 *
 * Twelve feet rather than the six a cool-season stand would never pass, because
 * a warning that fires on real work is worse than no warning at all. Sorghum-
 * sudan, pearl millet and sunn hemp all reach eight to ten feet in a good year,
 * and a line querying those would be dismissed unread by the people most likely
 * to be measuring them. Twelve still catches 180 for 18 and 240 for 24, which
 * are the slips that matter.
 */
export const IMPLAUSIBLE_HEIGHT_IN = 144

export const GOALS = [
  {
    key: 'days',
    label: 'Number of grazing days',
    short: 'Grazing days',
    sub: 'You know the acres and your herd. Work out how long they can stay.',
  },
  {
    key: 'acres',
    label: 'Number of acres needed',
    short: 'Acres needed',
    sub: 'You know your herd. Work out the paddock size for a day, or for a rotation.',
  },
  {
    key: 'animals',
    label: 'Number of animals allowed',
    short: 'Animals allowed',
    sub: 'You know the acres and how long you want to graze. Work out the herd size.',
  },
]

/**
 * What each goal needs, beyond the stand and demand figures every goal shares.
 *
 * The same shape as the perennial sheet's GOAL_INPUTS and the single source for
 * the same three things: which fields render in the last two steps, the "what
 * you will need" checklist, and per-goal validation.
 */
export const GOAL_INPUTS = {
  shared: ['season', 'height', 'residualHeight', 'utilization', 'animalWeight', 'bodyWeightPct'],
  days: { required: ['numAnimals', 'totalAcres'], optional: ['ungrazeableAcres'] },
  acres: { required: ['numAnimals'], optional: ['desiredDays'] },
  animals: { required: ['totalAcres', 'desiredDays'], optional: ['ungrazeableAcres'] },
}

/**
 * Which of those keys each step collects.
 *
 * Step 5 is empty for the same reason it is on the other worksheet: its inputs
 * are named by the result cards themselves, and a second note above them saying
 * the same thing in different words reads as two separate problems.
 */
export const STEP_INPUTS = [
  ['season', 'height'],
  ['residualHeight'],
  ['utilization'],
  ['animalWeight', 'bodyWeightPct', 'numAnimals'],
  [],
]

/** Plain-language names, in this worksheet's words. Keys match GOAL_INPUTS. */
export const INPUT_LABELS = {
  season: 'Which season the cover crop is dominated by',
  height: 'Average height of the stand, in inches',
  residualHeight: 'The residual height you plan to leave, in inches',
  utilization: 'Percent utilization, or how long the animals stay on the piece',
  animalWeight: 'Average weight of your animals',
  bodyWeightPct: 'Percent of body weight eaten per day (2.6% if unsure)',
  numAnimals: 'Number of animals in the herd',
  totalAcres: 'Total acres in the field',
  ungrazeableAcres: 'Ungrazeable acres, if any',
  desiredDays: 'How many days you plan to graze',
}

const isBlank = (v) => v === '' || v === null || v === undefined

/* ─────────────────────────────── the steps ─────────────────────────────── */

/**
 * Air-dry production at a given height, from a season's own two constants.
 *
 * `base` covers the first `anchor` inches and `perInch` every inch above. The
 * mix estimate has no base and an anchor of 0, so the same expression covers it:
 * 0 + 215 × (h − 0).
 *
 * Below the anchor the subtraction goes NEGATIVE and drags the total down, which
 * nonNegative() cannot catch because it happens inside the formula rather than
 * to an input. A stand shorter than the anchor is clamped to zero and says so:
 * the estimate simply does not describe a 2-inch stand, and reporting a smaller
 * number would be answering a question the worksheet cannot answer.
 *
 * @returns {number} lbs per acre, never negative and never non-finite.
 */
export function productionAt(height, season, label, warnings) {
  const h = nonNegative(height, label, warnings)
  const base = finite(num(season?.base))
  const anchor = finite(num(season?.anchor))
  const perInch = finite(num(season?.perInch))

  if (h <= 0) return 0
  // Flagged, not refused, the same as an intake rate above 10% of body weight on
  // the other model. Somebody may genuinely be standing in a thirteen foot stand
  // of sorghum-sudan, and this worksheet is not entitled to tell them they are
  // not. It says the figure is worth checking and works it out anyway.
  if (h > IMPLAUSIBLE_HEIGHT_IN) {
    warnings?.push(
      `${label} of ${h} inches is over ${IMPLAUSIBLE_HEIGHT_IN / 12} feet. Check the figure.`
    )
  }
  if (h < anchor) {
    warnings?.push(
      `${label} of ${h} inches is below the ${anchor} inches this estimate starts from, so it cannot be worked out. It is counted as 0 here.`
    )
    return 0
  }
  return finite(base + finite(perInch * (h - anchor)))
}

/* ──────────────────────────────── compute ──────────────────────────────── */

/**
 * The whole worksheet, in order.
 *
 * Takes a calculation with its season constants and utilization percent already
 * resolved by state-covercrop.js. Returns every figure the page shows, plus the
 * warnings and the per-goal and per-step shortfalls.
 */
export function computeCoverCrop(c = {}) {
  const warnings = []
  // Where each step's warnings begin. compute() runs in worksheet order, so the
  // step a warning belongs to is just where in this function it was raised, and
  // slicing at the boundaries beats making every push name its own step: a push
  // that named the wrong step would be wrong silently, and this cannot be.
  //
  // Step 1 starts at zero, so anything raised before the first boundary — the
  // unknown-season check, which is what the step 1 estimate is built on — is
  // step 1's. Same shape as missingByStep below.
  const stepStarts = [0]
  const nextStep = () => stepStarts.push(warnings.length)

  const goals = Array.isArray(c.goals) ? c.goals : []
  const season = c.seasonRates ?? null
  // An unrecognised season resolves to null rates, and every rate then reads as
  // 0 through num(undefined): production would come out 0 with nothing on screen
  // saying why. Same guard, same voice, as frameMultiplier() on the other model.
  // Reachable from an imported file or from a stored record if these ids change.
  if (!season && !isBlank(c.season)) {
    warnings.push(
      `"${c.season}" is not a season this calculator knows. Choose the season again.`
    )
  }

  /* Step 1 — total air-dry production from average height */
  // The CLAMPED height goes into productionAt(), not the raw one. productionAt()
  // clamps too — it is exported and has to be safe on its own — and handing it
  // the raw value put the same "cannot be below zero" sentence in the list twice.
  const standHeight = nonNegative(c.stand?.height, 'Average height', warnings)
  const totalProduction = productionAt(standHeight, season, 'Average height', warnings)

  /* Step 2 — the residual, and what is left over it */
  nextStep()
  const residualHeight = nonNegative(c.residual?.height, 'Residual height', warnings)
  const residualProduction = productionAt(residualHeight, season, 'Residual height', warnings)

  let availableForage = finite(totalProduction - residualProduction)
  // The same shape as the perennial sheet's "you are leaving at least as much
  // forage as the sample says is there". A residual at or above the stand is not
  // an error to refuse, it is a plan with nothing in it to graze.
  if (totalProduction > 0 && availableForage <= 0) {
    warnings.push(
      `The residual height you want to leave is at least as tall as the stand, so there is nothing available to graze. Check the two heights.`
    )
    availableForage = 0
  } else if (availableForage < 0) {
    availableForage = 0
  }

  /* Step 3 — usable forage, from utilization */
  nextStep()
  const utilMode = c.utilization?.mode === 'own' ? 'own' : 'period'
  // The same failure one step along: a period key nothing matches resolves to a
  // blank percent, which reads as 0% utilization and zeroes the usable forage.
  if (
    utilMode === 'period' &&
    !isBlank(c.utilization?.periodKey) &&
    isBlank(c.utilization?.periodPct)
  ) {
    warnings.push(
      `"${c.utilization.periodKey}" is not an occupation period this calculator knows. Choose it again.`
    )
  }
  const rawUtil = nonNegative(
    utilMode === 'own' ? c.utilization?.ownPct : c.utilization?.periodPct,
    'Percent utilization',
    warnings
  )
  if (rawUtil > 100) {
    warnings.push('Utilization cannot be above 100%. Nothing would be left behind.')
  }
  const utilizationPct = Math.min(rawUtil, 100)
  const usableForage = finite(availableForage * (utilizationPct / 100))
  const forageLeftBehind = finite(availableForage - usableForage)

  /* Step 4 — daily demand. The perennial sheet's step 4, unchanged. */
  nextStep()
  const d = demand(c.demand?.animalWeight, c.demand?.bodyWeightPct, c.demand?.numAnimals, warnings)

  /* Step 5 — the land */
  nextStep()
  const totalAcres = nonNegative(c.pasture?.totalAcres, 'Total acres', warnings)
  const ungrazeableAcres = nonNegative(c.pasture?.ungrazeableAcres, 'Ungrazeable acres', warnings)
  let acresAvailable = finite(totalAcres - ungrazeableAcres)
  if (totalAcres > 0 && acresAvailable <= 0) {
    warnings.push(
      'Ungrazeable acres are at least as many as the total, so there is nothing left to graze. Check both figures.'
    )
    acresAvailable = 0
  } else if (acresAvailable < 0) {
    acresAvailable = 0
  }

  const totalUsableForage = finite(acresAvailable * usableForage)
  const desiredDays = nonNegative(c.pasture?.desiredDays, 'Planned grazing days', warnings)
  const animalDays = safeDiv(totalUsableForage, d.perAnimal)

  /* What is still outstanding, per goal and per step */
  const have = answered(c)
  const missing = {}
  for (const goal of ['days', 'acres', 'animals']) {
    const spec = GOAL_INPUTS[goal]
    missing[goal] = [...GOAL_INPUTS.shared, ...spec.required].filter((k) => !have[k])
  }
  const outstanding = new Set(goals.flatMap((g) => missing[g] ?? []))
  const missingByStep = STEP_INPUTS.map((keys) => keys.filter((k) => outstanding.has(k)))
  // Every warning still in `warnings`, in order, plus the same list cut up by the
  // step that raised it. Both are returned: the steps show their own, and the
  // CSV and the share image carry the whole list as one block.
  const warningsByStep = stepStarts.map((from, i) =>
    warnings.slice(from, stepStarts[i + 1] ?? warnings.length)
  )

  // null, never 0. Zero days is an answer, and a wrong one: it says this field
  // will not feed anything.
  const ready = (goal, value) => (missing[goal].length ? null : value)

  const grazingDays = ready('days', daysFrom(totalUsableForage, d.herd))
  const acresPerDay = ready('acres', acresFrom(d.herd, usableForage))
  const animalsAllowed = ready('animals', animalsFrom(totalUsableForage, d.perAnimal, desiredDays))

  const sqFtPerDay = acresPerDay == null ? null : finite(acresPerDay * SQ_FT_PER_ACRE)
  const paddock = paddockSides(sqFtPerDay ?? 0, c.pasture?.paddockWidth)
  const acresForDesiredDays =
    acresPerDay == null || isBlank(c.pasture?.desiredDays)
      ? null
      : finite(acresPerDay * desiredDays)

  return {
    goals,
    warnings,
    missing,
    missingByStep,
    warningsByStep,

    // Step 1
    standHeight,
    totalProduction,

    // Step 2
    residualHeight,
    residualProduction,
    availableForage,

    // Step 3
    utilMode,
    utilizationPct,
    forageLeftBehind,
    usableForage,

    // Step 4
    perAnimalDemand: d.perAnimal,
    herdDemand: d.herd,
    numAnimals: d.head,

    // Step 5
    totalAcres,
    ungrazeableAcres,
    acresAvailable,
    totalUsableForage,
    desiredDays,

    acresPerDay,
    sqFtPerDay,
    paddockWidth: paddock.width,
    paddockLength: paddock.length,
    acresForDesiredDays,

    animalDays,
    grazingDays,
    animalsAllowed,
  }
}

/**
 * Which inputs have been ANSWERED. Blank is not zero: an explicit 0 counts.
 *
 * The only place that decides this for this model, exactly as calc.js's own
 * answered() is for the other one. A new required input goes in GOAL_INPUTS AND
 * here, or a goal will hand back a figure built on a blank.
 */
function answered(c) {
  // The RESOLVED value, not the key that was stored. A season or a period this
  // build cannot look up is not an answer: every rate behind it reads as 0, and
  // reporting it as answered lets the goal hand back a real-looking "0 grazing
  // days" instead of a dash and a note saying what to pick again. compute() is
  // always given a resolved record, so `seasonRates` and `periodPct` are here.
  const util =
    c.utilization?.mode === 'own' ? c.utilization?.ownPct : c.utilization?.periodPct

  return {
    season: !isBlank(c.season) && !!c.seasonRates,
    height: !isBlank(c.stand?.height),
    residualHeight: !isBlank(c.residual?.height),
    utilization: !isBlank(util),
    animalWeight: !isBlank(c.demand?.animalWeight),
    bodyWeightPct: !isBlank(c.demand?.bodyWeightPct),
    numAnimals: !isBlank(c.demand?.numAnimals),
    totalAcres: !isBlank(c.pasture?.totalAcres),
    // Never blocks a result. Nothing ungrazeable is the normal case and leaving
    // it empty means zero, not "unanswered".
    ungrazeableAcres: true,
    desiredDays: !isBlank(c.pasture?.desiredDays),
  }
}

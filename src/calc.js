/**
 * The model. Pure: no DOM, no imports, no side effects, no I/O.
 *
 * Its purity is the only reason it can be tested against the paper worksheet
 * independently of the UI. Do not add a DOM reference here, however convenient.
 *
 * Source: SDSHC GRAZIERS MATH WORKSHEET, five steps, built on NRPH Exhibit 4-2.
 *
 * The numeric-safety rules are carried over from SDSHC-farm-budget, where every
 * one of them came from a bug that put a wrong figure in front of a producer:
 *
 *  - Every arithmetic result passes through num(), finite() or safeDiv(). Two
 *    finite inputs can multiply past Number.MAX_VALUE, and the Infinity spreads
 *    until it meets a x 0 and renders as "NaN" on screen. An overflow collapses
 *    to 0.
 *  - num() rejects Infinity as well as NaN. `Number(x) || 0` lets it through.
 *  - safeDiv() only guards a divisor of exactly zero. Negative divisors pass
 *    straight through, which is why acreage clamps before it divides.
 *  - Every quantity goes through nonNegative(). A finite number is not a
 *    correct one: a "-600" typed for forage left behind is ADDED to usable
 *    forage and overstocks the pasture.
 */

export const SCHEMA_VERSION = 1

/* ───────────────────────────── constants ───────────────────────────────── */

export const SQ_FT_PER_ACRE = 43560
const GRAMS_PER_LB = 453.592

/**
 * Grams in a sampling frame to pounds per acre.
 *
 * 43,560 sq ft/ac / 453.592 g/lb = 96.03, then divided by the frame area.
 * For the two standard NRCS hoops that lands on 100.03 and 50.02, and the
 * worksheet prints 100 and 50.
 *
 * The worksheet's round numbers are used for the two presets rather than the
 * exact ones, deliberately. Someone working a paper copy alongside this screen
 * must not find the two disagreeing in the third digit, and a sample-based
 * estimate is nowhere near accurate enough for 0.03% to mean anything.
 */
export const GRAMS_TO_LBS_PER_ACRE = SQ_FT_PER_ACRE / GRAMS_PER_LB

export const FRAMES = [
  { key: 'small', label: 'Small hoop', area: 0.96, multiplier: 100 },
  { key: 'large', label: 'Large hoop', area: 1.92, multiplier: 50 },
  { key: 'custom', label: 'Other frame', area: null, multiplier: null },
]

/** The worksheet's default intake. NRPH puts the usual range at 2.5% to 3%. */
export const DEFAULT_BODY_WEIGHT_PCT = 2.6

export const GOALS = [
  {
    key: 'days',
    label: 'Number of grazing days',
    short: 'Grazing days',
    sub: 'You know your pasture and your herd. Work out how long they can stay.',
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
    sub: 'You know your pasture and how long you want to graze. Work out the herd size.',
  },
]

/**
 * What each goal needs from the user, beyond the sampling and demand figures
 * every goal shares.
 *
 * This is the single source for three things: which fields render in steps 4
 * and 5, the "what you will need" checklist on the landing screen, and per-goal
 * validation. Hard-coding any of those separately is how a checklist starts
 * promising a field the form never asks for.
 *
 * `shared` is required by every goal. `optional` is used when present and never
 * blocks a result.
 */
export const GOAL_INPUTS = {
  shared: ['samples', 'frame', 'dryMatter', 'amountLeaving', 'animalWeight', 'bodyWeightPct'],
  days: { required: ['numAnimals', 'totalAcres'], optional: ['ungrazeableAcres'] },
  acres: { required: ['numAnimals'], optional: ['desiredDays'] },
  animals: { required: ['totalAcres', 'desiredDays'], optional: ['ungrazeableAcres'] },
}

/**
 * Which of GOAL_INPUTS' keys each step of the worksheet collects.
 *
 * Used to tell someone leaving a step what they have not answered on it yet.
 * Whether a key is REQUIRED still comes from GOAL_INPUTS and the goals actually
 * selected, so this is a map of where a question is asked and not a second
 * opinion about whether it has to be.
 *
 * Step 5 is deliberately empty. Its inputs are named by the result cards
 * themselves, in `missing`, and a second note above them saying the same thing
 * in different words reads as two separate problems.
 */
export const STEP_INPUTS = [
  ['samples'],
  ['frame', 'dryMatter'],
  ['amountLeaving'],
  ['animalWeight', 'bodyWeightPct', 'numAnimals'],
  [],
]

/** Plain-language names for the checklist. Keys match GOAL_INPUTS. */
export const INPUT_LABELS = {
  samples: 'Clipped forage samples and a gram scale',
  frame: 'Your clipping hoop or frame, and its size',
  dryMatter: 'Dry matter percent, or the growth stage of the stand',
  amountLeaving: 'How much forage you plan to leave behind',
  animalWeight: 'Average weight of your animals',
  bodyWeightPct: 'Percent of body weight eaten per day (2.6% if unsure)',
  numAnimals: 'Number of animals in the herd',
  totalAcres: 'Total acres in the pasture',
  ungrazeableAcres: 'Ungrazeable acres, if any',
  desiredDays: 'How many days you plan to graze',
}

/* ───────────────────────────── primitives ──────────────────────────────── */

/** Strips formatting, and rejects Infinity as well as NaN. */
export function num(v) {
  const n = Number(typeof v === 'string' ? v.replace(/[$\s,]/g, '') : v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Every figure that reaches the screen goes through here.
 *
 * Two finite inputs can still multiply past Number.MAX_VALUE, and the resulting
 * Infinity spreads. Worse, `Infinity * 0` and `Infinity - Infinity` become NaN,
 * so a figure renders as "NaN". Collapsing an overflow to 0 matches how every
 * other unusable input is treated here.
 */
export function finite(n) {
  return Number.isFinite(n) ? n : 0
}

/** Guards a divisor of exactly zero. Negative divisors pass through. */
export function safeDiv(numerator, divisor) {
  const d = num(divisor)
  return d === 0 ? 0 : finite(num(numerator) / d)
}

/**
 * A quantity that a minus sign would turn upside down.
 *
 * A finite number is not a correct one. "-600" typed for forage left behind is
 * subtracted from a subtraction, which ADDS to usable forage and overstocks the
 * pasture. Treating it as zero is wrong too, but it is wrong in the safe
 * direction and it says so out loud.
 */
export function nonNegative(value, label, warnings) {
  const n = num(value)
  if (n >= 0) return n
  warnings?.push(`${label} cannot be below zero. It is counted as 0 here. Check for a stray minus sign.`)
  return 0
}

/** Blank means "not answered yet"; an explicit 0 means zero. */
function isBlank(v) {
  return v === '' || v === null || v === undefined
}

/**
 * Which of a goal's inputs have actually been answered.
 *
 * This is the difference between "you have not told me the herd size yet" and
 * "the answer is zero", and `Number('') === 0` erases it. Without this, leaving
 * planned days blank shows "0 head allowed", which reads as a real answer and
 * is the exact failure this module exists to prevent.
 *
 * An explicit 0 counts as answered. Someone who types 0 meant 0.
 */
function answered(c) {
  const leaveField = c.usable?.mode === 'pct' ? c.usable?.harvestPct : c.usable?.amountLeaving
  return {
    // A preset hoop answers this by itself. "Other frame" does not: it starts
    // blank, and a blank area silently zeroes total production, which used to be
    // hidden by the form defaulting to a hoop nobody had confirmed owning.
    frame: c.frame?.key !== 'custom' || !isBlank(c.frame?.customArea),
    ungrazeableAcres: true,
    samples: (Array.isArray(c.samples) ? c.samples : []).some((s) => !isBlank(s)),
    dryMatter: dryMatterAnswered(c),
    amountLeaving: !isBlank(leaveField),
    animalWeight: !isBlank(c.demand?.animalWeight),
    bodyWeightPct: !isBlank(c.demand?.bodyWeightPct),
    numAnimals: !isBlank(c.demand?.numAnimals),
    totalAcres: !isBlank(c.pasture?.totalAcres),
    desiredDays: !isBlank(c.pasture?.desiredDays),
  }
}

function dryMatterAnswered(c) {
  if (c.dm?.mode === 'own') return !isBlank(c.dm?.ownPct)
  if (c.dm?.mode === 'mix') {
    return (c.dm?.mix ?? []).some((r) => !isBlank(r?.pct) && !isBlank(r?.share))
  }
  return !isBlank(c.dm?.stagePct)
}

/* ─────────────────────────────── step 1 ────────────────────────────────── */

/**
 * Average sample weight in grams.
 *
 * Blank rows are skipped rather than counted as zero. The form shows ten boxes
 * and most people fill five; counting the empty ones would halve every result
 * with nothing on screen to explain it.
 */
export function averageSample(samples, warnings) {
  const used = (Array.isArray(samples) ? samples : [])
    .filter((s) => !isBlank(s))
    .map((s, i) => nonNegative(s, `Sample ${i + 1}`, warnings))

  if (!used.length) return { avgGrams: 0, count: 0, min: 0, max: 0, spread: 0 }

  const total = used.reduce((sum, g) => finite(sum + g), 0)
  const avgGrams = safeDiv(total, used.length)
  const min = Math.min(...used)
  const max = Math.max(...used)

  // Relative spread, used only to suggest taking more samples. Guarded through
  // safeDiv so an all-zero set reports 0 rather than NaN.
  const spread = safeDiv(max - min, avgGrams)

  return { avgGrams, count: used.length, min, max, spread }
}

/* ─────────────────────────────── step 2 ────────────────────────────────── */

/** Pounds per acre from one gram of sample, for the chosen frame. */
export function frameMultiplier(frameKey, customArea, warnings) {
  const preset = FRAMES.find((f) => f.key === frameKey)
  if (preset && preset.multiplier != null) return preset.multiplier

  // An unrecognised key would otherwise fall through to the custom-area branch
  // and read a blank area as a multiplier of 0, silently zeroing production.
  if (!preset) {
    warnings?.push(`"${frameKey}" is not a frame size this calculator knows. Pick one again.`)
    return 0
  }

  const area = nonNegative(customArea, 'Frame area', warnings)
  if (area <= 0) return 0
  return safeDiv(GRAMS_TO_LBS_PER_ACRE, area)
}

/**
 * Blended dry matter for a mixed stand.
 *
 * `rows` are `{pct, share}`. Shares are weights, not required to total 100:
 * dividing by their sum means someone who enters 60 and 30 gets the same answer
 * as 67 and 33. The UI still warns when they do not total 100, because a pair
 * that does not is usually a third row someone forgot rather than a deliberate
 * ratio.
 */
export function blendDryMatter(rows, warnings) {
  const used = (Array.isArray(rows) ? rows : []).filter(
    (r) => !isBlank(r?.pct) && !isBlank(r?.share)
  )
  if (!used.length) return { pct: 0, shareTotal: 0 }

  let weighted = 0
  let shareTotal = 0
  for (const r of used) {
    const share = nonNegative(r.share, 'Percent of stand', warnings)
    const pct = nonNegative(r.pct, 'Dry matter', warnings)
    weighted = finite(weighted + finite(pct * share))
    shareTotal = finite(shareTotal + share)
  }
  return { pct: safeDiv(weighted, shareTotal), shareTotal }
}

/* ─────────────────────── steps 3 to 5, reusable ────────────────────────── */

/**
 * Daily forage demand. Exported on its own because the cover crop worksheet
 * uses the identical calculation with a 3% default, so the second calculator
 * will reuse this rather than restating it.
 */
export function demand(animalWeight, bodyWeightPct, numAnimals, warnings) {
  const weight = nonNegative(animalWeight, 'Animal weight', warnings)
  const rate = nonNegative(bodyWeightPct, 'Percent of body weight', warnings)
  const head = nonNegative(numAnimals, 'Number of animals', warnings)

  if (rate > 10) {
    warnings?.push(
      `${rate}% of body weight per day is far above the usual 2.5% to 3%. Check the figure.`
    )
  }

  const perAnimal = finite(weight * (rate / 100))
  return { perAnimal, herd: finite(perAnimal * head), head }
}

/** Grazing days a stock of forage supports at a given daily demand. */
export function daysFrom(totalUsableForage, herdDemandPerDay) {
  return safeDiv(totalUsableForage, herdDemandPerDay)
}

/** Acres needed per day at a given daily demand and forage density. */
export function acresFrom(herdDemandPerDay, usablePerAcre) {
  return safeDiv(herdDemandPerDay, usablePerAcre)
}

/** Head a stock of forage supports for a given number of days. */
export function animalsFrom(totalUsableForage, perAnimalDemand, days) {
  return safeDiv(safeDiv(totalUsableForage, perAnimalDemand), days)
}

/* ──────────────────────────── the whole sheet ──────────────────────────── */

/**
 * Run the worksheet.
 *
 * Takes the stored calculation and returns every figure the screen shows, plus
 * the warnings raised along the way. Never throws and never returns a
 * non-finite number.
 *
 * @param {object} c the calculation state
 * @returns {object} every intermediate and result, plus `warnings`
 */
export function compute(c = {}) {
  const warnings = []
  const goals = Array.isArray(c.goals) ? c.goals : []

  /* Step 1 */
  const sample = averageSample(c.samples, warnings)

  /* Step 2 */
  const multiplier = frameMultiplier(c.frame?.key, c.frame?.customArea, warnings)
  const totalProduction = finite(sample.avgGrams * multiplier)

  const dryMatterPct = resolveDryMatter(c, warnings)
  const availableForage = finite(totalProduction * (dryMatterPct / 100))

  /* Step 3 */
  const leaveMode = c.usable?.mode === 'pct' ? 'pct' : 'lbs'
  let amountLeaving
  let usableForage

  if (leaveMode === 'pct') {
    const harvestPct = nonNegative(c.usable?.harvestPct, 'Harvest percent', warnings)
    if (harvestPct > 100) {
      warnings.push('Harvest percent cannot be above 100. Nothing would be left behind.')
    }
    // An explicit 0 is the mirror of leaving more than is available, and needs
    // the same explanation. Without this the answers collapse to zero with
    // nothing on screen saying why.
    if (availableForage > 0 && harvestPct === 0 && !isBlank(c.usable?.harvestPct)) {
      warnings.push(
        'A harvest of 0% means nothing is grazed, so there is nothing to work out. Check the harvest percent.'
      )
    }
    const capped = Math.min(harvestPct, 100)
    usableForage = finite(availableForage * (capped / 100))
    amountLeaving = finite(availableForage - usableForage)
  } else {
    amountLeaving = nonNegative(c.usable?.amountLeaving, 'Forage left behind', warnings)
    usableForage = finite(availableForage - amountLeaving)
    if (availableForage > 0 && usableForage <= 0) {
      warnings.push(
        'You are leaving at least as much forage as the sample says is there, so there is nothing to graze. Check the amount left behind.'
      )
      usableForage = 0
    } else if (usableForage < 0) {
      usableForage = 0
    }
  }

  // The equivalent figure in the other unit, so the toggle shows both readings.
  const harvestPctEquivalent = finite(safeDiv(usableForage, availableForage) * 100)

  /* Step 4 */
  const d = demand(c.demand?.animalWeight, c.demand?.bodyWeightPct, c.demand?.numAnimals, warnings)

  /* Step 5, shared land figures */
  const totalAcres = nonNegative(c.pasture?.totalAcres, 'Total acres', warnings)
  const ungrazeableAcres = nonNegative(c.pasture?.ungrazeableAcres, 'Ungrazeable acres', warnings)
  let acresAvailable = finite(totalAcres - ungrazeableAcres)
  if (totalAcres > 0 && acresAvailable <= 0) {
    warnings.push(
      'Ungrazeable acres are at least as many as the total, so no acres are left to graze. Check both figures.'
    )
    acresAvailable = 0
  } else if (acresAvailable < 0) {
    acresAvailable = 0
  }
  const totalUsableForage = finite(acresAvailable * usableForage)

  const desiredDays = nonNegative(c.pasture?.desiredDays, 'Planned grazing days', warnings)

  /* Step 5, per goal */
  const animalDays = safeDiv(totalUsableForage, d.perAnimal)

  /**
   * An answer is withheld until everything it needs has been entered.
   *
   * `null` rather than 0, because the screen renders null as a dash and 0 as
   * "0 head allowed". The second is a wrong answer wearing the clothes of a
   * right one.
   */
  const have = answered(c)
  const missing = {}
  for (const goal of ['days', 'acres', 'animals']) {
    const spec = GOAL_INPUTS[goal]
    missing[goal] = [...GOAL_INPUTS.shared, ...spec.required].filter((k) => !have[k])
  }

  // The same shortfall, sorted by the step it would be fixed on. Only the goals
  // actually SELECTED count: `missing` is worked out for all three so a card can
  // be added without recomputing, but warning someone about a herd size for an
  // answer they did not ask for is noise.
  const outstanding = new Set(goals.flatMap((g) => missing[g] ?? []))
  const missingByStep = STEP_INPUTS.map((keys) => keys.filter((k) => outstanding.has(k)))

  const ready = (goal, value) => (missing[goal].length ? null : value)

  const grazingDays = ready('days', daysFrom(totalUsableForage, d.herd))
  const acresPerDay = ready('acres', acresFrom(d.herd, usableForage))
  const animalsAllowed = ready(
    'animals',
    animalsFrom(totalUsableForage, d.perAnimal, desiredDays)
  )

  // The paddock figures hang off acresPerDay, so they are withheld with it.
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

    // Step 1
    avgGrams: sample.avgGrams,
    sampleCount: sample.count,
    sampleMin: sample.min,
    sampleMax: sample.max,
    sampleSpread: sample.spread,

    // Step 2
    frameMultiplier: multiplier,
    totalProduction,
    dryMatterPct,
    availableForage,

    // Step 3
    leaveMode,
    amountLeaving,
    usableForage,
    harvestPctEquivalent,

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
 * Which dry matter figure applies, given the mode the user is in.
 *
 * The stage lookup happens in the UI, which owns data/forage.js. This module
 * takes the resolved percentage so it can stay free of imports.
 */
function resolveDryMatter(c, warnings) {
  const mode = c.dm?.mode

  if (mode === 'own') {
    const own = nonNegative(c.dm?.ownPct, 'Dry matter percent', warnings)
    if (own > 100) {
      warnings.push('Dry matter cannot be above 100%. A dried sample cannot weigh more than it did wet.')
      return 100
    }
    return own
  }

  if (mode === 'mix') {
    const blended = blendDryMatter(c.dm?.mix, warnings)
    if (blended.shareTotal > 0 && Math.abs(blended.shareTotal - 100) > 0.5) {
      warnings.push(
        `Your stand percentages total ${Math.round(blended.shareTotal)}%, not 100%. The blend still works, but check for a row you meant to add.`
      )
    }
    return Math.min(blended.pct, 100)
  }

  // 'stage', the default: the UI resolved the chart cell to a number.
  const fromChart = nonNegative(c.dm?.stagePct, 'Dry matter percent', warnings)
  return Math.min(fromChart, 100)
}

/**
 * Paddock sides for a given area.
 *
 * A square by default, because it is the shape with the least fence for the
 * area and the worksheet leaves both blanks empty. Entering one side solves the
 * other, which is what someone laying out along an existing fence line needs.
 */
export function paddockSides(sqFt, width) {
  const area = finite(sqFt)
  if (area <= 0) return { width: 0, length: 0 }

  const w = num(width)
  if (w > 0) return { width: w, length: safeDiv(area, w) }

  const side = Math.sqrt(area)
  return { width: side, length: side }
}

/* ─────────────────────────── goal requirements ─────────────────────────── */

/** Every input key the selected goals need, shared ones first, deduplicated. */
export function inputsForGoals(goals) {
  const list = Array.isArray(goals) ? goals : []
  const required = new Set(GOAL_INPUTS.shared)
  const optional = new Set()

  for (const g of list) {
    const spec = GOAL_INPUTS[g]
    if (!spec) continue
    for (const k of spec.required) required.add(k)
    for (const k of spec.optional ?? []) optional.add(k)
  }
  // A key required by one goal is required, even if another treats it as
  // optional. Otherwise selecting a second goal could relax the first's needs.
  for (const k of required) optional.delete(k)

  return { required: [...required], optional: [...optional] }
}

/**
 * The checklist, split for display.
 *
 * With one goal there is nothing to section, so everything lands in `shared`.
 * With more, `shared` holds what every selected goal needs and each goal lists
 * only what is left. A key can appear under two goals when both genuinely need
 * it, which is correct and reads naturally.
 */
export function checklistForGoals(goals) {
  const list = (Array.isArray(goals) ? goals : []).filter((g) => GOAL_INPUTS[g])
  if (!list.length) return { shared: [], groups: [] }

  const perGoal = list.map((g) => ({
    goal: g,
    // Deduplicated, so a future edit that lists a key as both required and
    // optional cannot print it twice in the checklist.
    keys: [...new Set([...GOAL_INPUTS[g].required, ...(GOAL_INPUTS[g].optional ?? [])])],
  }))

  if (list.length === 1) {
    return { shared: [...GOAL_INPUTS.shared, ...perGoal[0].keys], groups: [] }
  }

  const inEvery = perGoal[0].keys.filter((k) => perGoal.every((p) => p.keys.includes(k)))
  const shared = [...GOAL_INPUTS.shared, ...inEvery]

  const groups = perGoal
    .map((p) => ({ goal: p.goal, keys: p.keys.filter((k) => !inEvery.includes(k)) }))
    .filter((g) => g.keys.length)

  return { shared, groups }
}

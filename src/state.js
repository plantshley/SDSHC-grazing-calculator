/**
 * The working calculation, its factories, and the pub-sub the UI listens on.
 *
 * Adding an input means touching three places: the markup in ui/*, the factory
 * here, and calc.js. Inputs declare `data-path="demand.animalWeight"` and one
 * delegated listener in main.js writes by path, so a new field needs no new
 * handler, but it does need to exist here and be consumed by the model.
 *
 * Everything is stored as the user typed it, including empty strings. Blank
 * means "not answered yet" and calc.js distinguishes that from an explicit
 * zero. Coercing to 0 on the way in would make an untouched field look like a
 * deliberate zero and quietly halve results.
 */

import { SCHEMA_VERSION, DEFAULT_BODY_WEIGHT_PCT } from './calc.js'
import { dryMatterFor } from './data/forage.js'

let idCounter = 0

export function makeId(prefix) {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

/** The worksheet prints ten blanks. Five is the usual number actually clipped. */
const DEFAULT_SAMPLE_ROWS = 5

export function newCalculation(name = 'My grazing calculation') {
  const now = new Date().toISOString()
  return {
    schemaVersion: SCHEMA_VERSION,
    id: makeId('calc'),
    name,
    pastureName: '',
    createdAt: now,
    updatedAt: now,

    /** Which answers are wanted. Any combination of 'days', 'acres', 'animals'. */
    goals: [],

    /** A forage type id from data/forage.js, or 'mixed'. */
    forageType: '',

    /** Step 1. Sample weights in grams, as typed. */
    samples: Array(DEFAULT_SAMPLE_ROWS).fill(''),

    /**
     * Step 2.
     *
     * "Other frame" with an empty area, not the small hoop. A default preset is
     * a figure the user never entered and never checked, and it silently
     * multiplies every sample weight by 100. Blank means the frame is an
     * outstanding question, which is what answered() in calc.js now reports.
     */
    frame: { key: 'custom', customArea: '' },
    dm: {
      mode: 'stage',
      /** For a single forage type: which stage. */
      stageKey: '',
      /**
       * For the mixed fallback: which cell of the whole chart. Kept separate
       * from `forageType` because picking a chart cell must not silently
       * rewrite the answer given on the landing screen.
       */
      stageTypeId: '',
      ownPct: '',
      mix: [newMixRow(), newMixRow()],
    },

    /** Step 3. */
    usable: { mode: 'lbs', amountLeaving: '', harvestPct: '' },

    /** Step 4. */
    demand: {
      animalWeight: '',
      bodyWeightPct: DEFAULT_BODY_WEIGHT_PCT,
      numAnimals: '',
    },

    /** Step 5. */
    pasture: {
      totalAcres: '',
      ungrazeableAcres: '',
      desiredDays: '',
      paddockWidth: '',
    },
  }
}

/**
 * @param {string} [typeId]  the row of the chart to start on.
 *
 * The mix builder is reached from a screen where a forage type has already been
 * named, so the first row starts on it. It is a default and not a lock: the
 * whole point of the builder is that a stand is more than one type, so every
 * row's select is still free.
 */
export function newMixRow(typeId = '') {
  return { typeId, stageKey: '', share: '' }
}

/* ───────────────────────────── path access ─────────────────────────────── */

export function getPath(obj, path) {
  return String(path)
    .split('.')
    .reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

const isIndex = (k) => /^\d+$/.test(k)

export function setPath(obj, path, value) {
  const keys = String(path).split('.')
  const last = keys.pop()
  let target = obj
  for (const [i, k] of keys.entries()) {
    // The container to create is decided by the NEXT key, not this one, because
    // the next key is what will index into it. 'samples.0' has to make
    // `samples` an ARRAY, and it is the '0' that says so.
    //
    // Testing the current key instead is inverted, and quietly produces
    // {samples: {'0': 42}}. calc.js does `Array.isArray(x) ? x : []`, so a
    // samples object silently reads as zero samples with no warning anywhere.
    if (target[k] == null) target[k] = isIndex(keys[i + 1] ?? last) ? [] : {}
    target = target[k]
  }
  target[last] = value
}

/* ─────────────────────────── the working copy ──────────────────────────── */

let current = newCalculation()
const subscribers = new Set()

export function getCalculation() {
  return current
}

export function setCalculation(calc) {
  current = calc
  notify()
}

export function subscribe(fn) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function notify() {
  current.updatedAt = new Date().toISOString()
  for (const fn of subscribers) fn(current)
}

/* ────────────────────────── resolving for the model ────────────────────── */

/**
 * Fill in the dry matter percentage the chart says, then hand the result to
 * calc.js.
 *
 * The stage lookup lives here rather than in calc.js so that module can stay
 * free of imports and be tested against the paper worksheet on its own. The
 * percentage is resolved at compute time and never stored: storing it would
 * leave a copy of Exhibit 4-2 scattered through every saved calculation, and a
 * correction to the table would not reach records already written.
 */
export function resolved(calc = current) {
  const dm = calc.dm ?? {}
  let stagePct = ''

  // Anything that is not 'own' or 'mix' is the chart, which is the same
  // fallback calc.js resolveDryMatter() applies. The two have to agree: if this
  // one tested `=== 'stage'` while that one treated stage as the default, an
  // unrecognised mode would leave stagePct unset and read as 0% dry matter with
  // no warning.
  if (dm.mode !== 'own' && dm.mode !== 'mix') {
    // For a single forage type the row is the one chosen on the landing screen.
    // For the mixed fallback the user picked a cell, so the row travels with it.
    const typeId = calc.forageType === 'mixed' ? dm.stageTypeId : calc.forageType
    const found = dryMatterFor(typeId, dm.stageKey)
    stagePct = found == null ? '' : found
  }

  const mix = (dm.mix ?? []).map((row) => ({
    ...row,
    pct: dryMatterFor(row.typeId, row.stageKey) ?? '',
  }))

  return { ...calc, dm: { ...dm, stagePct, mix } }
}

/**
 * True once there is enough entered for the results to mean anything.
 *
 * Used to decide whether to show figures or dashes. Deliberately not the same
 * as "valid": a partly filled worksheet still shows every sub-result it can,
 * because watching them appear is how someone checks they are on track.
 */
export function hasSamples(calc = current) {
  return (calc.samples ?? []).some((s) => s !== '' && s != null)
}

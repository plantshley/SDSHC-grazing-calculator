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

import { SCHEMA_VERSION, DEFAULT_BODY_WEIGHT_PCT, DEFAULT_AREA_UNIT } from './calc.js'
import { dryMatterFor } from './data/forage.js'
import { DEFAULT_CALC_TYPE } from './schema.js'
import { makeId } from './ids.js'
import { newCoverCropCalculation } from './state-covercrop.js'

// Lives in its own leaf module so the second calculator's factory can mint an id
// without importing this one. Re-exported so every existing caller is unchanged.
export { makeId }

/** The worksheet prints ten blanks. Five is the usual number actually clipped. */
const DEFAULT_SAMPLE_ROWS = 5

export function newCalculation(name = 'My perennial calculation') {
  const now = new Date().toISOString()
  return {
    schemaVersion: SCHEMA_VERSION,
    /** Which worksheet this record came out of. See schema.js. */
    calcType: 'perennial',
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
     *
     * The unit is what the BOX is in, not what the model works in. A record
     * written before the option existed carries none, and areaUnit() in calc.js
     * reads a missing one as square feet.
     */
    frame: { key: 'custom', customArea: '', areaUnit: DEFAULT_AREA_UNIT },
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

/* ─────────────────────────── the working copies ─────────────────────────── */

/**
 * One working calculation PER calculator, and the one currently on screen.
 *
 * Switching tabs must not destroy the other worksheet's work, so each type keeps
 * its own copy. They are created lazily: somebody who never opens the second
 * calculator never gets a record for it written anywhere.
 *
 * The factory table is here rather than read off the registry in calculators.js
 * because this module has to be able to make either working copy without
 * reaching the UI.
 */
const FACTORIES = {
  perennial: newCalculation,
  covercrop: newCoverCropCalculation,
}

const working = new Map()
let activeType = DEFAULT_CALC_TYPE
const subscribers = new Set()

export function getActiveType() {
  return activeType
}

export function setActiveType(type) {
  if (FACTORIES[type]) activeType = type
  return activeType
}

/** No argument means "the one on screen", which is what every caller wanted. */
export function getCalculation(type = activeType) {
  if (!working.has(type)) working.set(type, (FACTORIES[type] ?? newCalculation)())
  return working.get(type)
}

/**
 * Put a calculation in the slot it BELONGS to, and make that slot the active one.
 *
 * Both halves matter. The type comes off the record because a saved record being
 * opened or borrowed for printing may not be of the type on screen. Making it
 * active is what stops notify() firing about record X while the autosave reads
 * whatever else happens to be on screen — the two must never be different
 * records.
 *
 * printSavedCalc() puts the active type back explicitly afterwards, and has to
 * do it AFTER its own setCalculation() call for exactly this reason.
 */
export function setCalculation(calc, type = calc?.calcType ?? activeType) {
  // DEFAULT_CALC_TYPE, the same answer hydrate() gives, rather than whatever is
  // on screen. Unreachable today — migrate() coerces calcType before a record
  // gets here — but two functions disagreeing about "unknown type" is what bites
  // the first caller that bypasses storage.
  const slot = FACTORIES[type] ? type : DEFAULT_CALC_TYPE
  working.set(slot, calc)
  activeType = slot
  notify(slot)
}

/**
 * Seed a slot without announcing it.
 *
 * Boot restores every calculator's working copy, and setCalculation() would
 * schedule an autosave for each — rewriting what was just read, and for the slot
 * that is not on screen. Restoring is not a change.
 */
export function hydrate(calc, type = calc?.calcType ?? DEFAULT_CALC_TYPE) {
  if (!calc) return
  working.set(FACTORIES[type] ? type : DEFAULT_CALC_TYPE, calc)
}

export function subscribe(fn) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function notify(type = activeType) {
  const calc = getCalculation(type)
  calc.updatedAt = new Date().toISOString()
  for (const fn of subscribers) fn(calc)
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
export function resolved(calc = getCalculation()) {
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
export function hasSamples(calc = getCalculation()) {
  return (calc.samples ?? []).some((s) => s !== '' && s != null)
}

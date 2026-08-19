/**
 * The cover crop calculation's factory and its lookup layer.
 *
 * The same split as state.js and calc.js: the two tables in data/covercrop.js
 * are resolved to plain numbers HERE, at compute time, and never stored. Storing
 * them would leave a copy of the worksheet's constants scattered through every
 * saved record, and a correction — the cool-season base especially — would not
 * reach records already written.
 *
 * Does not import state.js. state.js imports this, for its factory table, and
 * the two importing each other would close a cycle. makeId() lives in ids.js for
 * exactly that reason.
 */

import { SCHEMA_VERSION } from './calc.js'
import { COVER_CROP_BODY_WEIGHT_PCT } from './calc-covercrop.js'
import { seasonById, utilizationForPeriod } from './data/covercrop.js'
import { makeId } from './ids.js'

export function newCoverCropCalculation(name = 'My cover crop calculation') {
  const now = new Date().toISOString()
  return {
    schemaVersion: SCHEMA_VERSION,
    calcType: 'covercrop',
    id: makeId('calc'),
    name,
    pastureName: '',
    createdAt: now,
    updatedAt: now,

    /** Which answers are wanted. Any combination of 'days', 'acres', 'animals'. */
    goals: [],

    /** 'warm' | 'cool' | 'mix', from data/covercrop.js. Blank until answered. */
    season: '',

    /** Step 1. Average height of the stand, in inches, as typed. */
    stand: { height: '' },

    /** Step 2. The residual height to leave behind, in inches. */
    residual: { height: '' },

    /**
     * Step 3.
     *
     * The same shape as the perennial sheet's dry matter control: pick the
     * occupation period off the worksheet's table, or type a percentage of your
     * own. `periodKey` and `ownPct` are kept apart so switching modes to check
     * the other one does not throw away the answer already given.
     */
    utilization: { mode: 'period', periodKey: '', ownPct: '' },

    /** Step 4. The rate arrives filled in and is editable. */
    demand: {
      animalWeight: '',
      bodyWeightPct: COVER_CROP_BODY_WEIGHT_PCT,
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
 * Fill in what the two tables say, then hand the result to calc-covercrop.js.
 *
 * `seasonRates` carries the season's own constants rather than its id, so the
 * model never has to know a season exists — it applies base + perInch × (h −
 * anchor) to whatever it is given, which is also what makes the mix estimate's
 * different shape fall out of the same expression.
 *
 * `periodPct` is resolved even while the user is in 'own' mode, and vice versa.
 * Both are cheap, and resolving only the active one would make switching modes
 * show a dash for a beat until the next keystroke.
 */
export function resolvedCoverCrop(calc = {}) {
  const season = seasonById(calc.season)
  const utilization = calc.utilization ?? {}

  return {
    ...calc,
    seasonRates: season
      ? { base: season.base, anchor: season.anchor, perInch: season.perInch }
      : null,
    utilization: {
      ...utilization,
      periodPct: utilizationForPeriod(utilization.periodKey) ?? '',
    },
  }
}

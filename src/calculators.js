/**
 * One registry, parallel calculators.
 *
 * Each worksheet is a DESCRIPTOR: its own model, its own step renderers, its own
 * handlers, its own CSV rows. main.js's machinery — the stepper, warnedSteps,
 * markPassed, mayLeaveStep, the autosave, the Saved tab, the drag — stays generic
 * and reads whichever descriptor is active. Adding a worksheet is adding a row
 * here and the modules it names.
 *
 * DO NOT parameterise compute() into one model with branches. That was the
 * alternative and it is the thing this shape was chosen over: the two worksheets
 * share their last three steps and share nothing at all in their first two, so a
 * merged model is a function whose every line is behind an `if`. What they really
 * share is the ARITHMETIC, and that is already shared — demand(), daysFrom(),
 * acresFrom() and animalsFrom() are exported on their own from calc.js for
 * exactly this.
 *
 * This module reaches the whole UI, so nothing that must not is allowed to reach
 * it: storage.js and export.js both stay out (storage promises never to throw and
 * export is imported BY main.js, not the other way round). What storage needs to
 * know about a record's shape lives in schema.js instead.
 *
 * @typedef {object} Ctx  what a handler is given
 * @property {() => void} render     main.js owns the page; a descriptor asks
 * @property {() => void} closeModal
 * @property {HTMLElement} root      the #app element, for in-place DOM updates
 */

import { compute, GOALS, INPUT_LABELS, STEP_INPUTS } from './calc.js'
import { newCalculation, resolved, getActiveType } from './state.js'
import { DEFAULT_CALC_TYPE } from './schema.js'
import { renderSetup, renderChips } from './ui/setup.js'
import { renderSteps, STEP_LABELS } from './ui/steps.js'
import { renderResults } from './ui/results.js'
import * as perennialActions from './ui/actions-perennial.js'
import { csvRowsFor, imageLinesFor, forageLabel } from './report-perennial.js'

import * as ccModel from './calc-covercrop.js'
import { newCoverCropCalculation, resolvedCoverCrop } from './state-covercrop.js'
import { renderSetup as ccSetup, renderChips as ccChips } from './ui/setup-covercrop.js'
import { renderSteps as ccSteps, STEP_LABELS as CC_STEP_LABELS } from './ui/steps-covercrop.js'
import * as ccActions from './ui/actions-covercrop.js'
import * as ccReport from './report-covercrop.js'

const PERENNIAL = {
  id: 'perennial',
  tabLabel: 'Perennial grazing',
  /**
   * The path segment that names this worksheet in the address bar.
   *
   * Separate from `id` because `id` is a storage key on every record ever
   * written and a URL is read by people: 'covercrop' is the key, '/cover-crop'
   * is the link. Changing a slug breaks a link somebody bookmarked; changing an
   * id breaks every saved calculation. They are allowed to differ and must not
   * be collapsed into one.
   */
  slug: 'perennial',
  /** For a saved card's badge and anywhere the two have to be told apart. */
  shortName: 'Perennial',
  /** What the chooser says about it, in terms of what you take to the field. */
  newCalcBlurb:
    'Native range and tame pasture, from clipped forage samples weighed on a gram scale.',

  /** The stem an unnamed calculation's downloaded file falls back to. */
  fileStem: 'perennial-calculation',

  newCalculation,
  resolved,
  compute,

  stepLabels: STEP_LABELS,
  stepFields: perennialActions.STEP_FIELDS,
  stepInputs: STEP_INPUTS,
  inputLabels: INPUT_LABELS,
  goals: GOALS,

  started: perennialActions.started,
  setupAnswered: perennialActions.setupAnswered,

  renderSetup,
  renderChips,
  renderSteps,
  renderResults,

  handleAction: perennialActions.handleAction,
  handleChange: perennialActions.handleChange,
  handleInput: perennialActions.handleInput,
  afterClearStep: perennialActions.afterClearStep,

  csv: csvRowsFor,
  image: imageLinesFor,

  /** The bits of a saved card's meta line that only this worksheet knows. */
  savedMeta: (calc) => [forageLabel(calc)],
}

const COVERCROP = {
  id: 'covercrop',
  tabLabel: 'Cover crop grazing',
  slug: 'cover-crop',
  shortName: 'Cover crop',
  newCalcBlurb:
    'Annual cover crops, from the average height of the stand measured with a yardstick.',

  fileStem: 'cover-crop-calculation',

  newCalculation: newCoverCropCalculation,
  resolved: resolvedCoverCrop,
  compute: ccModel.computeCoverCrop,

  stepLabels: CC_STEP_LABELS,
  stepFields: ccActions.STEP_FIELDS,
  stepInputs: ccModel.STEP_INPUTS,
  inputLabels: ccModel.INPUT_LABELS,
  goals: ccModel.GOALS,

  started: ccActions.started,
  setupAnswered: ccActions.setupAnswered,

  renderSetup: ccSetup,
  renderChips: ccChips,
  renderSteps: ccSteps,
  // The SAME result cards. Both worksheets answer the same three questions from
  // the same figures — grazingDays, acresPerDay, animalsAllowed, and the support
  // readouts under them are all in both models' output — so a second copy would
  // be a second thing to keep in step for no difference on screen.
  renderResults,

  handleAction: ccActions.handleAction,
  handleChange: ccActions.handleChange,

  csv: ccReport.csvRowsFor,
  image: ccReport.imageLinesFor,

  savedMeta: (calc) => [ccReport.seasonLabel(calc)],
}

export const CALCULATORS = [PERENNIAL, COVERCROP]

const BY_ID = new Map(CALCULATORS.map((d) => [d.id, d]))

/** Falls back rather than returning nothing — a caller renders off this. */
export function calculatorById(id) {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_CALC_TYPE)
}

/**
 * The descriptor for a RECORD.
 *
 * The default is load-bearing: every record written before `calcType` existed
 * has none, and they are all perennial ones. Without it, opening, exporting or
 * printing an old record would render nothing.
 */
export function calculatorFor(calc) {
  return calculatorById(calc?.calcType ?? DEFAULT_CALC_TYPE)
}

/** The one on screen. The Saved tab does not change it — see main.js's boot. */
export function activeCalculator() {
  return calculatorById(getActiveType())
}

/** Resolve the lookups, then run that worksheet's model. */
export function computeRecord(calc) {
  const desc = calculatorFor(calc)
  return desc.compute(desc.resolved(calc))
}

/**
 * Result cards, the running totals bar, and the output refresh.
 *
 * The split here is the important part. renderResults() produces markup whose
 * SHAPE depends only on which goals are selected, so it is built once per full
 * render. updateOutputs() writes the numbers into [data-out] placeholders and
 * is called on every keystroke.
 *
 * Doing it the other way round, re-rendering the cards to update a figure,
 * would tear the focus out of the paddock width box on every character typed.
 */

import { esc, FORMATTERS } from './format.js'
import { numField, readout, infoButton } from './fields.js'
import { INPUT_LABELS } from '../calc.js'

const GOAL_CARDS = {
  days: {
    title: 'Grazing days',
    key: 'grazingDays',
    fmt: 'days',
    info: 'grazingDays',
    unit: 'days at your current herd size',
  },
  acres: {
    title: 'Acres needed per day',
    key: 'acresPerDay',
    fmt: 'acres',
    info: 'acresNeeded',
    unit: 'per day for your herd',
  },
  animals: {
    title: 'Animals allowed',
    key: 'animalsAllowed',
    fmt: 'head',
    info: 'animalsAllowed',
    unit: 'for the days you entered',
  },
}

export function renderResults(calc) {
  const goals = (calc.goals ?? []).filter((g) => GOAL_CARDS[g])
  if (!goals.length) return '<p class="hint">Choose an answer on the setup screen.</p>'

  return `
    ${goals.map((g) => card(g, calc)).join('')}
    ${goals.includes('days') && goals.includes('animals') ? reconcile() : ''}`
}

function card(goal, calc) {
  const spec = GOAL_CARDS[goal]
  return `
    <div class="box result-card">
      <div class="step-head">
        <span class="title">${esc(spec.title)}</span>
        ${infoButton(spec.info, spec.title)}
      </div>

      <div class="kpi">
        <div class="kpi-value" data-out="${esc(spec.key)}" data-fmt="${esc(spec.fmt)}">&mdash;</div>
        <div class="kpi-label">${esc(spec.unit)}</div>
      </div>

      <p class="result-missing" data-missing="${esc(goal)}" hidden></p>
      ${support(goal, calc)}
      <p class="result-formula" data-formula="${esc(goal)}"></p>
    </div>`
}

function support(goal, calc) {
  if (goal === 'days') {
    return `
      <div class="results">
        ${readout('Total usable forage', 'totalUsableForage', { fmt: 'lbs' })}
        ${readout('The herd eats', 'herdDemand', { fmt: 'lbsPerDay' })}
        ${readout('Animal-days in the pasture', 'animalDays', { fmt: 'number', info: 'animalDay' })}
      </div>`
  }

  if (goal === 'acres') {
    return `
      <div class="results">
        ${readout('Square feet per day', 'sqFtPerDay', { fmt: 'sqft' })}
        ${readout('Acres for your planned days', 'acresForDesiredDays', { fmt: 'acres' })}
      </div>
      <p class="sub-title">Paddock shape ${infoButton('paddock', 'Paddock')}</p>
      <p class="hint">A square uses the least fence. Enter one side and the other is
        worked out for you, which is what you want when you are running off an
        existing fence line.</p>
      <div class="row-2">
        ${numField({
          label: 'One side',
          path: 'pasture.paddockWidth',
          value: calc.pasture?.paddockWidth,
          suffix: 'ft',
          placeholder: 'Leave blank for a square',
          step: '1',
        })}
        ${readout('The other side', 'paddockLength', { fmt: 'feet' })}
      </div>`
  }

  return `
    <div class="results">
      ${readout('Total usable forage', 'totalUsableForage', { fmt: 'lbs' })}
      ${readout('Each animal eats', 'perAnimalDemand', { fmt: 'lbsPerDay' })}
      ${readout('For this many days', 'desiredDays', { fmt: 'number' })}
    </div>`
}

/**
 * Both answers at once describe different scenarios, and side by side they can
 * look like a disagreement. One sentence settles it.
 */
function reconcile() {
  return `<p class="reconcile" data-reconcile></p>`
}

/* ──────────────────────── the running totals bar ───────────────────────── */

export function renderStickyBar(showAll) {
  return `
    <div class="sticky-bar">
      <div class="sticky-figs">
        <span><small>Available</small><b data-out="availableForage" data-fmt="lbsPerAcre">&mdash;</b></span>
        <span><small>Usable</small><b data-out="usableForage" data-fmt="lbsPerAcre">&mdash;</b></span>
        <span data-headline-wrap hidden>
          <small data-headline-label></small>
          <b data-headline class="pos">&mdash;</b>
        </span>
      </div>
      <div class="sticky-actions">
        <button type="button" class="tip" data-action="toggle-show-all">
          ${showAll ? 'One step at a time' : 'Show all steps'}
        </button>
        <button type="button" class="btn-main" data-action="save-calc">
          Save<span class="btn-word"> calculation</span>
        </button>
      </div>
    </div>`
}

/* ────────────────────────────── refreshing ─────────────────────────────── */

/**
 * Write every computed figure into the page.
 *
 * Called on every input. Touches only text, never structure, so nothing the
 * user is typing into can be replaced underneath them.
 */
export function updateOutputs(res, root = document) {
  for (const el of root.querySelectorAll('[data-out]')) {
    const key = el.dataset.out
    const fmt = FORMATTERS[el.dataset.fmt] ?? FORMATTERS.number
    const value = res[key]
    el.textContent = value === undefined || value === null ? '—' : fmt(value)
  }

  // An answer is withheld until everything it needs is entered, so the card has
  // to say what is still outstanding. A bare dash reads as a broken calculator.
  for (const el of root.querySelectorAll('[data-missing]')) {
    const outstanding = res.missing?.[el.dataset.missing] ?? []
    el.hidden = !outstanding.length
    if (outstanding.length) {
      el.textContent = `Still needed: ${outstanding
        .map((k) => (INPUT_LABELS[k] ?? k).toLowerCase())
        .join(', ')}.`
    }
  }

  for (const el of root.querySelectorAll('[data-formula]')) {
    // The formula describes a calculation that has not happened yet, so it is
    // hidden alongside the answer rather than printing a row of zeroes.
    const outstanding = res.missing?.[el.dataset.formula] ?? []
    el.hidden = outstanding.length > 0
    el.textContent = outstanding.length ? '' : formulaFor(el.dataset.formula, res)
  }

  const spread = root.querySelector('[data-spread-note]')
  if (spread) {
    // Only worth saying once there are enough samples for a spread to mean
    // something, and only when it is wide enough to be worth another ten
    // minutes in the pasture.
    const wide = res.sampleCount >= 2 && res.sampleSpread > 0.6
    spread.hidden = !wide
    if (wide) {
      spread.textContent = `Your samples range from ${FORMATTERS.grams(
        res.sampleMin
      )} to ${FORMATTERS.grams(res.sampleMax)}. That is a wide spread for ${
        res.sampleCount
      } samples, so the average is resting on very little. Clipping a few more spots is the cheapest accuracy in this worksheet.`
    }
  }

  const recon = root.querySelector('[data-reconcile]')
  if (recon) {
    // Only worth saying once BOTH answers exist. Half of it, with the other
    // half showing a dash, is more confusing than the confusion it settles.
    const both = res.animalsAllowed != null && res.grazingDays != null
    recon.hidden = !both
    if (both) {
      recon.textContent = `You entered ${FORMATTERS.head(
        res.numAnimals
      )}. This pasture supports ${FORMATTERS.head(res.animalsAllowed)} for ${FORMATTERS.days(
        res.desiredDays
      )}, or your ${FORMATTERS.head(res.numAnimals)} for ${FORMATTERS.days(res.grazingDays)}.`
    }
  }

  const warn = root.querySelector('[data-warnings]')
  if (warn) {
    warn.innerHTML = res.warnings?.length
      ? `<ul class="warn-list">${res.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`
      : ''
  }

  updateHeadline(res, root)
}

/** The single most relevant figure, pinned in the bar at the bottom. */
function updateHeadline(res, root) {
  const wrap = root.querySelector('[data-headline-wrap]')
  if (!wrap) return

  const goal = ['days', 'acres', 'animals'].find((g) => res.goals?.includes(g))
  const spec = goal && GOAL_CARDS[goal]
  const value = spec ? res[spec.key] : 0

  wrap.hidden = !spec || !value
  if (wrap.hidden) return

  root.querySelector('[data-headline-label]').textContent = spec.title
  root.querySelector('[data-headline]').textContent = FORMATTERS[spec.fmt](value)
}

/**
 * The calculation written out in words.
 *
 * Not decoration. Someone checking this screen against the paper worksheet
 * needs to see which numbers were multiplied by which, and someone who gets an
 * answer they did not expect needs to see where it came from.
 */
function formulaFor(goal, res) {
  const n = FORMATTERS.number
  const d = FORMATTERS.decimal

  if (goal === 'days') {
    return `${n(res.totalUsableForage)} lbs of usable forage divided by ${d(
      res.herdDemand
    )} lbs eaten per day by ${FORMATTERS.head(res.numAnimals)}.`
  }
  if (goal === 'acres') {
    return `${d(res.herdDemand)} lbs needed per day divided by ${n(
      res.usableForage
    )} lbs of usable forage per acre.`
  }
  if (goal === 'animals') {
    return `${n(res.totalUsableForage)} lbs of usable forage divided by ${d(
      res.perAnimalDemand
    )} lbs per animal per day, divided by ${d(res.desiredDays)} days.`
  }
  return ''
}

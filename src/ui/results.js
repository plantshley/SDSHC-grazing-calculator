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
import { readout, infoButton } from './fields.js'
import { INPUT_LABELS } from '../calc.js'

/** `short` is the running bar's caption, where a card title does not fit. */
const GOAL_CARDS = {
  days: {
    title: 'Grazing days',
    short: 'Days',
    key: 'grazingDays',
    fmt: 'days',
    info: 'grazingDays',
    unit: 'days at your current herd size',
  },
  acres: {
    title: 'Acres needed per day',
    short: 'Acres/day',
    key: 'acresPerDay',
    fmt: 'acres',
    info: 'acresNeeded',
    unit: 'per day for your herd',
  },
  animals: {
    title: 'Animals allowed',
    short: 'Animals',
    key: 'animalsAllowed',
    fmt: 'head',
    info: 'animalsAllowed',
    unit: 'for the days you entered',
  },
}

/**
 * One card per goal, side by side.
 *
 * With several goals the cards are equal columns, so the answers are compared
 * rather than scrolled through. With one there is nothing to compare, so the
 * card splits instead: the figure on the left at full size, the numbers it was
 * built from on the right, which is the layout that reads at arm's length.
 */
export function renderResults(calc) {
  const goals = (calc.goals ?? []).filter((g) => GOAL_CARDS[g])
  if (!goals.length) return '<p class="hint">Choose an answer on the setup screen.</p>'

  const solo = goals.length === 1

  return `
    <div class="result-row${solo ? ' result-row--solo' : ''}">
      ${goals.map((g) => card(g)).join('')}
    </div>
    ${goals.includes('days') && goals.includes('animals') ? reconcile() : ''}`
}

function card(goal) {
  const spec = GOAL_CARDS[goal]
  return `
    <div class="box result-card">
      <div class="step-head">
        <span class="title">${esc(spec.title)}</span>
        ${infoButton(spec.info, spec.title)}
      </div>

      <div class="result-split">
        <div class="result-main">
          <div class="kpi">
            <div class="kpi-value" data-out="${esc(spec.key)}" data-fmt="${esc(
              spec.fmt
            )}">&mdash;</div>
            <div class="kpi-label">${esc(spec.unit)}</div>
          </div>
        </div>
        <div class="result-aside">
          ${support(goal)}
          <p class="result-formula" data-formula="${esc(goal)}"></p>
        </div>
      </div>

      <p class="result-missing" data-missing="${esc(goal)}" hidden></p>
    </div>`
}

function support(goal) {
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

/**
 * @param {boolean} showAll
 * @param {object} calc
 * @param {boolean} saved  this calculation is already in the saved list, so the
 *   button edits that record rather than offering to create one.
 */
export function renderStickyBar(showAll, calc, saved = false) {
  const goals = (calc?.goals ?? []).filter((g) => GOAL_CARDS[g])

  return `
    <div class="sticky-bar">
      <div class="sticky-figs">
        <span><small>Available</small><b data-out="availableForage" data-fmt="lbsPerAcre">&mdash;</b></span>
        <span><small>Usable</small><b data-out="usableForage" data-fmt="lbsPerAcre">&mdash;</b></span>
        ${
          // Every selected goal, not just the first. Two answers were chosen
          // because both are wanted; showing one of them in the running bar
          // reads as the other having failed to compute.
          goals
            .map(
              (g) => `<span class="sticky-goal" data-headline-wrap="${esc(g)}" hidden>
                <small>${esc(GOAL_CARDS[g].short)}</small>
                <b class="pos" data-headline="${esc(g)}" data-fmt="${esc(
                  GOAL_CARDS[g].fmt
                )}">&mdash;</b>
              </span>`
            )
            .join('')
        }
      </div>
      <div class="sticky-actions">
        <!-- Both of these act on the whole worksheet, so they stack together
             here rather than sitting up in the chip row beside Change, which
             only reopens the setup screen. Clear empties the boxes and keeps the
             two setup answers; starting over completely is "+ New calculation"
             up in the chip row. -->
        <div class="sticky-links">
          <button type="button" class="tip" data-action="toggle-show-all">
            ${showAll ? 'One step at a time' : 'Show all steps'}
          </button>
          <button type="button" class="tip danger" data-action="clear-all">Clear</button>
        </div>
        <button type="button" class="btn-main" data-action="save-calc">
          ${
            // Still a save. The dialog it opens is the same one, and pressing
            // it writes the figures as they now stand: an "edit" that only
            // renamed the record would quietly leave the numbers behind.
            saved ? 'Edit<span class="btn-word"> saved</span>' : 'Save<span class="btn-word"> calculation</span>'
          }
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

/** The answers so far, pinned in the bar at the bottom. */
function updateHeadline(res, root) {
  for (const wrap of root.querySelectorAll('[data-headline-wrap]')) {
    const goal = wrap.dataset.headlineWrap
    const spec = GOAL_CARDS[goal]
    const value = spec ? res[spec.key] : null

    // Hidden until there IS an answer. A dash in the running bar says nothing
    // the result card does not already say better, and it costs width the two
    // figures beside it need on a phone.
    wrap.hidden = !spec || value == null
    if (wrap.hidden) continue
    wrap.querySelector('[data-headline]').textContent = FORMATTERS[spec.fmt](value)
  }
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

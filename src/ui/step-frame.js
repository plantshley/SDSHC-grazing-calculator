/**
 * The frame every step section is drawn in, whichever worksheet it belongs to.
 *
 * Extracted so the two calculators cannot drift apart. A great deal keys off
 * this exact markup and NONE of it fails loudly when it is missing:
 *
 *   - updateOutputs() writes into `[data-out]`, `[data-warnings]`,
 *     `[data-step-missing]` and `[data-step-pill]`, and gates the last two on
 *     `data-warned` on `.step`
 *   - every step carries a `[data-warnings]` box, filled from
 *     `warningsByStep[i]`: a warning belongs beside the field that caused it,
 *     not in a list at the end naming a step you have already left
 *   - main.js's collapse handler looks for `.step--collapsible` and
 *     `.step-body[hidden]`
 *   - workTarget() finds the work by `.step-body` not being hidden
 *   - the `@media print` block in app.css forces `.step[hidden]` and
 *     `.step-body[hidden]` back open
 *
 * A second worksheet that wrote its own nearly-identical markup would get a
 * silent half of that: no scroll on a phone, no shortfall count, and steps
 * missing from a printout, with nothing throwing and no test naturally failing.
 * So the frame is one function and a worksheet supplies only its content.
 */

import { esc } from './format.js'
import { sectionInfo, infoButton, numField, readout } from './fields.js'
import { isStepOpen } from '../prefs.js'

/**
 * @param {object} o
 * @param {string} o.calcType   whose `openSteps` decides what is unfolded
 * @param {Array<Function>} o.bodies   one renderer per step, (calc, showAll) => html
 * @param {Array<[string, string[]|null]>} o.heads   [title, info keys] per step
 * @param {object} o.calc
 * @param {number} o.step       the wizard's current step
 * @param {boolean} o.showAll
 * @param {Set<number>} o.warned  steps gone past with something outstanding.
 *   `data-warned` on the section is what carries it, so main.js can add a step
 *   mid-keystroke without a render and updateOutputs() still reads the truth.
 */
export function renderStepSections({ calcType, bodies, heads, calc, step, showAll, warned = new Set() }) {
  const last = bodies.length - 1
  return `
    <div class="steps">
      ${bodies
        .map((fn, i) => {
          const [title, infoKeys] = heads[i]
          // Which sections are unfolded is per worksheet: opening step 2 here
          // has nothing to say about the other calculator's step 2.
          const open = showAll ? isStepOpen(calcType, i) : i === step
          return `<section class="box step${showAll ? ' step--collapsible' : ''}"
            data-step="${i}"${warned.has(i) ? ' data-warned' : ''}${
            showAll || i === step ? '' : ' hidden'
          }>
            ${head(i, last, title, infoKeys, showAll, open)}
            <div class="step-body"${showAll && !open ? ' hidden' : ''}>
              ${fn(calc, showAll)}
              <div data-warnings></div>
              ${stepMissing(i, last)}
              ${showAll ? '' : nav(i, last)}
            </div>
          </section>`
        })
        .join('')}
    </div>`
}

/**
 * The `?` is a SIBLING of the toggle, never inside it. Nesting one button in
 * another is invalid, and it would mean opening a definition also collapsed the
 * step it was explaining.
 *
 * The caret is at the LEFT end of the toggle rather than the right. Turning the
 * toggle on must not move the `?`: it explains the step title, it sits beside
 * the step title in the wizard, and pushing it out past a caret on the far right
 * makes it read as belonging to the caret instead.
 *
 * Clear is pinned to the far end of the row, in both modes. It empties THIS
 * step and nothing else, which is why it lives on the step's own head rather
 * than in the sticky bar: a control that empties whatever is on screen is one
 * that has to be read carefully every time, and this one names its scope by
 * where it sits.
 *
 * The pill goes AFTER the `?`, not inside the toggle beside the title. Inside,
 * it would sit between the title and the `?` and push the `?` along, which is
 * the same drift the toggle's `flex: 0 1 auto` exists to prevent. The toggle
 * points at it with aria-describedby instead, so a screen reader gets the count
 * with the button rather than only in passing.
 */
function head(i, last, title, infoKeys, collapsible, open) {
  const label = `<span class="step-n">Step ${i + 1}</span>
    <span class="title">${esc(title)}</span>`

  const clear = `<button type="button" class="tip danger step-clear" data-action="clear-step"
    data-step="${i}">Clear</button>`

  if (!collapsible) {
    return `<div class="step-head">${label}${
      infoKeys ? sectionInfo(infoKeys, title) : ''
    }${clear}</div>`
  }

  // The results step collects nothing, so it can never owe anything.
  const pill =
    i === last ? '' : `<span class="step-pill" id="stepPill${i}" data-step-pill="${i}" hidden></span>`

  // The warning count is on EVERY step, the last one included: step 5 asks for
  // the acres, so it can raise a warning even though it can never owe an answer.
  // Same class, so the two counts are one kind of thing and the phone rules that
  // key off `.step-pill` cover both without being told.
  const warnPill = `<span class="step-pill" id="stepWarn${i}" data-step-warn-pill="${i}" hidden></span>`

  const describedBy = [pill ? `stepPill${i}` : '', `stepWarn${i}`].filter(Boolean).join(' ')

  return `
    <div class="step-head step-head--toggle">
      <button type="button" class="step-toggle" data-action="toggle-step" data-step="${i}"
        aria-expanded="${open}" aria-describedby="${describedBy}">
        <span class="step-chev" aria-hidden="true"></span>
        ${label}
      </button>
      ${infoKeys ? sectionInfo(infoKeys, title) : ''}
      ${pill}
      ${warnPill}
      ${clear}
    </div>`
}

/**
 * What this step still owes, named on the step that asks for it.
 *
 * Shown only for a step the user has already gone past with something
 * outstanding. A step is blank when you arrive on it, so a note saying it is
 * unfinished is telling you what you can already see; said on arrival every
 * time, it is noise, and noise is what people learn to read past.
 *
 * The placeholder is in the page from the start and updateOutputs() decides
 * whether it says anything, off `data-warned` on the section — the same rule as
 * every figure, and for the same reason. It used to be gated here, at render
 * time, which was fine while pressing Next was the only way to go past a step:
 * that presses a button, and a button renders. Under "Show all steps" there is
 * no Next, so a step is gone past by typing in a later one, and a keystroke must
 * not re-render the field being typed into.
 *
 * The last step never has one. The result cards name their own outstanding
 * inputs, and a second note above them saying the same thing reads as two
 * problems.
 */
function stepMissing(i, last) {
  if (i === last) return ''
  return `<p class="step-missing" data-step-missing="${i}" hidden></p>`
}

/* Back and Next are the same control at the same size: same height, same font,
   same min-width, so the pair reads as one thing you move along rather than a
   button and a link. Back is outlined rather than filled, because --sky is the
   one loud button on a screen and Next is the one you are meant to press. */
function nav(i, last) {
  const back =
    i > 0
      ? '<button type="button" class="btn-step btn-step--back" data-action="prev-step">Back</button>'
      : ''

  // The last step has nowhere further forward, so the right-hand end of the row
  // carries the way OUT instead: to the list this calculation can be kept in.
  // It is a .btn-step like Back, so the pair are the same size at both ends and
  // the three export links sit centred between them.
  if (i === last) {
    return `
      <div class="step-nav step-nav--results">
        ${back}
        ${exportRow()}
        <!-- Not set-tab. A calculation that is not in the list yet is written to
             it on the way, so pressing the button that says "to saved" does not
             land on a list this calculation is missing from. -->
        <button type="button" class="btn-step btn-step--back" data-action="go-saved">
          To Saved
        </button>
      </div>`
  }

  return `
    <div class="step-nav">
      ${back}
      <div class="spacer"></div>
      <button type="button" class="btn-step btn-step--next" data-action="next-step">Next</button>
    </div>`
}

/**
 * The row that leads off the setup screen and into the worksheet.
 *
 * Shared by both setup renderers rather than written twice: it is the same
 * control saying the same thing, and the only difference between the two copies
 * was the sentence naming what is still unanswered.
 *
 * The warning takes the place of the spacer rather than sitting under the
 * button, so it reads as the caption to it.
 *
 * The name of the calculation being returned to goes in the button WHOLE. It is
 * the whole reason the button says more than "Return", and half a name with an
 * ellipsis after it identifies a calculation no better than none does — so
 * nothing caps it and .btn-name holds it on one line. The copy underneath is
 * for the phone: below 620px `.btn-word` is hidden, the button reads
 * "Return ->", and that line is the only place the name is left.
 *
 * @param {object} o
 * @param {boolean} o.ready      both setup questions answered
 * @param {string} o.warn        what is still outstanding, when they are not
 * @param {boolean} o.returning  the steps have been opened at least once
 * @param {string} o.name        the saved calculation's name, or ''
 */
export function startNav({ ready, warn, returning, name }) {
  const label = returning
    ? `Return<span class="btn-word"> to ${
        name ? `<span class="btn-name">${esc(name)}</span>` : 'calculation'
      }</span> &rarr;`
    : 'Start<span class="btn-word"> calculating</span> &rarr;'

  return `
    <div class="step-nav step-nav--start">
      ${ready ? '<div class="spacer"></div>' : `<p class="start-warn">${esc(warn)}</p>`}
      <button type="button" class="btn-main" data-action="start" ${ready ? '' : 'disabled'}>
        ${label}
      </button>
      ${name ? `<p class="start-return-name">(${esc(name)})</p>` : ''}
    </div>`
}

/**
 * The three ways off the last step, as text links rather than buttons.
 *
 * None of them changes a figure, so none of them is the one thing to press on
 * this screen. Ordered the way they are asked for: the image first, because
 * that is the one that gets sent to somebody.
 *
 * Exported as well as used here: under "Show all steps" there is no step nav to
 * carry it, so the results step renders its own copy inside its body.
 */
export function exportRow() {
  return `
    <div class="export-links">
      <button type="button" class="tip" data-action="export-png">Save as image</button>
      <button type="button" class="tip" data-action="export-csv">Export CSV</button>
      <button type="button" class="tip" data-action="print">Print or save as PDF</button>
    </div>`
}

/**
 * How much ground one day's grazing actually is, in fence.
 *
 * The acres-per-day figure above is the answer; this turns it into the two
 * numbers someone stands in a pasture with. A square uses the least fence for a
 * given area, so that is the default. Entering the side you already have, an
 * existing fence line, solves the other one.
 *
 * Shared by both worksheets. Acres per day is acres per day whether the forage
 * was clipped through a hoop or measured with a yardstick, and the cover crop
 * sheet leans on it harder: shortening the occupation period is how utilization
 * is raised, and fencing a smaller piece is how the period is shortened.
 */
export function paddockShape(calc) {
  return `
    <p class="sub-title">Paddock size for one day ${infoButton('paddock', 'Paddock')}</p>
    <p class="hint">The acres your herd needs each day, laid out as fence. If
      you are running off an existing fence line, enter the side you already have
      and the other one is calculated. If left blank, it is drawn as a square.</p>

    <div class="paddock-row">
      ${numField({
        label: 'One side',
        path: 'pasture.paddockWidth',
        value: calc.pasture?.paddockWidth,
        suffix: 'ft',
        placeholder: 'Leave blank for a square',
        step: '1',
      })}
      <span class="paddock-x" aria-hidden="true">&times;</span>
      <div class="paddock-out">
        <span class="paddock-out-label">The other side</span>
        <span class="paddock-out-value" data-out="paddockLength" data-fmt="feet">&mdash;</span>
      </div>
    </div>
    <div class="results">
      ${readout('Ground needed per day', 'sqFtPerDay', { fmt: 'sqft' })}
    </div>`
}

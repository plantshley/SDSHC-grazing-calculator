/**
 * The five steps of the Grazing Cover Crops worksheet.
 *
 * Five, mirroring the perennial sheet, rather than the four the arithmetic would
 * fit into. Height and residual could share a step — they are the same formula
 * applied twice — but they are two different judgements made standing in two
 * different places: how tall the stand IS, and how much of it you mean to leave.
 * Putting them together also makes step 1 the only step on either worksheet that
 * asks the same question twice.
 *
 * Every section is drawn by renderStepSections() in step-frame.js. That is not
 * tidiness: `updateOutputs`, the collapse handler, `workTarget()` and the print
 * block all key off exact class and attribute names, and none of them fails
 * loudly when they are missing. Writing the frame again here would get a silent
 * half of it.
 */

import { esc } from './format.js'
import { numField, countField, modePill, readout, infoButton } from './fields.js'
import { renderStepSections, exportRow, paddockShape } from './step-frame.js'
import { UTILIZATION_PERIODS, seasonById } from '../data/covercrop.js'

export const STEP_LABELS = [
  'Measure height',
  'Residual left',
  'Usable forage',
  'Daily demand',
  'Results',
]

const STEP_HEADS = [
  ['Measure the stand and estimate production', ['ccHeight', 'ccTotalProduction']],
  ['Take off the residual you will leave', ['ccResidual', 'ccAvailableForage']],
  ['Work out the usable forage', ['ccUtilization', 'usableForage']],
  ['Work out the daily forage demand', ['bodyWeightPct', 'perAnimalDemand', 'herdDemand']],
  ['Your results', null],
]

export function renderSteps(calc, step, showAll, warned = new Set()) {
  return renderStepSections({
    calcType: 'covercrop',
    bodies: [step1, step2, step3, step4, step5],
    heads: STEP_HEADS,
    calc,
    step,
    showAll,
    warned,
  })
}

/* ─────────────────────────────── step 1 ────────────────────────────────── */

/**
 * The estimate in the season's own words, so the figure on screen can be checked
 * against the paper without doing the arithmetic twice.
 *
 * Rendered from the season's constants rather than written out three times: the
 * table in data/covercrop.js is the only copy, and a sentence with 1,140 typed
 * into it here would be a second one that a correction could not reach.
 */
function estimateLine(calc) {
  const season = seasonById(calc.season)
  if (!season) return ''

  const sentence = season.anchor
    ? `${season.base.toLocaleString()} lbs/ac for the first ${season.anchor} inches,
       then ${season.perInch} lbs/ac for every inch above that.`
    : `${season.perInch} lbs/ac for every inch of height, with no separate figure
       for the first few inches.`

  return `<p class="hint">${esc(season.label)}: ${esc(sentence.replace(/\s+/g, ' ').trim())}</p>`
}

function step1(calc) {
  return `
    <p class="hint">Measure the standing growth in several places across the field
      and use the average. Do not measure just the tallest seed heads, and do not skip
      the thin spots.</p>

    ${estimateLine(calc)}

    <div class="field-row">
      ${numField({
        label: 'Average height of the stand',
        path: 'stand.height',
        value: calc.stand?.height,
        suffix: 'in',
        info: 'ccHeight',
        step: '0.5',
      })}
    </div>

    <div class="results">
      ${readout('Total air-dry production', 'totalProduction', {
        fmt: 'lbsPerAcre',
        info: 'ccTotalProduction',
        strong: true,
      })}
    </div>`
}

/* ─────────────────────────────── step 2 ────────────────────────────────── */

function step2(calc) {
  return `
    <p class="hint">Set the height you plan to leave standing. The same production
      estimate is applied to that height, and the difference between the two is the
      forage available to graze.</p>

    ${estimateLine(calc)}

    <div class="field-row">
      ${numField({
        label: 'Minimum residual height to leave',
        path: 'residual.height',
        value: calc.residual?.height,
        suffix: 'in',
        info: 'ccResidual',
        step: '0.5',
        hint: '4 inches is the usual starting point.',
      })}
    </div>

    <div class="results">
      ${readout('Residual air-dry production', 'residualProduction', { fmt: 'lbsPerAcre' })}
      ${readout('Available forage', 'availableForage', {
        fmt: 'lbsPerAcre',
        info: 'ccAvailableForage',
        strong: true,
      })}
    </div>`
}

/* ─────────────────────────────── step 3 ────────────────────────────────── */

/**
 * Utilization: pick the occupation period, or type a percent.
 *
 * The same control the perennial sheet's dry matter uses, and for the same
 * reason. The worksheet's table is the answer most people want and it is keyed
 * off something they already know — how long the animals will be on the piece —
 * but somebody with their own figure must not have to work backwards to a period
 * that happens to produce it.
 */
function step3(calc) {
  const mode = calc.utilization?.mode === 'own' ? 'own' : 'period'

  return `
    <p class="hint">Utilization is the share of the available forage the animals
      eat. It rises as the occupation period gets shorter. Fencing off a smaller
      area will shorten the occupation period.</p>

    <div class="dm-split">
      <!-- The pill gets a label row of its own, and that is what holds it level
           with the control in the other column rather than with that column's
           label. Both columns are then a one-line label over a 44px control, so
           the pill lands beside the input or beside the picker at the same
           height in either mode. See .util-mode in app.css. -->
      <div class="field util-mode">
        <div class="field-label"><span>How to set utilization</span></div>
        ${modePill({
          label: 'How to set utilization',
          path: 'utilization.mode',
          action: 'set-util-mode',
          current: mode,
          modes: [
            { key: 'period', label: 'From how long they graze' },
            { key: 'own', label: 'Enter a percent' },
          ],
        })}
      </div>

      ${
        mode === 'own'
          ? numField({
              label: 'Percent utilization',
              path: 'utilization.ownPct',
              value: calc.utilization?.ownPct,
              suffix: '%',
              info: 'ccUtilization',
              hint: 'The 60% to 80% range is typical.',
            })
          : periodPicker(calc)
      }
    </div>

    <div class="results">
      ${readout('Left behind', 'forageLeftBehind', { fmt: 'lbsPerAcre' })}
      ${readout('Usable forage', 'usableForage', {
        fmt: 'lbsPerAcre',
        info: 'usableForage',
        strong: true,
      })}
    </div>`
}

/**
 * Radios rather than a select, so the percentage each period carries is on
 * screen beside it.
 *
 * The percentage is a LABEL here, read out of the table at render time. It is
 * never written into the record: what is stored is which period was chosen, so a
 * correction to the table reaches calculations already saved.
 */
function periodPicker(calc) {
  const current = calc.utilization?.periodKey ?? ''
  return `
    <div class="field">
      <div class="field-label">
        <span>How long will they be on this piece?</span>
        ${infoButton('ccUtilization', 'Percent utilization')}
      </div>
      <div class="stage-grid period-grid" role="radiogroup" aria-label="Occupation period">
        ${UTILIZATION_PERIODS.map(
          (p) => `
          <label class="pick stage-card">
            <input type="radio" name="ccPeriod" value="${esc(p.key)}"
              data-action="set-period" ${p.key === current ? 'checked' : ''} />
            <span class="pick-row">
              <span class="pick-box" aria-hidden="true"></span>
              <span class="pick-body">
                <span class="pick-title">${esc(p.label)}</span>
                <span class="pick-sub">${p.pct}% utilization</span>
              </span>
            </span>
          </label>`
        ).join('')}
      </div>
    </div>`
}

/* ─────────────────────────────── step 4 ────────────────────────────────── */

function step4(calc) {
  const needsHerd = calc.goals.includes('days') || calc.goals.includes('acres')

  return `
    <div class="field-row">
      ${numField({
        label: 'Average animal weight',
        path: 'demand.animalWeight',
        value: calc.demand?.animalWeight,
        suffix: 'lbs',
        step: '10',
      })}
      ${numField({
        label: 'Percent of body weight eaten per day',
        path: 'demand.bodyWeightPct',
        value: calc.demand?.bodyWeightPct,
        suffix: '%',
        info: 'bodyWeightPct',
        hint: 'NRCS puts the usual range at 2.5% to 3%.',
      })}
      ${
        needsHerd
          ? countField({
              label: 'Number of animals',
              path: 'demand.numAnimals',
              value: calc.demand?.numAnimals,
              suffix: 'head',
            })
          : ''
      }
    </div>

    ${
      needsHerd
        ? ''
        : `<p class="hint">Your herd size is not needed here. It is what
             ${esc('"How many animals can I graze?"')} works out for you.</p>`
    }

    <div class="results">
      ${readout('Demand per animal', 'perAnimalDemand', {
        fmt: 'lbsPerDay',
        info: 'perAnimalDemand',
      })}
      ${
        needsHerd
          ? readout('Demand for the herd', 'herdDemand', {
              fmt: 'lbsPerDay',
              info: 'herdDemand',
              strong: true,
            })
          : ''
      }
    </div>`
}

/* ─────────────────────────────── step 5 ────────────────────────────────── */

function step5(calc, showAll) {
  const goals = calc.goals ?? []
  const needsField = goals.includes('days') || goals.includes('animals')
  const needsDays = goals.includes('animals') || goals.includes('acres')

  return `
    ${
      needsField || needsDays
        ? `<p class="sub-title">Your field</p>
           <div class="field-row">
             ${
               needsField
                 ? numField({
                     label: 'Total acres in the field',
                     path: 'pasture.totalAcres',
                     value: calc.pasture?.totalAcres,
                     suffix: 'ac',
                   }) +
                   numField({
                     label: 'Ungrazeable acres',
                     path: 'pasture.ungrazeableAcres',
                     value: calc.pasture?.ungrazeableAcres,
                     suffix: 'ac',
                     info: 'ungrazeable',
                     hint: 'Waterways, wet holes, headlands, and ground they will not walk.',
                   })
                 : ''
             }
             ${
               needsDays
                 ? countField({
                     label: 'How many days do you plan to graze?',
                     path: 'pasture.desiredDays',
                     value: calc.pasture?.desiredDays,
                     suffix: 'days',
                     hint:
                       goals.includes('acres') && !goals.includes('animals')
                         ? 'Optional. Leave blank for the daily figure only.'
                         : '',
                   })
                 : ''
             }
           </div>`
        : ''
    }

    ${
      needsField
        ? `<div class="results">
             ${readout('Grazeable acres', 'acresAvailable', { fmt: 'acres' })}
             ${readout('Total usable forage', 'totalUsableForage', {
               fmt: 'lbs',
               info: 'totalUsableForage',
             })}
           </div>`
        : ''
    }

    ${goals.includes('acres') ? paddockShape(calc) : ''}

    <div data-results></div>

    ${showAll ? `<div class="export-row--loose">${exportRow()}</div>` : ''}`
}

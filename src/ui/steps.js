/**
 * The five steps, numbered to match the paper worksheet.
 *
 * Every step section is always in the DOM, with [hidden] on the ones not
 * currently open. That single mechanism serves three things: the wizard, the
 * "Show all steps" toggle, and printing, which forces them all visible.
 *
 * Because hidden steps stay in the DOM, no computed figure may be baked into
 * this markup. Every number is a [data-out] placeholder that updateOutputs()
 * refreshes, so a step the user cannot currently see is still correct when they
 * come back to it.
 */

import { esc } from './format.js'
import { field, numField, countField, modePill, readout, infoButton, sectionInfo } from './fields.js'
import { stageThumb } from './table.js'
import { FRAMES } from '../calc.js'
import { INSTRUCTIONS } from '../data/instructions.js'
import { FORAGE_TYPES, MIXED, stagesFor, forageById } from '../data/forage.js'
import { isPanelOpen, getPref } from '../prefs.js'

export const STEP_LABELS = [
  'Clip and weigh',
  'Forage available',
  'Usable forage',
  'Daily demand',
  'Results',
]

export function renderSteps(calc, step, showAll) {
  return `
    <div class="steps">
      ${[step1, step2, step3, step4, step5]
        .map((fn, i) => {
          const open = showAll || i === step
          return `<section class="box step" data-step="${i}"${open ? '' : ' hidden'}>
            ${fn(calc)}
            ${showAll ? '' : nav(i)}
          </section>`
        })
        .join('')}
    </div>`
}

function head(n, title, infoKeys) {
  return `
    <div class="step-head">
      <span class="step-n">Step ${n}</span>
      <span class="title">${esc(title)}</span>
      ${infoKeys ? sectionInfo(infoKeys, title) : ''}
    </div>`
}

function nav(i) {
  const last = i === 4
  return `
    <div class="step-nav">
      ${i > 0 ? '<button type="button" class="btn-add-inline" data-action="prev-step">Back</button>' : ''}
      <div class="spacer"></div>
      ${
        last
          ? '<button type="button" class="btn-main" data-action="print">Print or save as PDF</button>'
          : '<button type="button" class="btn-main" data-action="next-step">Next</button>'
      }
    </div>`
}

/* ─────────────────────────────── step 1 ────────────────────────────────── */

function step1(calc) {
  return `
    ${head(1, 'Clip and weigh your samples', ['clipping', 'sampleSpread'])}

    <div class="howto-row">
      ${INSTRUCTIONS.map(
        (p) => `
        <details class="howto" data-panel="${esc(p.id)}"${isPanelOpen(p.id) ? ' open' : ''}>
          <summary>${esc(p.title)}</summary>
          <div class="howto-body">
            ${mediaSlot(p)}
            ${p.body.map((line) => `<p>${esc(line)}</p>`).join('')}
          </div>
        </details>`
      ).join('')}
    </div>

    <p class="hint">Enter each sample weight in grams. Blank rows are ignored, so
      you do not need to fill them all.</p>

    <div class="samples">
      ${calc.samples
        .map(
          (value, i) => `
        <div class="sample">
          <span class="sample-n">${i + 1}</span>
          <div class="input-wrap has-suffix">
            <input type="number" step="0.1" min="0" inputmode="decimal"
              data-path="samples.${i}" value="${esc(value ?? '')}"
              aria-label="Sample ${i + 1} weight in grams" />
            <span class="affix suffix">g</span>
          </div>
        </div>`
        )
        .join('')}
    </div>

    <div class="step-nav step-nav--plain">
      <button type="button" class="btn-add" data-action="add-sample">+ Add another sample</button>
      ${
        calc.samples.length > 1
          ? '<button type="button" class="tip danger" data-action="remove-sample">Remove last</button>'
          : ''
      }
    </div>

    <div class="results">
      ${readout('Average sample weight', 'avgGrams', { fmt: 'grams', strong: true })}
      ${readout('Samples used', 'sampleCount', { fmt: 'number' })}
    </div>
    <p class="sample-stats" data-spread-note hidden></p>`
}

/** A photo or video when there is one, a labelled placeholder until then. */
function mediaSlot(panel) {
  if (!panel.media) {
    return `<div class="photo-ph" role="img"
      aria-label="${esc(`${panel.title}. ${panel.mediaCaption}. Media coming soon.`)}">
      ${esc(panel.mediaCaption)}<br />Photo or video coming soon</div>`
  }
  const base = import.meta.env?.BASE_URL ?? '/'
  const src = `${base}${String(panel.media.src).replace(/^\//, '')}`
  return panel.media.type === 'video'
    ? `<video class="howto-media" controls preload="none"
         ${panel.media.poster ? `poster="${esc(base + panel.media.poster)}"` : ''}
         src="${esc(src)}"></video>`
    : `<img class="howto-media" src="${esc(src)}" alt="${esc(panel.media.alt || panel.mediaCaption)}" loading="lazy" />`
}

/* ─────────────────────────────── step 2 ────────────────────────────────── */

function step2(calc) {
  const frameKey = calc.frame?.key ?? 'small'
  const mode = calc.dm?.mode ?? 'stage'

  return `
    ${head(2, 'Work out the forage available', ['frame', 'totalProduction', 'availableForage'])}

    <p class="sub-title">Frame size ${infoButton('frame', 'Clipping frame')}</p>
    ${modePill({
      label: 'Frame size',
      path: 'frame.key',
      action: 'set-frame',
      current: frameKey,
      modes: FRAMES.map((f) => ({
        key: f.key,
        label: f.area ? `${f.label} (${f.area} sq ft)` : f.label,
      })),
    })}
    ${
      frameKey === 'custom'
        ? numField({
            label: 'Frame area',
            path: 'frame.customArea',
            value: calc.frame?.customArea,
            suffix: 'sq ft',
            step: '0.01',
            hint: 'Measure the inside of your frame. A 12 by 12 inch frame is 1 square foot.',
          })
        : ''
    }

    <div class="results">
      ${readout('Total production', 'totalProduction', {
        fmt: 'lbsPerAcre',
        info: 'totalProduction',
      })}
    </div>

    <p class="sub-title">Dry matter ${infoButton('airDryMatter', 'Air-dry matter')}</p>
    ${modePill({
      label: 'How to set dry matter',
      path: 'dm.mode',
      action: 'set-dm-mode',
      current: mode,
      modes: [
        { key: 'stage', label: 'Use the chart' },
        { key: 'own', label: 'I dried my own' },
        { key: 'mix', label: 'Weighted mix' },
      ],
    })}

    ${mode === 'own' ? ownDryMatter(calc) : ''}
    ${mode === 'stage' ? stagePicker(calc) : ''}
    ${mode === 'mix' ? mixBuilder(calc) : ''}

    <div class="results">
      ${readout('Dry matter', 'dryMatterPct', { fmt: 'pct' })}
      ${readout('Available forage', 'availableForage', {
        fmt: 'lbsPerAcre',
        info: 'availableForage',
        strong: true,
      })}
    </div>`
}

function ownDryMatter(calc) {
  return numField({
    label: 'Air-dried sample percent',
    path: 'dm.ownPct',
    value: calc.dm?.ownPct,
    suffix: '%',
    hint: 'Dry weight divided by wet weight, times 100. Air dried only, with no oven or heater.',
  })
}

function stagePicker(calc) {
  const mixed = calc.forageType === MIXED.id

  if (mixed) {
    const picked = calc.dm?.stageTypeId
      ? `${forageById(calc.dm.stageTypeId)?.label ?? ''}, ${
          stagesFor(calc.dm.stageTypeId).find((s) => s.key === calc.dm.stageKey)?.label ?? ''
        }`
      : ''
    return `
      <p class="hint">Your stand is mixed, so there is no single row to narrow the
        chart down to. Open the chart and pick whichever cell fits best.</p>
      <button type="button" class="btn-add" data-action="open-chart-picker">
        ${picked ? esc(`Chosen: ${picked}. Change`) : 'Open the chart and pick a cell'}
      </button>`
  }

  const stages = stagesFor(calc.forageType)
  if (!stages.length) return '<p class="hint">Choose a forage type to see its growth stages.</p>'

  const showPhotos = getPref('showStagePhotos')
  const type = forageById(calc.forageType)

  return `
    <div class="field-label">
      <span>Growth stage for ${esc(type.label.toLowerCase())}</span>
      <button type="button" class="help-btn" data-action="open-chart"
        aria-label="Show the dry matter chart" title="Show the dry matter chart">?</button>
      <span class="field-aside">
        <button type="button" class="tip" data-action="toggle-stage-photos">
          ${showPhotos ? 'Hide photos' : 'Show photos'}
        </button>
      </span>
    </div>
    <div class="goal-grid">
      ${stages
        .map((s) =>
          `<label class="pick">
            <input type="radio" name="stage" value="${esc(s.key)}"
              data-action="set-stage" ${calc.dm?.stageKey === s.key ? 'checked' : ''} />
            ${showPhotos ? stageThumb(calc.forageType, s) : ''}
            <span class="pick-title">${esc(s.label)}</span>
            <span class="pick-sub">${esc(s.desc)}. ${s.pct}% dry matter.</span>
          </label>`
        )
        .join('')}
    </div>`
}

function mixBuilder(calc) {
  const rows = calc.dm?.mix ?? []
  return `
    <p class="hint">For a stand where two or three types each make up a real share.
      ${esc('Shares are treated as weights, so they do not have to total exactly 100.')}
      ${infoButton('mixBuilder', 'Weighted mix')}</p>

    ${rows
      .map(
        (row, i) => `
      <div class="mix-row">
        <div class="field">
          <div class="field-label"><label for="mix-type-${i}">Forage type</label></div>
          <select id="mix-type-${i}" data-path="dm.mix.${i}.typeId">
            <option value="">Choose a type</option>
            ${FORAGE_TYPES.map(
              (t) =>
                `<option value="${esc(t.id)}"${row.typeId === t.id ? ' selected' : ''}>${esc(
                  t.label
                )}</option>`
            ).join('')}
          </select>
        </div>
        <div class="field">
          <div class="field-label"><label for="mix-stage-${i}">Growth stage</label></div>
          <select id="mix-stage-${i}" data-path="dm.mix.${i}.stageKey"${
            row.typeId ? '' : ' disabled'
          }>
            <option value="">Choose a stage</option>
            ${stagesFor(row.typeId)
              .map(
                (s) =>
                  `<option value="${esc(s.key)}"${row.stageKey === s.key ? ' selected' : ''}>${esc(
                    s.label
                  )} (${s.pct}%)</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="field pct">
          <div class="field-label"><label for="mix-share-${i}">Percent of stand</label></div>
          <div class="input-wrap has-suffix">
            <input id="mix-share-${i}" type="number" step="1" min="0" inputmode="decimal"
              data-path="dm.mix.${i}.share" value="${esc(row.share ?? '')}" />
            <span class="affix suffix">%</span>
          </div>
        </div>
        ${
          rows.length > 1
            ? `<button type="button" class="tip danger" data-action="remove-mix" data-index="${i}">Remove</button>`
            : ''
        }
      </div>`
      )
      .join('')}

    <button type="button" class="btn-add" data-action="add-mix">+ Add another type</button>`
}

/* ─────────────────────────────── step 3 ────────────────────────────────── */

function step3(calc) {
  const mode = calc.usable?.mode ?? 'lbs'
  return `
    ${head(3, 'Work out the usable forage', ['amountLeaving', 'usableForage', 'harvestPct'])}

    <p class="hint">Some forage has to stay on the ground. It armors the soil, keeps
      roots alive, and lets the plant recover. Say how much you are leaving, either
      as pounds per acre or as the share you plan to take.</p>

    ${modePill({
      label: 'How to set the residual',
      path: 'usable.mode',
      action: 'set-usable-mode',
      current: mode,
      modes: [
        { key: 'lbs', label: 'Leave lbs/ac' },
        { key: 'pct', label: 'Take a percent' },
      ],
    })}

    ${
      mode === 'lbs'
        ? numField({
            label: 'Forage left behind',
            path: 'usable.amountLeaving',
            value: calc.usable?.amountLeaving,
            suffix: 'lbs/ac',
            info: 'amountLeaving',
            hint: 'A common starting point is half of what is available.',
          })
        : numField({
            label: 'Harvest percent',
            path: 'usable.harvestPct',
            value: calc.usable?.harvestPct,
            suffix: '%',
            info: 'harvestPct',
            hint: 'Take half and leave half is 50%. Shorter grazing periods raise this.',
          })
    }

    <div class="results">
      ${readout(
        mode === 'lbs' ? 'That is a harvest of' : 'That leaves behind',
        mode === 'lbs' ? 'harvestPctEquivalent' : 'amountLeaving',
        { fmt: mode === 'lbs' ? 'pct' : 'lbsPerAcre' }
      )}
      ${readout('Usable forage', 'usableForage', {
        fmt: 'lbsPerAcre',
        info: 'usableForage',
        strong: true,
      })}
    </div>`
}

/* ─────────────────────────────── step 4 ────────────────────────────────── */

function step4(calc) {
  const needsHerd = calc.goals.includes('days') || calc.goals.includes('acres')

  return `
    ${head(4, 'Work out the daily forage demand', ['bodyWeightPct', 'perAnimalDemand', 'herdDemand'])}

    <div class="row-2">
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
    </div>

    ${
      needsHerd
        ? countField({
            label: 'Number of animals',
            path: 'demand.numAnimals',
            value: calc.demand?.numAnimals,
            suffix: 'head',
          })
        : `<p class="hint">Your herd size is not needed here. It is what
             ${esc('"How many animals can I run?"')} works out for you.</p>`
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

function step5(calc) {
  const goals = calc.goals ?? []
  const needsPasture = goals.includes('days') || goals.includes('animals')
  const needsDays = goals.includes('animals') || goals.includes('acres')

  return `
    ${head(5, 'Your results')}

    ${
      needsPasture
        ? `<p class="sub-title">Your pasture</p>
           <div class="row-2">
             ${numField({
               label: 'Total acres in the pasture',
               path: 'pasture.totalAcres',
               value: calc.pasture?.totalAcres,
               suffix: 'ac',
             })}
             ${numField({
               label: 'Ungrazeable acres',
               path: 'pasture.ungrazeableAcres',
               value: calc.pasture?.ungrazeableAcres,
               suffix: 'ac',
               info: 'ungrazeable',
               hint: 'Water, rock, timber, roads, and ground they will not walk.',
             })}
           </div>
           <div class="results">
             ${readout('Grazeable acres', 'acresAvailable', { fmt: 'acres' })}
             ${readout('Total usable forage', 'totalUsableForage', {
               fmt: 'lbs',
               info: 'totalUsableForage',
             })}
           </div>`
        : ''
    }

    ${
      needsDays
        ? countField({
            label: 'How many days do you plan to graze?',
            path: 'pasture.desiredDays',
            value: calc.pasture?.desiredDays,
            suffix: 'days',
            hint: goals.includes('acres') && !goals.includes('animals')
              ? 'Optional. Leave blank for the daily figure only.'
              : '',
          })
        : ''
    }

    <div data-results></div>
    <div data-warnings></div>

    <div class="step-nav">
      <button type="button" class="btn-add-inline" data-action="save-calc">Save calculation</button>
      <div class="spacer"></div>
      <button type="button" class="btn-add-inline" data-action="export-csv">Export CSV</button>
      <button type="button" class="btn-add-inline" data-action="export-png">Save as image</button>
    </div>`
}

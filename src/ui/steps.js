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
import {
  numField,
  countField,
  modePill,
  readout,
  infoButton,
  sectionInfo,
  pickCard,
} from './fields.js'
import { stageThumb } from './table.js'
import { FRAMES } from '../calc.js'
import { INSTRUCTIONS } from '../data/instructions.js'
import { FORAGE_TYPES, MIXED, STAGE_PHOTOS, stagesFor, forageById } from '../data/forage.js'
import { isStepOpen, getPref } from '../prefs.js'

export const STEP_LABELS = [
  'Clip and weigh',
  'Forage available',
  'Usable forage',
  'Daily demand',
  'Results',
]

/**
 * Under "Show all steps" every section is collapsible and only the one the user
 * is on starts open.
 *
 * Five steps expanded is a very long page, and the reason to turn the toggle on
 * is usually to reach ONE earlier figure, not to read all five. The bodies are
 * hidden with the [hidden] attribute rather than removed, so every [data-out]
 * inside a shut section is still refreshed and still correct when it is opened,
 * and printing can force them all back into view.
 */
const STEP_HEADS = [
  ['Clip and weigh your samples', ['clipping', 'sampleSpread']],
  ['Work out the forage available', ['frame', 'totalProduction', 'availableForage']],
  ['Work out the usable forage', ['amountLeaving', 'usableForage', 'harvestPct']],
  ['Work out the daily forage demand', ['bodyWeightPct', 'perAnimalDemand', 'herdDemand']],
  ['Your results', null],
]

/**
 * @param {Set<number>} warned  steps the user has already tried to leave with
 *   something outstanding. Only those render a shortfall note.
 */
export function renderSteps(calc, step, showAll, warned = new Set()) {
  return `
    <div class="steps">
      ${[step1, step2, step3, step4, step5]
        .map((fn, i) => {
          const [title, infoKeys] = STEP_HEADS[i]
          const open = showAll ? isStepOpen(i) : i === step
          return `<section class="box step${showAll ? ' step--collapsible' : ''}"
            data-step="${i}"${showAll || i === step ? '' : ' hidden'}>
            ${head(i + 1, title, infoKeys, showAll, open)}
            <div class="step-body"${showAll && !open ? ' hidden' : ''}>
              ${fn(calc, showAll)}
              ${stepMissing(i, warned)}
              ${showAll ? '' : nav(i)}
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
 */
function head(n, title, infoKeys, collapsible, open) {
  const label = `<span class="step-n">Step ${n}</span>
    <span class="title">${esc(title)}</span>`

  const clear = `<button type="button" class="tip danger step-clear" data-action="clear-step"
    data-step="${n - 1}">Clear</button>`

  if (!collapsible) {
    return `<div class="step-head">${label}${
      infoKeys ? sectionInfo(infoKeys, title) : ''
    }${clear}</div>`
  }

  return `
    <div class="step-head step-head--toggle">
      <button type="button" class="step-toggle" data-action="toggle-step" data-step="${n - 1}"
        aria-expanded="${open}">
        <span class="step-chev" aria-hidden="true"></span>
        ${label}
      </button>
      ${infoKeys ? sectionInfo(infoKeys, title) : ''}
      ${clear}
    </div>`
}

/**
 * What this step still owes, named on the step that asks for it.
 *
 * Rendered only for a step the user has already tried to LEAVE with something
 * outstanding. A step is blank when you arrive on it, so a note saying it is
 * unfinished is telling you what you can already see; said on arrival every
 * time, it is noise, and noise is what people learn to read past.
 *
 * Once rendered it behaves like a figure: a [data-out]-style placeholder that
 * updateOutputs() fills from `missingByStep`, so it clears itself on the
 * keystroke that fills the box rather than waiting for the next render.
 *
 * Step 5 never has one. The result cards name their own outstanding inputs, and
 * a second note above them saying the same thing reads as two problems.
 */
function stepMissing(i, warned) {
  if (i === 4 || !warned.has(i)) return ''
  return `<p class="step-missing" data-step-missing="${i}" hidden></p>`
}

/* Back and Next are the same control at the same size: same height, same font,
   same min-width, so the pair reads as one thing you move along rather than a
   button and a link. Back is outlined rather than filled, because --sky is the
   one loud button on a screen and Next is the one you are meant to press. */
function nav(i) {
  const back =
    i > 0
      ? '<button type="button" class="btn-step btn-step--back" data-action="prev-step">Back</button>'
      : ''

  // The last step has nowhere further forward, so the right-hand end of the row
  // carries the way OUT instead: to the list this calculation can be kept in.
  // It is a .btn-step like Back, so the pair are the same size at both ends and
  // the three export links sit centred between them.
  if (i === 4) {
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
 * The three ways off the last step, as text links rather than buttons.
 *
 * None of them changes a figure, so none of them is the one thing to press on
 * this screen. Ordered the way they are asked for: the image first, because
 * that is the one that gets sent to somebody.
 */
function exportRow() {
  return `
    <div class="export-links">
      <button type="button" class="tip" data-action="export-png">Save as image</button>
      <button type="button" class="tip" data-action="export-csv">Export CSV</button>
      <button type="button" class="tip" data-action="print">Print or save as PDF</button>
    </div>`
}

/* ─────────────────────────────── step 1 ────────────────────────────────── */

/**
 * Scissors, sun, scales. Each is followed by U+FE0E, the text variation
 * selector, which is what stops a phone drawing these three as full-colour
 * emoji next to a heading set in the page's own type.
 *
 * Written as numeric entities so the source file stays ASCII and cannot be
 * mangled by an editor guessing at its encoding.
 */
const HOWTO_ICONS = {
  clip: '&#9986;&#65038;',
  dry: '&#9728;&#65038;',
  weigh: '&#9878;&#65038;',
}

function step1(calc) {
  return `
    <p class="hint">Enter each sample weight in grams. Blank rows are ignored, so
      you do not need to fill them all.</p>

    <div class="howto-row">
      ${INSTRUCTIONS.map(
        (p) => `
        <button type="button" class="howto-card" data-action="open-howto" data-howto="${esc(p.id)}">
          <span class="howto-card-icon" aria-hidden="true">${HOWTO_ICONS[p.id] ?? ''}</span>
          <span class="howto-card-text">
            <span class="howto-card-title">${esc(p.title)}</span>
            <span class="howto-card-sub">${esc(p.mediaCaption)}</span>
          </span>
        </button>`
      ).join('')}
    </div>

    <div class="samples">
      ${calc.samples
        .map(
          (value, i) => `
        <div class="sample">
          <span class="sample-n">${i + 1}:</span>
          <div class="input-wrap has-suffix has-spin" style="--suffix-len: 1">
            <input type="number" step="0.1" min="0" inputmode="decimal"
              data-path="samples.${i}" value="${esc(value ?? '')}"
              aria-label="Sample ${i + 1} weight in grams" />
            <span class="affix suffix">g</span>
          </div>
        </div>`
        )
        .join('')}

      <!-- Both in ONE cell spanning two columns, so they follow the last weight
           box as a pair. A cell each put a column's worth of empty grid between
           the button and the link that undoes it, and the button had to fill its
           cell to look deliberate, which is what made the label spill. -->
      <div class="sample sample--actions">
        <button type="button" class="btn-add-cell" data-action="add-sample"
          aria-label="Add another sample">+ Add sample</button>
        ${
          calc.samples.length > 1
            ? `<button type="button" class="tip danger sample-remove"
                 data-action="remove-sample">Remove last</button>`
            : ''
        }
      </div>
    </div>

    <div class="results">
      ${readout('Average sample weight', 'avgGrams', { fmt: 'grams', strong: true })}
      ${readout('Samples used', 'sampleCount', { fmt: 'number' })}
    </div>
    <p class="sample-stats" data-spread-note hidden></p>`
}

/**
 * How to clip, dry, and weigh, as a modal rather than a drop-down.
 *
 * Media on the left, numbered steps on the right. A collapsed panel above the
 * weight boxes was competing for the top of the step with the thing the step is
 * for, and it could not show a video at a useful size in the width it had.
 */
export function howToPanel(id) {
  const panel = INSTRUCTIONS.find((p) => p.id === id)
  if (!panel) return null

  return {
    title: panel.title,
    html: `
      <div class="howto-modal">
        <div class="howto-modal-media">${mediaSlot(panel)}</div>
        <ol class="howto-steps">
          ${panel.body.map((line) => `<li>${esc(line)}</li>`).join('')}
        </ol>
      </div>`,
  }
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
  const frameKey = calc.frame?.key ?? 'custom'
  const mode = calc.dm?.mode ?? 'stage'
  const preset = FRAMES.find((f) => f.key === frameKey)

  const DM_MODES = [
    { key: 'stage', label: 'Use the chart', sub: 'Pick the growth stage you clipped at' },
    { key: 'own', label: 'I dried my own', sub: 'Enter the percentage you measured' },
    { key: 'mix', label: 'Weighted mix', sub: 'Two or three types, each a real share' },
  ]

  return `
    <p class="sub-title">Frame size ${infoButton('frame', 'Clipping frame')}</p>

    <!-- The pill and the box are one question, so on a wide screen they share a
         row instead of the box dropping below the fold.

         The box is ALWAYS here, and the two hoop presets fill it in rather than
         hiding it. A number that appears and disappears as the pill is pressed
         leaves no way to see what a preset actually is, and someone measuring an
         unmarked hoop has to guess which of the two they own. Typing over the
         figure moves the pill to "Other frame", which is what main.js does on
         input: the box is the answer and the pill is a shortcut to it. -->
    <div class="inline-row">
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
      ${numField({
        label: 'Frame area',
        path: 'frame.customArea',
        value: calc.frame?.customArea,
        suffix: 'sq ft',
        step: '0.01',
        hint: preset?.area
          ? `The ${preset.label.toLowerCase()} measures ${preset.area} sq ft. Type your own to use a different frame.`
          : 'Measure the inside of your frame. A 12 by 12 inch frame is 1 square foot.',
      })}
    </div>

    <div class="results">
      ${readout('Total production', 'totalProduction', {
        fmt: 'lbsPerAcre',
        info: 'totalProduction',
      })}
    </div>

    <p class="sub-title">Dry matter ${infoButton('airDryMatter', 'Air-dry matter')}</p>

    <!-- Three ways to answer one question, so the choice sits in a narrow
         column on the left and its answer fills the wide column on the right.
         A pill across the full width put the chart and the mix builder below
         the fold and made them look like separate steps. -->
    <div class="dm-split">
      <div class="dm-modes" role="group" aria-label="How to set dry matter">
        ${DM_MODES.map(
          (m) => `
          <button type="button" class="dm-mode" data-action="set-dm-mode" data-mode="${esc(m.key)}"
            aria-pressed="${m.key === mode}">
            <span class="dm-mode-label">${esc(m.label)}</span>
            <span class="dm-mode-sub">${esc(m.sub)}</span>
            <span class="dm-mode-chev" aria-hidden="true"></span>
          </button>`
        ).join('')}
      </div>
      <div class="dm-panel">
        ${mode === 'own' ? ownDryMatter(calc) : ''}
        ${mode === 'stage' ? stagePicker(calc) : ''}
        ${mode === 'mix' ? mixBuilder(calc) : ''}
      </div>
    </div>

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
  // Every set is one borrowed species, so the note comes off the set rather than
  // being one sentence covering all of them: what a grass photo can be read for
  // under a grass row is not what it can be read for under a forb row.
  const note = showPhotos && stages.some((s) => s.photo) ? STAGE_PHOTOS[type.photoSet]?.note : ''

  return `
    <div class="field-label">
      <span>Growth stages</span>
      <button type="button" class="help-btn" data-action="open-chart"
        aria-label="Show the dry matter chart" title="Show the dry matter chart">?</button>
      <span class="field-aside">
        <button type="button" class="tip" data-action="toggle-stage-photos">
          ${showPhotos ? 'Hide photos' : 'Show photos'}
        </button>
      </span>
    </div>
    ${
      // One photographed plant stands in for every row, so the page says which
      // plant and what it can and cannot be read for. Left unsaid, someone
      // matching their warm season stand against a cool season plant would
      // read the DATE off the photo and pick the wrong column.
      note ? `<p class="hint stage-note">${esc(note)}</p>` : ''
    }
    <div class="stage-grid">
      ${stages
        .map((s) =>
          pickCard({
            class: 'stage-card',
            noBox: showPhotos,
            name: 'stage',
            value: s.key,
            action: 'set-stage',
            checked: calc.dm?.stageKey === s.key,
            title: s.label,
            sub: `${s.desc}. ${s.pct}% dry matter.`,
            media: showPhotos ? stageThumb(calc.forageType, s, calc.dm?.stageKey) : '',
          })
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
          <div class="field-label"><label for="mix-share-${i}">% of stand</label></div>
          <div class="input-wrap has-suffix has-spin" style="--suffix-len: 1">
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
    <p class="hint">Some forage has to stay on the ground. It armors the soil, keeps
      roots alive, and lets the plant recover. Say how much you are leaving, either
      as pounds per acre or as the share you plan to take.</p>

    <div class="inline-row">
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
    </div>

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

  // One row on a desktop, one field per row on a phone. See .field-row in
  // app.css: the columns are equal shares, so adding or dropping the herd size
  // does not resize the two that are always there.
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

function step5(calc, showAll) {
  const goals = calc.goals ?? []
  const needsPasture = goals.includes('days') || goals.includes('animals')
  const needsDays = goals.includes('animals') || goals.includes('acres')

  return `
    ${
      needsPasture || needsDays
        ? `<p class="sub-title">Your pasture</p>
           <div class="field-row">
             ${
               needsPasture
                 ? numField({
                     label: 'Total acres in the pasture',
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
                     hint: 'Water, rock, timber, roads, and ground they will not walk.',
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
      needsPasture
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
    <div data-warnings></div>

    ${
      // Under "Show all steps" there is no nav row to carry these, so the last
      // step carries them itself. In the wizard they live in nav(), beside Back,
      // where the row's own rule separates them from the figures above. Standing
      // alone they need that gap of their own.
      showAll ? `<div class="export-row--loose">${exportRow()}</div>` : ''
    }`
}

/**
 * How much ground one day's grazing actually is, in fence.
 *
 * The acres-per-day figure above is the answer; this turns it into the two
 * numbers someone stands in a pasture with. A square uses the least fence for a
 * given area, so that is the default. Entering the side you already have, an
 * existing fence line, solves the other one.
 */
function paddockShape(calc) {
  return `
    <p class="sub-title">Paddock size for one day ${infoButton('paddock', 'Paddock')}</p>
    <p class="hint">The acres your herd needs each day, laid out as fence. Left
      blank it is drawn as a square, which uses the least fence for the area. If
      you are running off an existing fence line, enter the side you already have
      and the other one is worked out for you.</p>

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

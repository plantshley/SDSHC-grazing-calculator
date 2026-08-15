/**
 * The landing screen: which answers are wanted, what forage is being sampled,
 * and what the user will need to gather before starting.
 *
 * The checklist is built from GOAL_INPUTS in calc.js, the same constant that
 * decides which fields render in steps 4 and 5. Hard-coding it separately is
 * how a checklist starts promising a figure the form never asks for.
 */

import { esc } from './format.js'
import { pickCard, sectionInfo } from './fields.js'
import { photoThumb } from './photo.js'
import { registerForageSet } from './table.js'
import { GOALS, INPUT_LABELS, checklistForGoals } from '../calc.js'
import { FORAGE_TYPES, MIXED, GROUP_LABELS, forageById } from '../data/forage.js'
import { isNeedChecked } from '../prefs.js'

/**
 * @param {object} calc
 * @param {boolean} returning  true once the steps have been opened at least
 *   once, which turns Start into Return and leaves the current step alone.
 */
export function renderSetup(calc, returning = false) {
  const { setId, indexOf } = registerForageSet(calc.forageType)
  const ready = calc.goals.length && calc.forageType

  // Only a saved calculation carries a name — see the note in renderChips — so
  // an unnamed working copy falls back to "Return to calculation" rather than
  // to "Return to " with nothing after it.
  const name = returning && calc.name ? String(calc.name) : ''

  return `
    <div class="box">
      <div class="title setup-title">Set up your calculation ${sectionInfo(
        ['forageType'],
        'Setting up'
      )}</div>

      <div class="setup-block">
        <p class="setup-q">1. What do you want to work out?</p>
        <p class="setup-hint">You can select multiple.</p>
        <div class="goal-grid">
          ${GOALS.map((g) =>
            pickCard({
              multi: true,
              name: 'goal',
              value: g.key,
              action: 'toggle-goal',
              checked: calc.goals.includes(g.key),
              title: g.label,
              sub: g.sub,
            })
          ).join('')}
        </div>
      </div>

      <div class="setup-block">
        <p class="setup-q">2. What forage are you evaluating?</p>
        <p class="setup-hint">Pick the type that makes up most of what you clipped.
          This chooses which row of the dry matter chart applies. Your sample already
          holds the real mix; this only decides how it is dried down on paper.
          Tap a photo to see it large, with the species it covers.</p>

        <div class="forage-grid">
          ${FORAGE_TYPES.map(
            (t) => `
            <div class="forage-cell">
              ${pickCard({
                class: 'forage-card',
                noBox: true,
                name: 'forageType',
                value: t.id,
                action: 'set-forage',
                checked: calc.forageType === t.id,
                title: t.label,
                sub: t.species.slice(0, 3).join(', '),
                media: photoThumb(t.photos?.[0], {
                  setId,
                  index: indexOf(t.id),
                  label: t.label,
                }),
                extra: `<span class="forage-group-tag">${esc(GROUP_LABELS[t.group])}</span>`,
              })}
            </div>`
          ).join('')}

          <div class="forage-cell">
            ${pickCard({
              class: 'forage-card forage-card--mixed',
              noBox: true,
              name: 'forageType',
              value: MIXED.id,
              action: 'set-forage',
              checked: calc.forageType === MIXED.id,
              title: MIXED.label,
              sub: MIXED.sub,
              media: photoThumb(MIXED.photos?.[0], {
                setId,
                index: indexOf(MIXED.id),
                label: MIXED.label,
              }),
            })}
          </div>
        </div>
      </div>

      ${renderChecklist(calc.goals)}

      <!-- The reason the button is disabled sits ON the row with the button,
           reading as the caption to it rather than as a note dropped underneath
           after the fact. It carries the warning wash for the same reason: it is
           the one thing standing between here and the calculation. -->
      <div class="step-nav step-nav--start">
        ${
          ready
            ? '<div class="spacer"></div>'
            : `<p class="start-warn">Choose at least one answer and a forage type to begin.</p>`
        }
        <!-- Coming back from Change is not starting over. The button says so,
             and main.js leaves the current step where it was.

             The name goes INSIDE .btn-word, which app.css drops below 620px:
             on a phone the button reads "Return →" and the name moves to the
             line underneath instead of squeezing the one control on the row.
             Only one of the two is ever displayed. -->
        <button type="button" class="btn-main" data-action="start" ${ready ? '' : 'disabled'}>
          ${
            returning
              ? `Return<span class="btn-word"> to ${
                  name ? `<span class="btn-name">${esc(name)}</span>` : 'calculation'
                }</span> &rarr;`
              : 'Start<span class="btn-word"> calculating</span> &rarr;'
          }
        </button>
        ${name ? `<p class="start-return-name">(${esc(name)})</p>` : ''}
      </div>
    </div>`
}

/**
 * What to gather, sectioned once more than one goal is selected.
 *
 * With one goal there is nothing to section. With several, the shared block
 * holds what every selected goal needs and each goal lists only what is left.
 * A figure can appear under two goals when both need it, which is correct.
 *
 * The items are real checkboxes because this list is used standing in a
 * pasture, working down it. Their state is a device preference, not part of the
 * calculation: ticking "gram scale" says nothing about the pasture and must not
 * travel in an export or into a saved record.
 */
function renderChecklist(goals) {
  const { shared, groups } = checklistForGoals(goals)
  if (!shared.length) return ''

  const list = (scope, keys) =>
    `<ul class="needs-list">${keys
      .map((k) => {
        const id = `need-${scope}-${k}`
        return `<li>
          <input type="checkbox" id="${esc(id)}" data-need="${esc(`${scope}:${k}`)}"
            ${isNeedChecked(`${scope}:${k}`) ? 'checked' : ''} />
          <label for="${esc(id)}">${esc(INPUT_LABELS[k] ?? k)}</label>
        </li>`
      })
      .join('')}</ul>`

  const goalLabel = (key) => GOALS.find((g) => g.key === key)?.short ?? key

  return `
    <div class="needs">
      <h3 class="setup-q">What you will need</h3>
      ${
        groups.length
          ? `<div class="needs-cols">
               <div class="needs-group">
                 <h4>For every calculation</h4>
                 ${list('all', shared)}
               </div>
               ${groups
                 .map(
                   (g) => `<div class="needs-group">
                     <h4>For ${esc(goalLabel(g.goal).toLowerCase())}</h4>
                     ${list(g.goal, g.keys)}
                   </div>`
                 )
                 .join('')}
             </div>`
          : list('all', shared)
      }
    </div>`
}

/** The compact summary shown above the stepper once setup is done. */
export function renderChips(calc) {
  const goalNames = calc.goals
    .map((k) => GOALS.find((g) => g.key === k)?.short)
    .filter(Boolean)
    .join(', ')

  const forage = calc.forageType === MIXED.id ? MIXED.label : forageById(calc.forageType)?.label
  const plural = calc.goals.length > 1 ? 'Goals' : 'Goal'

  // New calculation is a different thing from Change and from Clear, so it is
  // the only one of the three that is a button rather than a link: Change
  // reopens the setup screen over the work in progress, Clear empties the boxes
  // and keeps the answers, and this one puts the work down and starts again.
  return `
    <div class="chiprow">
      ${
        // Only a SAVED calculation has been named. An unnamed working copy shows
        // nothing here rather than a placeholder, so the row does not imply a
        // record exists that could be reopened.
        calc.name ? `<span class="chip-name">${esc(calc.name)}</span>` : ''
      }
      <span class="chip-pair">
        <span class="chip-key">${plural}:</span>
        <span class="chip">${esc(goalNames || 'No answer chosen')}</span>
      </span>
      <span class="chip-pair">
        <span class="chip-key">Forage type:</span>
        <span class="chip chip--forage">${esc(forage || 'No forage chosen')}</span>
      </span>
      <button type="button" class="tip chip-change" data-action="edit-setup">Change</button>
      <!-- Never trimmed to "+ New". On a phone this button takes the full width
           of its row, so there is no width to save, and "+ New" on its own does
           not say new WHAT. -->
      <button type="button" class="btn-add btn-add-inline chip-new" data-action="new-calc">
        + New calculation
      </button>
    </div>`
}

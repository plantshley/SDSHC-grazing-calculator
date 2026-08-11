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

export function renderSetup(calc) {
  const setId = registerForageSet()

  return `
    <div class="box">
      <div class="title">Set up your calculation ${sectionInfo(
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
          holds the real mix; this only decides how it is dried down on paper.</p>

        ${['grass', 'forb']
          .map(
            (group) => `
          <div class="forage-group">
            <h3>${esc(GROUP_LABELS[group])}</h3>
            <div class="forage-grid">
              ${FORAGE_TYPES.filter((t) => t.group === group)
                .map((t, i) =>
                  pickCard({
                    class: 'forage-card',
                    name: 'forageType',
                    value: t.id,
                    action: 'set-forage',
                    checked: calc.forageType === t.id,
                    title: t.label,
                    sub: t.species.slice(0, 3).join(', '),
                    media: photoThumb(t.photo, {
                      setId,
                      index: FORAGE_TYPES.indexOf(t),
                      label: t.label,
                    }),
                  })
                )
                .join('')}
            </div>
          </div>`
          )
          .join('')}

        <div class="forage-mixed">
          ${pickCard({
            name: 'forageType',
            value: MIXED.id,
            action: 'set-forage',
            checked: calc.forageType === MIXED.id,
            title: MIXED.label,
            sub: MIXED.sub,
          })}
        </div>
      </div>

      ${renderChecklist(calc.goals)}

      <div class="step-nav">
        <div class="spacer"></div>
        <button type="button" class="btn-main" data-action="start"
          ${calc.goals.length && calc.forageType ? '' : 'disabled'}>
          Start Calculating →
        </button>
      </div>
      ${
        calc.goals.length && calc.forageType
          ? ''
          : '<p class="hint">Choose at least one answer and a forage type to begin.</p>'
      }
    </div>`
}

/**
 * What to gather, sectioned once more than one goal is selected.
 *
 * With one goal there is nothing to section. With several, the shared block
 * holds what every selected goal needs and each goal lists only what is left.
 * A figure can appear under two goals when both need it, which is correct.
 */
function renderChecklist(goals) {
  const { shared, groups } = checklistForGoals(goals)
  if (!shared.length) return ''

  const list = (keys) =>
    `<ul>${keys.map((k) => `<li>${esc(INPUT_LABELS[k] ?? k)}</li>`).join('')}</ul>`

  const goalLabel = (key) => GOALS.find((g) => g.key === key)?.short ?? key

  return `
    <div class="needs">
      <h3>What you will need</h3>
      ${
        groups.length
          ? `<div class="needs-group">
               <h4>For every calculation</h4>
               ${list(shared)}
             </div>
             ${groups
               .map(
                 (g) => `<div class="needs-group">
                   <h4>For ${esc(goalLabel(g.goal).toLowerCase())}</h4>
                   ${list(g.keys)}
                 </div>`
               )
               .join('')}`
          : list(shared)
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

  return `
    <div class="chiprow">
      <span class="chip">${esc(goalNames || 'No answer chosen')}</span>
      <span class="chip chip--forage">${esc(forage || 'No forage chosen')}</span>
      <button type="button" class="tip" data-action="edit-setup">Change</button>
      <span class="spacer"></span>
      <button type="button" class="tip danger" data-action="clear-all">Clear all</button>
    </div>`
}

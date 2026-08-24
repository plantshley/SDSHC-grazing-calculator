/**
 * The cover crop landing screen: which answers are wanted, which season the
 * stand is dominated by, and what to take to the field.
 *
 * Same shape as the perennial one and for the same reasons — the checklist is
 * built from calc-covercrop.js's GOAL_INPUTS, the single constant that also
 * decides which fields render in the last two steps.
 *
 * The scope on the checklist ticks is prefixed `cc:`. Both worksheets ask for an
 * animal weight and a head count, so an unprefixed `all:animalWeight` would be
 * one tick shared across two tabs: ticking it here would silently tick it there,
 * for a scale the other list is not about.
 */

import { esc } from './format.js'
import { pickCard, sectionInfo } from './fields.js'
import { startNav } from './step-frame.js'
import { photoThumb, registerPhotoSet } from './photo.js'
import { checklistForGoals } from '../calc.js'
import { GOALS, GOAL_INPUTS, INPUT_LABELS } from '../calc-covercrop.js'
import { SEASONS, seasonById } from '../data/covercrop.js'
import { isNeedChecked } from '../prefs.js'

/** The JotForm this tab used to be. Kept reachable, and honest about it. */
const JOTFORM_URL = 'https://form.jotform.com/221745599167065'

/**
 * One viewer set over every season's photos, flattened.
 *
 * The same rule registerForageSet() follows, and for the same reason: the
 * viewer index comes from the FLATTENED list, never from a card's position in
 * the grid. The moment any season carries a second photograph the two stop
 * agreeing and the viewer opens on the wrong stand.
 *
 * A season with no photograph yet still occupies a slot, so filling one in later
 * is a data-file edit and no code change.
 */
function registerSeasonSet(current = '') {
  const setId = 'covercrop-seasons'
  const first = new Map()
  const items = []

  for (const season of SEASONS) {
    const photos = season.photos?.length ? season.photos : [null]
    first.set(season.id, items.length)
    photos.forEach((photo, i) => {
      items.push({
        photo,
        title: 'Cover crop seasons',
        label: season.label,
        sublabel: photos.length > 1 ? `${season.sub} (${i + 1} of ${photos.length})` : season.sub,
        placeholder: `Photo coming soon: ${season.label}`,
        pick: {
          action: 'pick-season',
          value: season.id,
          label: 'Use this season',
          chosenLabel: 'Your season',
          current: season.id === current,
        },
      })
    })
  }

  registerPhotoSet(setId, items)
  return { setId, indexOf: (id) => first.get(id) ?? 0 }
}

export function renderSetup(calc, returning = false) {
  const { setId, indexOf } = registerSeasonSet(calc.season)
  const ready = calc.goals.length && calc.season

  const name = returning && calc.name ? String(calc.name) : ''

  return `
    <div class="box">
      <div class="title setup-title">Set up your cover crop calculation ${sectionInfo(
        ['ccSeason'],
        'Setting up'
      )}</div>

      <!-- Two questions, side by side from 900px up. They are asked at the same
           time rather than in sequence, and stacked they pushed the season cards
           and the Start button below the fold on a laptop. The goals stack in
           the left column so both columns end at about the same height. -->
      <div class="setup-split">
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
        <p class="setup-q">2. Which season dominates this cover crop?</p>
        <p class="setup-hint">This sets which production estimate applies. Judge it
          on what makes up most of the standing growth, not on what was seeded. A stand
          that came up mostly rye is cool-season. Use the mix estimate when neither
          dominates.</p>

        <div class="forage-grid season-grid">
          ${SEASONS.map(
            (s) => `
            <div class="forage-cell">
              ${pickCard({
                class: 'forage-card',
                noBox: true,
                name: 'season',
                value: s.id,
                action: 'set-season',
                checked: calc.season === s.id,
                title: s.label,
                sub: s.sub,
                media: photoThumb(s.photos?.[0], {
                  setId,
                  index: indexOf(s.id),
                  label: s.label,
                }),
              })}
            </div>`
          ).join('')}
        </div>
      </div>
      </div>

      ${renderChecklist(calc.goals)}

      ${startNav({
        ready,
        warn: 'Choose at least one answer and a season to begin.',
        returning,
        name,
      })}

      <!-- The online form this tab used to be. Somebody may have a half-filled
           one open, or want the emailed copy it sends, so it stays reachable.
           It carries its own warning: it is hosted by JotForm, which is exactly
           the thing the footer's one sentence can no longer be asked to cover. -->
      <p class="hint cc-jotform">
        This cover crop grazing calculator is still up as a
        <a href="${JOTFORM_URL}" target="_blank" rel="noopener noreferrer">JotForm</a>
        if you prefer that version. It needs an internet connection, and anything submitted there goes to
        JotForm rather than staying on your device.
      </p>
    </div>`
}

function renderChecklist(goals) {
  const { shared, groups } = checklistForGoals(goals, GOAL_INPUTS)
  if (!shared.length) return ''

  const list = (scope, keys) =>
    `<ul class="needs-list">${keys
      .map((k) => {
        const id = `need-cc-${scope}-${k}`
        const need = `cc:${scope}:${k}`
        return `<li>
          <input type="checkbox" id="${esc(id)}" data-need="${esc(need)}"
            ${isNeedChecked(need) ? 'checked' : ''} />
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

  const season = seasonById(calc.season)?.label
  const plural = calc.goals.length > 1 ? 'Goals' : 'Goal'

  return `
    <div class="chiprow">
      ${calc.name ? `<span class="chip-name">${esc(calc.name)}</span>` : ''}
      <span class="chip-pair">
        <span class="chip-key">${plural}:</span>
        <span class="chip">${esc(goalNames || 'No answer chosen')}</span>
      </span>
      <span class="chip-pair">
        <span class="chip-key">Season:</span>
        <span class="chip chip--forage">${esc(season || 'No season chosen')}</span>
      </span>
      <button type="button" class="tip chip-change" data-action="edit-setup">Change</button>
      <button type="button" class="btn-add btn-add-inline chip-new" data-action="new-calc">
        + New calculation
      </button>
    </div>`
}

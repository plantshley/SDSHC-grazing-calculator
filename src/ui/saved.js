/**
 * The Saved tab.
 *
 * A calculation is worth keeping per pasture per season, so the list is built
 * for comparing a handful of them rather than filing hundreds. Color tags stand
 * in for folders: a label, not a container, so nothing can be orphaned.
 *
 * Two things share one rule. The list can be dragged into an order, and it can
 * be filtered by name. While a filter is on, reordering is OFF: dropping a card
 * between two others in a list that is hiding half its rows writes an order the
 * user cannot see and did not mean.
 */

import { esc, FORMATTERS } from './format.js'
import { openModal, modalError } from './modals.js'
import { GOALS } from '../calc.js'
import { forageById, MIXED } from '../data/forage.js'

/**
 * The swatches on offer, from the shared design system. Red is not among them.
 *
 * Grey is not either, and that is deliberate: grey is what an UNTAGGED card
 * already looks like, so offering it as a colour gives two ways to say the same
 * thing and no way to see which one was meant.
 */
export const TAGS = [
  'pink',
  'magenta',
  'violet',
  'indigo',
  'blue',
  'teal',
  'green',
  'lime',
  'yellow',
  'orange',
  'slate',
]

const TAG_LABELS = {
  pink: 'Pink',
  magenta: 'Magenta',
  violet: 'Violet',
  indigo: 'Indigo',
  blue: 'Blue',
  teal: 'Teal',
  green: 'Green',
  lime: 'Lime',
  yellow: 'Yellow',
  orange: 'Orange',
  slate: 'Slate',
}

/**
 * Circles, no text, the same control farm-budget uses for folder colors.
 *
 * `aria-pressed` is a RING rather than a fill, because a filled selected state
 * on a swatch fights the swatch's own color for the same square. The name is
 * carried by aria-label and title, so a producer who cannot tell two swatches
 * apart is not left guessing.
 */
export function swatchGrid(current, { name = 'Color' } = {}) {
  return `
    <div class="fld-grid" role="group" aria-label="${esc(name)}">
      ${TAGS.map(
        (key) => `
        <button type="button" class="fld-pick fld-swatch fld-c-${esc(key)}" data-tag="${esc(key)}"
          aria-pressed="${key === current}" title="${esc(TAG_LABELS[key])}"
          aria-label="${esc(TAG_LABELS[key])}"><span class="fld-dot" aria-hidden="true"></span></button>`
      ).join('')}
      <button type="button" class="fld-pick fld-none" data-tag=""
        aria-pressed="${!TAGS.includes(current)}" title="No color" aria-label="No color">
        <span class="fld-dot" aria-hidden="true"></span>
      </button>
    </div>`
}

export function renderSaved(list, filter = '') {
  const filtering = filter.trim().length > 0
  const shown = filtering ? list.filter((c) => matches(c, filter)) : list

  if (!list.length) {
    return `
      <div class="box">
        <div class="title">Saved calculations</div>
        <p class="empty-note">Nothing saved yet. Work through the calculator and
          press Save to keep a copy you can come back to.</p>
      </div>`
  }

  return `
    <div class="box">
      <div class="title">Saved calculations</div>
      <p class="hint">Saved on this device only. Clearing your browser data removes them.
        ${
          filtering
            ? 'Clear the search box to drag them into a different order.'
            : 'Drag a card by its handle to reorder the list.'
        }</p>

      <div class="saved-tools">
        <input type="search" class="saved-filter" data-saved-filter
          value="${esc(filter)}" placeholder="Search by name, pasture, or forage"
          aria-label="Search saved calculations" />
        ${
          filtering
            ? '<button type="button" class="tip" data-action="clear-saved-filter">Clear</button>'
            : ''
        }
      </div>

      ${
        shown.length
          ? `<div class="saved-list" data-saved-list>
               ${shown.map((c) => cardFor(c, filtering)).join('')}
             </div>`
          : `<p class="empty-note">No saved calculation matches ${esc(filter.trim())}.</p>`
      }
    </div>`
}

/** Everything on the card that a producer would think to search by. */
function matches(calc, filter) {
  const forage =
    calc.forageType === MIXED.id ? MIXED.label : forageById(calc.forageType)?.label ?? ''
  return [calc.name, calc.pastureName, forage]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(filter.trim().toLowerCase())
}

function cardFor(calc, filtering) {
  const res = calc.results ?? {}
  const goals = (calc.goals ?? [])
    .map((g) => GOALS.find((x) => x.key === g)?.short)
    .filter(Boolean)
    .join(', ')

  const forage =
    calc.forageType === MIXED.id ? MIXED.label : forageById(calc.forageType)?.label ?? ''

  const figures = []
  if (calc.goals?.includes('days')) {
    figures.push(`Grazing days: <b>${esc(FORMATTERS.days(res.grazingDays))}</b>`)
  }
  if (calc.goals?.includes('acres')) {
    figures.push(`Acres per day: <b>${esc(FORMATTERS.acres(res.acresPerDay))}</b>`)
  }
  if (calc.goals?.includes('animals')) {
    figures.push(`Animals: <b>${esc(FORMATTERS.head(res.animalsAllowed))}</b>`)
  }

  const tag = TAGS.includes(calc.tag) ? calc.tag : ''

  return `
    <div class="saved-card ${tag ? `fld-c-${esc(tag)}` : 'saved-card--untagged'}"
      data-calc-id="${esc(calc.id)}">
      <div class="saved-top">
        <span class="saved-grip" title="Drag to reorder" aria-hidden="true"
          draggable="${!filtering}"></span>
        <div class="saved-headings">
          <div class="saved-name">${esc(calc.name || 'Untitled')}</div>
          <div class="saved-meta">
            ${esc([calc.pastureName, forage].filter(Boolean).join(' · '))}
            ${calc.pastureName || forage ? '<br />' : ''}
            ${esc(goals)} · saved ${esc(shortDate(calc.updatedAt))}
          </div>
        </div>
      </div>
      <div class="saved-figs">${figures.join('<br />')}</div>
      <!-- Pinned to the bottom of the card by .saved-actions{margin-top:auto},
           so a row with two figures and a row with none still line their
           buttons up with each other. -->
      <div class="saved-actions">
        <button type="button" class="tip" data-action="open-calc" data-id="${esc(calc.id)}">Open</button>
        <button type="button" class="tip" data-action="edit-calc" data-id="${esc(calc.id)}">Edit</button>
        <button type="button" class="tip alt" data-action="duplicate-calc" data-id="${esc(calc.id)}">Duplicate</button>
        <button type="button" class="tip danger" data-action="delete-calc" data-id="${esc(calc.id)}">Delete</button>
      </div>
    </div>`
}

function shortDate(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'recently' : d.toLocaleDateString()
}

/* ─────────────────────────────── dialogs ───────────────────────────────── */

/**
 * Name, pasture, and color. ONE dialog, used by Save, by "Edit saved" in the
 * sticky bar, and by Edit on a card in the list.
 *
 * These were three separate dialogs and there was no version of a saved
 * calculation's identity that could be changed in one place: renaming and
 * recolouring meant opening two, and the pasture could not be changed at all.
 *
 * Name and pasture share a row on a desktop because they are the same kind of
 * answer, and the swatches go below because eleven circles do not belong in a
 * column beside a text box.
 */
export function openSaveDialog(calc, onSave, { title = 'Save calculation', confirm = 'Save' } = {}) {
  let tag = TAGS.includes(calc.tag) ? calc.tag : ''

  const body = openModal(
    title,
    `<div class="field-row">
       <div class="field">
         <div class="field-label"><label for="save-name">Name</label></div>
         <input id="save-name" type="text" value="${esc(calc.name || '')}"
           placeholder="North pasture, June" />
       </div>
       <div class="field">
         <div class="field-label"><label for="save-pasture">Pasture (optional)</label></div>
         <input id="save-pasture" type="text" value="${esc(calc.pastureName || '')}"
           placeholder="North quarter" />
       </div>
     </div>
     <div class="field">
       <div class="field-label"><span>Color (optional)</span></div>
       ${swatchGrid(tag)}
     </div>
     <p class="modal-err" hidden></p>
     <div class="step-nav">
       <div class="spacer"></div>
       <button type="button" class="btn-main" data-save-confirm>${esc(confirm)}</button>
     </div>`
  )

  const name = body.querySelector('#save-name')
  name.focus()
  name.select()

  body.addEventListener('click', (e) => {
    const swatch = e.target.closest('[data-tag]')
    if (!swatch) return
    tag = swatch.dataset.tag
    for (const b of body.querySelectorAll('[data-tag]')) {
      b.setAttribute('aria-pressed', String(b.dataset.tag === tag))
    }
  })

  const submit = () => {
    const value = name.value.trim()
    if (!value) {
      modalError('Give this calculation a name so you can find it again.')
      name.focus()
      return
    }
    onSave(value, body.querySelector('#save-pasture').value.trim(), tag)
  }

  body.querySelector('[data-save-confirm]').addEventListener('click', submit)
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  })
}

/** Edit a record in the list. Same dialog, different words on the button. */
export function openEditDialog(calc, onSave) {
  openSaveDialog(calc, onSave, { title: 'Edit calculation', confirm: 'Save changes' })
}

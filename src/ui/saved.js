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
import { infoButton } from './fields.js'
import { openModal, modalError } from './modals.js'
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
  const terms = filterTerms(filter)
  const filtering = terms.length > 0
  const shown = filtering ? list.filter((c) => matches(c, terms)) : list

  if (!list.length) {
    return `
      <div class="box">
        ${savedHead('')}
        <p class="empty-note">Nothing saved yet. Work through the calculator and
          press Save to keep a copy you can come back to.</p>
      </div>`
  }

  // The filter and its hint go INSIDE the head rather than under it. They are
  // siblings of the file controls that way, which is the only arrangement in
  // which CSS `order` can put those controls below the hint on a phone and
  // beside "+ New calculation" on a desktop.
  const filterRow = `
    <div class="saved-tools">
      <input type="search" class="saved-filter" data-saved-filter
        value="${esc(filter)}" placeholder="Filter name, pasture, forage, or date saved"
        aria-label="Filter saved calculations" />
      ${
        filtering
          ? '<button type="button" class="tip" data-action="clear-saved-filter">Clear</button>'
          : ''
      }
    </div>
    <p class="hint saved-filter-hint">Separate words with a comma to list several at once.
      "north, south" shows every card carrying either one.</p>`

  return `
    <div class="box">
      ${savedHead(
        `Saved on this device only. Clearing your browser data removes them.
         ${
           filtering
             ? 'Clear the search box to drag them into a different order.'
             : 'Drag a card by its handle to reorder the list.'
         }`,
        filterRow
      )}

      ${
        shown.length
          ? `<div class="saved-list" data-saved-list>
               ${shown.map((c) => cardFor(c, filtering)).join('')}
             </div>`
          : `<p class="empty-note">No saved calculation matches ${esc(terms.join(', '))}.</p>`
      }
    </div>`
}

/**
 * The title, the hint, and the way out of this tab.
 *
 * "+ New calculation" is here as well as in the chip row because this is where
 * someone lands who has finished one pasture and is starting the next, and the
 * only other route out of the Saved tab is to open a record they did not want.
 */
function savedHead(hint, filterRow = '') {
  return `
    <div class="saved-head">
      <div class="saved-head-text">
        <div class="title">Saved calculations</div>
        ${hint ? `<p class="hint">${esc(hint.replace(/\s+/g, ' ').trim())}</p>` : ''}
      </div>
      <!-- Text links, and to the LEFT of the button. Starting a calculation is
           what somebody comes to this tab to do; a backup is housekeeping they
           do a few times a year, and weight on the page follows that.

           Restore is the one control in the app that can take away work the
           user never opened, so it deliberately does not sit inside the row of
           things that create. Everything it does is behind a confirm naming the
           counts on both sides. -->
      <span class="head-tools">
        <button type="button" class="tip" data-action="backup-all">Export backup</button>
        <button type="button" class="tip" data-action="restore-all">Restore backup</button>
        <button type="button" class="tip" data-action="upload-calc">Upload a calculation</button>
        ${infoButton('backupFile', 'a backup')}
      </span>
      <button type="button" class="btn-add btn-add-inline saved-new" data-action="new-calc">
        + New calculation
      </button>
      ${filterRow}
    </div>`
}

/**
 * The filter's words. A comma separates them and ANY one of them matching is
 * enough.
 *
 * The box already narrows: every character typed hides more cards. The comma is
 * for the other job, pulling two pastures up beside each other to compare them,
 * which nothing else on this tab does. Requiring all of the words instead would
 * be a second way to do the thing typing already does.
 *
 * Exported so the tests can state the rule directly rather than through markup.
 */
export function filterTerms(filter) {
  return String(filter ?? '')
    .toLowerCase()
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Everything on the card that a producer would think to search by.
 *
 * The date is matched as it is DISPLAYED, not as it is stored. Someone typing
 * "2026" or "8/12" is reading the line on the card, and the ISO timestamp
 * underneath it would match neither of those the way they expect.
 */
function matches(calc, terms) {
  const forage =
    calc.forageType === MIXED.id ? MIXED.label : forageById(calc.forageType)?.label ?? ''
  const hay = [calc.name, calc.pastureName, forage, shortDate(calc.updatedAt)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return terms.some((t) => hay.includes(t))
}

function cardFor(calc, filtering) {
  const res = calc.results ?? {}
  // The goals are NOT listed here. Every one of them is a labelled figure two
  // lines further down, so naming them first said the same thing twice in a
  // card whose whole problem is height.
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
            ${esc(
              [calc.pastureName, forage, `saved ${shortDate(calc.updatedAt)}`]
                .filter(Boolean)
                .join(' · ')
            )}
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
        <button type="button" class="tip" data-action="save-as" data-id="${esc(calc.id)}">Save as</button>
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
     <!-- Centred, not pushed right. There is one control on this row and
          nothing on the other end of it for it to be balanced against. -->
     <div class="step-nav step-nav--modal">
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

/**
 * The four ways a saved calculation leaves the app.
 *
 * A menu rather than four more buttons on the card. The card already carries
 * five, and these are all one answer to one question, which is what a menu is
 * for. It is the shared modal rather than a dropdown, so it gets the focus trap
 * and the Escape handling for nothing and does not have to be positioned inside
 * a grid of cards that reflows at every width.
 *
 * Each choice says what the file is FOR. "PNG, CSV, JSON" names three formats,
 * and somebody who wants to text a picture of the answer to their neighbour is
 * not choosing between formats.
 *
 * No listeners are wired here. Every button carries a `data-action` and the
 * delegated handler in main.js is on `document`, which the overlay is part of.
 */
export function openSaveAsDialog(calc) {
  openModal(
    `Save "${calc.name || 'Untitled'}" as`,
    `<div class="save-as">
      ${saveAsItem(calc.id, 'save-as-png', 'Image', 'A picture of the calculation answers and the figures behind them.')}
      ${saveAsItem(calc.id, 'save-as-csv', 'Spreadsheet', 'Every figure entered and every figure worked out, as a CSV. Opens in Excel.')}
      ${saveAsItem(calc.id, 'save-as-print', 'Print or PDF', 'Opens this calculation where you can send it to your printer or save it as a PDF.')}
      ${saveAsItem(calc.id, 'save-as-json', 'Calculation file', 'The calculation itself, to move to another device or give to somebody else. Bring it back to the saved list with "Upload a calculation".')}
    </div>`
  )
}

function saveAsItem(id, action, title, body) {
  return `
    <button type="button" class="save-as-item" data-action="${esc(action)}" data-id="${esc(id)}">
      <span class="save-as-title">${esc(title)}</span>
      <span class="save-as-body">${esc(body)}</span>
    </button>`
}

/**
 * The Saved tab.
 *
 * A calculation is worth keeping per pasture per season, so the list is built
 * for comparing a handful of them rather than filing hundreds. Colour tags
 * stand in for folders: a label, not a container, so nothing can be orphaned.
 */

import { esc, FORMATTERS } from './format.js'
import { openModal, closeModal, modalError } from './modals.js'
import { GOALS } from '../calc.js'
import { forageById, MIXED } from '../data/forage.js'

/** The twelve swatches from the shared design system. Red is not on offer. */
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
  'grey',
]

export function renderSaved(list) {
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
      <p class="hint">Saved on this device only. Clearing your browser data removes them.</p>
      <div class="saved-list">
        ${list.map(cardFor).join('')}
      </div>
    </div>`
}

function cardFor(calc) {
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

  const tag = TAGS.includes(calc.tag) ? calc.tag : 'grey'

  return `
    <div class="saved-card" style="border-left-color: var(--fld-${esc(tag)});">
      <div class="saved-name">${esc(calc.name || 'Untitled')}</div>
      <div class="saved-meta">
        ${esc([calc.pastureName, forage].filter(Boolean).join(' · '))}
        ${calc.pastureName || forage ? '<br />' : ''}
        ${esc(goals)} · saved ${esc(shortDate(calc.updatedAt))}
      </div>
      <div class="saved-figs">${figures.join('<br />')}</div>
      <div class="saved-actions">
        <button type="button" class="tip" data-action="open-calc" data-id="${esc(calc.id)}">Open</button>
        <button type="button" class="tip" data-action="rename-calc" data-id="${esc(calc.id)}">Rename</button>
        <button type="button" class="tip alt" data-action="tag-calc" data-id="${esc(calc.id)}">Colour</button>
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
 * Ask for a name before saving.
 *
 * A pasture name and a date are offered because "My grazing calculation" three
 * times over is the state this list exists to avoid.
 */
export function openSaveDialog(calc, onSave) {
  const body = openModal(
    'Save calculation',
    `<div class="field">
       <div class="field-label"><label for="save-name">Name</label></div>
       <input id="save-name" type="text" value="${esc(calc.name || '')}"
         placeholder="North pasture, June" />
     </div>
     <div class="field">
       <div class="field-label"><label for="save-pasture">Pasture (optional)</label></div>
       <input id="save-pasture" type="text" value="${esc(calc.pastureName || '')}"
         placeholder="North quarter" />
     </div>
     <div class="step-nav">
       <div class="spacer"></div>
       <button type="button" class="btn-main" data-save-confirm>Save</button>
     </div>`
  )

  const name = body.querySelector('#save-name')
  name.focus()
  name.select()

  const submit = () => {
    const value = name.value.trim()
    if (!value) {
      modalError('Give this calculation a name so you can find it again.')
      name.focus()
      return
    }
    onSave(value, body.querySelector('#save-pasture').value.trim())
  }

  body.querySelector('[data-save-confirm]').addEventListener('click', submit)
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  })
}

export function openTagDialog(current, onPick) {
  const body = openModal(
    'Colour label',
    `<p class="hint">A colour to tell this pasture apart in the list.</p>
     <div class="goal-grid">
       ${TAGS.map(
         (t) => `<button type="button" class="pick" data-tag="${esc(t)}"
           style="border-left: 6px solid var(--fld-${esc(t)}); background: var(--fld-${esc(
             t
           )}-bg);">
           <span class="pick-title" style="gap:0">${esc(t[0].toUpperCase() + t.slice(1))}${
             t === current ? ' &#10003;' : ''
           }</span>
         </button>`
       ).join('')}
     </div>
     <div class="step-nav">
       <button type="button" class="tip" data-tag="">Remove colour</button>
     </div>`
  )

  body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tag]')
    if (!btn) return
    onPick(btn.dataset.tag)
    closeModal()
  })
}

export function openRenameDialog(calc, onRename) {
  const body = openModal(
    'Rename calculation',
    `<div class="field">
       <div class="field-label"><label for="rename-name">Name</label></div>
       <input id="rename-name" type="text" value="${esc(calc.name || '')}" />
     </div>
     <div class="step-nav">
       <div class="spacer"></div>
       <button type="button" class="btn-main" data-rename-confirm>Rename</button>
     </div>`
  )

  const input = body.querySelector('#rename-name')
  input.focus()
  input.select()

  const submit = () => {
    const value = input.value.trim()
    if (!value) {
      modalError('A calculation needs a name.')
      return
    }
    onRename(value)
  }

  body.querySelector('[data-rename-confirm]').addEventListener('click', submit)
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  })
}

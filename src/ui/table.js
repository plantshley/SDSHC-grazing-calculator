/**
 * The dry matter chart, as a modal.
 *
 * Two jobs, one component:
 *   - Reference, opened from the `?` beside the growth stage picker. The cell
 *     currently in use is marked.
 *   - Picker, when the forage type is "Mixed or not sure". Every cell is a
 *     button, because a mixed stand has no single row to filter down to.
 *
 * Both read data/forage.js. A percentage must never be written into markup
 * here: this is a view of Exhibit 4-2, not a second copy of it.
 */

import { esc } from './format.js'
import { openModal } from './modals.js'
import { photoThumb, registerPhotoSet } from './photo.js'
import {
  FORAGE_TYPES,
  STAGES_BY_GROUP,
  STAGE_PHOTOS,
  GROUP_LABELS,
  typesInGroup,
  stagesFor,
} from '../data/forage.js'

/**
 * @param {object} opts
 * @param {string|null} opts.group    'grass', 'forb', or null for both
 * @param {string} [opts.typeId]      the row currently in use
 * @param {string} [opts.stageKey]    the cell currently in use
 * @param {boolean} [opts.pickable]   render cells as buttons
 * @param {string} [opts.path]        where a picked cell is written
 */
export function openDryMatterTable({
  group = null,
  typeId = '',
  stageKey = '',
  pickable = false,
  path = '',
} = {}) {
  const groups = group ? [group] : ['grass', 'forb']

  const html = `
    <p class="hint">Percentage of air-dry matter in harvested plant material at various stages of growth.</p>
    ${groups.map((g) => tableFor(g, { typeId, stageKey, pickable, path })).join('')}
    ${pickable ? '<p class="hint">Tap any percentage to use it.</p>' : ''}
    <p class="modal-source">NRPH Exhibit 4-2. National Range and Pasture Handbook, NRCS, September 1997.</p>`

  openModal('Dry matter by growth stage', html, { wide: true })
}

function tableFor(group, { typeId, stageKey, pickable, path }) {
  const stages = STAGES_BY_GROUP[group]
  const types = typesInGroup(group)

  return `
    <h3 class="sub-title">${esc(GROUP_LABELS[group])}</h3>
    <div class="tbl-scroll">
      <table class="tbl">
        <thead>
          <tr>
            <th scope="col">Forage type</th>
            ${stages
              .map(
                (s) =>
                  `<th scope="col" class="num">${esc(s.label)}<span class="th-desc">${esc(
                    s.desc
                  )}</span></th>`
              )
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${types.map((t) => rowFor(t, stages, { typeId, stageKey, pickable, path })).join('')}
        </tbody>
      </table>
    </div>`
}

function rowFor(type, stages, { typeId, stageKey, pickable, path }) {
  const cells = stages
    .map((s, i) => {
      const picked = type.id === typeId && s.key === stageKey
      const pct = type.dm[i]
      const inner = pickable
        ? `<button type="button" class="cell" data-action="pick-cell"
             data-path="${esc(path)}" data-type-id="${esc(type.id)}" data-stage-key="${esc(s.key)}"
             aria-label="${esc(`${type.label}, ${s.label}, ${pct} percent`)}">${pct}%</button>`
        : `<span class="cell">${pct}%</span>`
      return `<td class="num${picked ? ' picked' : ''}">${inner}</td>`
    })
    .join('')

  return `
    <tr>
      <th scope="row" class="rowhead">
        ${esc(type.label)}
        <span>${esc(type.species.join(', '))}</span>
      </th>
      ${cells}
    </tr>`
}

/* ───────────────────────── growth stage photos ─────────────────────────── */

/**
 * Register the stage photos for a forage type and return the set id.
 *
 * The set is the five stages of whichever species was photographed for this
 * type's group, so the label says which species is pictured. Pretending a photo
 * of big bluestem is a photo of the user's own sideoats grama would be worse
 * than saying which it is.
 */
export function registerStageSet(typeId) {
  const stages = stagesFor(typeId)
  if (!stages.length) return null

  const type = FORAGE_TYPES.find((t) => t.id === typeId)
  const species = STAGE_PHOTOS[type.photoSet]?.species || ''
  const setId = `stages:${typeId}`

  registerPhotoSet(
    setId,
    stages.map((s) => ({
      photo: s.photo,
      title: 'Growth stages',
      label: s.label,
      sublabel: `${s.desc}. ${s.pct}% dry matter.`,
      placeholder: `Photo coming soon: ${species || type.label} at ${s.label.toLowerCase()}`,
    }))
  )
  return setId
}

/** A thumbnail strip for the stage picker, shown behind the photos toggle. */
export function stageThumb(typeId, stage) {
  const setId = registerStageSet(typeId)
  if (!setId) return ''
  return photoThumb(stage.photo, {
    setId,
    index: stage.index,
    label: stage.label,
    className: 'stage-photo',
  })
}

/**
 * Register the seven forage identification photos as one set, so the viewer can
 * be walked left and right through the whole chart rather than opening one
 * photo at a time.
 */
export function registerForageSet() {
  const setId = 'forage-types'
  registerPhotoSet(
    setId,
    FORAGE_TYPES.map((t) => ({
      photo: t.photo,
      title: 'Forage types',
      label: t.label,
      sublabel: t.species.join(', '),
      placeholder: `Photo coming soon: ${t.label}`,
    }))
  )
  return setId
}

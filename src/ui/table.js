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
      // The species is named on every stage, not once at the top, because the
      // viewer can be entered on any of the five and left again from any of
      // them. A photo of one grass standing in for another has to say so
      // wherever it is looked at.
      sublabel: `${s.desc}. ${s.pct}% dry matter.${
        s.photo && species ? ` Pictured: ${species.toLowerCase()}.` : ''
      }`,
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
 * Register the forage identification photos as one set, so the viewer can be
 * walked left and right through the whole chart rather than opening one photo
 * at a time.
 *
 * A type may carry more than one photo, so the set is FLATTENED and the caller
 * is handed back an `indexOf` rather than being left to assume that card 3 is
 * item 3. Getting that wrong opens the viewer on somebody else's plant.
 *
 * `current` is the type already chosen. It is passed in rather than read from
 * state here because this module has no business knowing about the working
 * calculation; it turns the gallery into a picker, which is the whole point of
 * looking at these photos side by side.
 */
export function registerForageSet(current = '') {
  const setId = 'forage-types'
  const first = new Map()
  const items = []

  for (const t of FORAGE_TYPES) {
    const photos = t.photos?.length ? t.photos : [null]
    first.set(t.id, items.length)
    photos.forEach((photo, i) => {
      items.push({
        photo,
        title: 'Forage types',
        label: t.label,
        sublabel:
          photos.length > 1
            ? `${t.species.join(', ')} (${i + 1} of ${photos.length})`
            : t.species.join(', '),
        placeholder: `Photo coming soon: ${t.label}`,
        pick: {
          action: 'pick-forage',
          value: t.id,
          label: 'Use this type',
          chosenLabel: 'Your forage type',
          current: t.id === current,
        },
      })
    })
  }

  registerPhotoSet(setId, items)
  return { setId, indexOf: (typeId) => first.get(typeId) ?? 0 }
}

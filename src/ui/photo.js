/**
 * Thumbnails and the full photo viewer.
 *
 * Built on the modal from modals.js, which already provides the overlay, the
 * focus trap, Escape, the scroll lock and focus restore. This adds zoom, pan,
 * and moving between the photos in a set.
 *
 * The label bar lives OUTSIDE the zoom and pan transform, so it neither scales
 * nor slides away. Someone looking at a close-up of a seed head still needs to
 * be told which stage it is.
 *
 * Every photo slot in data/ is null until SDSHC has real photography. A null
 * renders a labelled placeholder with the same shape and the same tap target,
 * and opens the same viewer, so nothing about the layout or the interaction
 * changes when images arrive.
 */

import { esc } from './format.js'
import { openModal, addModalKeyHook } from './modals.js'

/**
 * Photo sets, registered by the module that renders their thumbnails.
 *
 * A delegated click gives us a string, not an object, so the button carries a
 * set id and an index and the viewer looks the set up here. Re-registering the
 * same id replaces it, which is what a re-render should do.
 */
const sets = new Map()

export function registerPhotoSet(id, items) {
  sets.set(id, items)
  return id
}

const MAX_ZOOM = 4
const MIN_ZOOM = 1

/** Resolve a data-file path against the deployed base path. */
function src(photo) {
  const base = import.meta.env?.BASE_URL ?? '/'
  const path = String(photo.src ?? '')
  return /^(https?:)?\/\//.test(path) ? path : `${base}${path.replace(/^\//, '')}`
}

/**
 * A tappable thumbnail, or a placeholder when there is no photo yet.
 *
 * Rendered as a <button> so it is reachable by keyboard and activates on Enter
 * and Space without any of that being rebuilt.
 */
export function photoThumb(photo, { setId, index, label, className = '' } = {}) {
  const inner = photo
    ? `<img src="${esc(src(photo))}" alt="${esc(photo.alt || label || '')}" loading="lazy" />`
    : `<span class="photo-ph">${esc(label || 'Photo coming soon')}</span>`

  return `<button type="button" class="photo-btn ${esc(className)}"
    data-action="open-photo" data-photo-set="${esc(setId)}" data-photo-index="${index}"
    aria-label="${esc(label ? `View photo: ${label}` : 'View photo')}">${inner}</button>`
}

/* ─────────────────────────────── the viewer ────────────────────────────── */

let view = null

/**
 * @param {string} setId  a set registered with registerPhotoSet
 * @param {number} index  which item to open on
 */
export function openPhoto(setId, index = 0) {
  const items = sets.get(setId)
  if (!items?.length) return

  const start = Math.min(Math.max(Number(index) || 0, 0), items.length - 1)

  const body = openModal(
    items[start].title || 'Photo',
    `<div class="pv">
       <div class="pv-stage" data-pv-stage></div>
       <div class="pv-bar">
         <div class="pv-meta">
           <div class="pv-label" data-pv-label></div>
           <div class="pv-sub" data-pv-sub></div>
           <div class="pv-credit" data-pv-credit></div>
         </div>
         <div class="pv-pick" data-pv-pick hidden></div>
         <div class="pv-controls">
           <button type="button" class="pv-btn" data-pv="zoom-out" aria-label="Zoom out">&minus;</button>
           <button type="button" class="pv-btn" data-pv="zoom-in" aria-label="Zoom in">+</button>
           <button type="button" class="pv-btn" data-pv="prev" aria-label="Previous photo">&#8249;</button>
           <span class="pv-count" role="status" aria-live="polite" data-pv-count></span>
           <button type="button" class="pv-btn" data-pv="next" aria-label="Next photo">&#8250;</button>
         </div>
       </div>
     </div>`,
    { wide: true }
  )

  view = {
    items,
    i: start,
    scale: 1,
    x: 0,
    y: 0,
    pointers: new Map(),
    pinchStart: 0,
    scaleStart: 1,
    stage: body.querySelector('[data-pv-stage]'),
    el: body,
  }

  wire(body)
  show(start)

  // Arrows belong to the viewer and only while it is open, so they cannot
  // collide with anything on the page behind. The hook is dropped on close.
  addModalKeyHook((e) => {
    if (!view) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      step(1)
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      zoom(view.scale * 1.5)
    } else if (e.key === '-') {
      e.preventDefault()
      zoom(view.scale / 1.5)
    }
  })
}

function show(i) {
  if (!view) return
  const item = view.items[i]
  view.i = i

  view.stage.innerHTML = item.photo
    ? `<img src="${esc(src(item.photo))}" alt="${esc(item.photo.alt || item.label || '')}" draggable="false" />`
    : `<span class="photo-ph">${esc(item.placeholder || 'Photo coming soon')}</span>`

  view.el.querySelector('[data-pv-label]').textContent = item.label || ''
  view.el.querySelector('[data-pv-sub]').textContent = item.sublabel || ''
  view.el.querySelector('[data-pv-credit]').textContent = item.photo?.credit || ''
  view.el.querySelector('[data-pv-count]').textContent = `${i + 1} of ${view.items.length}`

  const single = view.items.length < 2
  view.el.querySelector('[data-pv="prev"]').disabled = single
  view.el.querySelector('[data-pv="next"]').disabled = single

  // A set whose items carry `pick` is a chooser as well as a gallery, so the
  // photo the user is looking at can be the one they take. The button is built
  // as ordinary [data-action] markup and handled by main.js's delegated click,
  // the same as if it were on the page behind.
  const pick = view.el.querySelector('[data-pv-pick]')
  if (item.pick) {
    pick.hidden = false
    pick.innerHTML = item.pick.current
      ? `<span class="pv-picked">&#10003; ${esc(item.pick.chosenLabel || 'Selected')}</span>`
      : `<button type="button" class="btn-main" data-action="${esc(item.pick.action)}"
           data-value="${esc(item.pick.value)}">${esc(item.pick.label || 'Select')}</button>`
  } else {
    pick.hidden = true
    pick.innerHTML = ''
  }

  // A new photo starts unzoomed. Carrying a 3x zoom and an offset across to a
  // different image lands the viewer somewhere meaningless.
  reset()
}

function step(delta) {
  if (!view || view.items.length < 2) return
  const n = view.items.length
  show((view.i + delta + n) % n)
}

function reset() {
  if (!view) return
  view.scale = 1
  view.x = 0
  view.y = 0
  apply()
}

function apply() {
  if (!view) return
  const img = view.stage.querySelector('img')
  const zoomed = view.scale > 1
  view.stage.classList.toggle('zoomed', zoomed)
  if (!img) return
  img.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
  const canZoom = !!img
  view.el.querySelector('[data-pv="zoom-in"]').disabled = !canZoom || view.scale >= MAX_ZOOM
  view.el.querySelector('[data-pv="zoom-out"]').disabled = !canZoom || view.scale <= MIN_ZOOM
}

function zoom(next) {
  if (!view) return
  const clamped = Math.min(Math.max(next, MIN_ZOOM), MAX_ZOOM)
  view.scale = clamped
  if (clamped === MIN_ZOOM) {
    view.x = 0
    view.y = 0
  } else {
    clampPan()
  }
  apply()
}

/**
 * Keep the image overlapping the stage.
 *
 * Without this a pan can throw a zoomed photo entirely off the visible area,
 * leaving an empty box and no obvious way back other than closing the viewer.
 */
function clampPan() {
  if (!view) return
  const img = view.stage.querySelector('img')
  if (!img) return
  const stage = view.stage.getBoundingClientRect()
  // The rendered size at scale 1, which is what the transform multiplies.
  const baseW = img.offsetWidth
  const baseH = img.offsetHeight
  const overflowX = Math.max(0, (baseW * view.scale - stage.width) / 2)
  const overflowY = Math.max(0, (baseH * view.scale - stage.height) / 2)
  view.x = Math.min(Math.max(view.x, -overflowX), overflowX)
  view.y = Math.min(Math.max(view.y, -overflowY), overflowY)
}

function wire(body) {
  const stage = body.querySelector('[data-pv-stage]')

  body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pv]')
    if (!btn || !view) return
    const what = btn.dataset.pv
    if (what === 'prev') step(-1)
    else if (what === 'next') step(1)
    else if (what === 'zoom-in') zoom(view.scale * 1.5)
    else if (what === 'zoom-out') zoom(view.scale / 1.5)
  })

  stage.addEventListener('dblclick', (e) => {
    e.preventDefault()
    if (!view) return
    zoom(view.scale > 1 ? 1 : 2)
  })

  stage.addEventListener(
    'wheel',
    (e) => {
      if (!view || !stage.querySelector('img')) return
      e.preventDefault()
      zoom(view.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12))
    },
    { passive: false }
  )

  stage.addEventListener('pointerdown', (e) => {
    if (!view || !stage.querySelector('img')) return
    stage.setPointerCapture(e.pointerId)
    view.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (view.pointers.size === 2) {
      view.pinchStart = pointerDistance()
      view.scaleStart = view.scale
    }
    if (view.scale > 1) stage.classList.add('panning')
  })

  stage.addEventListener('pointermove', (e) => {
    if (!view || !view.pointers.has(e.pointerId)) return
    const prev = view.pointers.get(e.pointerId)
    view.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (view.pointers.size === 2) {
      const dist = pointerDistance()
      if (view.pinchStart > 0) zoom(view.scaleStart * (dist / view.pinchStart))
      return
    }

    if (view.scale > 1) {
      view.x += e.clientX - prev.x
      view.y += e.clientY - prev.y
      clampPan()
      apply()
    }
  })

  const release = (e) => {
    if (!view) return
    view.pointers.delete(e.pointerId)
    if (view.pointers.size < 2) view.pinchStart = 0
    if (!view.pointers.size) stage.classList.remove('panning')
  }
  stage.addEventListener('pointerup', release)
  stage.addEventListener('pointercancel', release)

  // A swipe moves between photos, but only while unzoomed. Once zoomed, a
  // horizontal drag is a pan and stealing it would make close-ups unusable.
  let swipeFrom = null
  stage.addEventListener('pointerdown', (e) => {
    swipeFrom = view && view.scale === 1 ? { x: e.clientX, y: e.clientY } : null
  })
  stage.addEventListener('pointerup', (e) => {
    if (!swipeFrom || !view || view.scale !== 1) return
    const dx = e.clientX - swipeFrom.x
    const dy = e.clientY - swipeFrom.y
    swipeFrom = null
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1)
  })
}

function pointerDistance() {
  const [a, b] = [...view.pointers.values()]
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Called by main.js when the modal closes, so the next open starts clean. */
export function releasePhotoViewer() {
  view = null
}

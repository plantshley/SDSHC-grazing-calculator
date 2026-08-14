/**
 * Modals.
 *
 * Ported from SDSHC-farm-budget with its focus trap, Escape handling, scroll
 * lock and focus restore intact. The one rule that governs everything here:
 *
 *   Tapping a `?` must never alter a value.
 *
 * openInfo() and openGuide() are read-only by construction. openModal() is
 * exported for callers that need the component for their own content (the dry
 * matter table, the photo viewer, save and rename), and none of them weaken
 * that rule.
 */

import { esc } from './format.js'
import { DEFINITIONS } from '../data/definitions.js'

let overlay = null
let lastFocused = null

/** Extra keydown handlers, registered while a modal owns the screen. */
const keyHooks = new Set()

export function addModalKeyHook(fn) {
  keyHooks.add(fn)
  return () => keyHooks.delete(fn)
}

function ensureOverlay() {
  // Rebuild unless the cached node is still live in THIS document. isConnected
  // alone is not enough: it stays true for a node attached to a previous
  // document, and a stale overlay silently swallows every modal.
  if (overlay?.isConnected && overlay.ownerDocument === document) return overlay
  overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <div class="modal-head-row">
          <h2 class="modal-title" id="modalTitle"></h2>
          <button type="button" class="modal-close" aria-label="Close">&times;</button>
        </div>
        <p class="modal-err" role="status" aria-live="polite" hidden></p>
      </div>
      <div class="modal-body"></div>
    </div>`
  overlay.setAttribute('aria-labelledby', 'modalTitle')

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.modal-close')) closeModal()
  })

  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('open')) return
    if (e.key === 'Escape') {
      closeModal()
      return
    }
    if (e.key === 'Tab') {
      trapFocus(e)
      return
    }
    // Arrow keys belong to whatever is open (the photo viewer), and only while
    // it is open, so they cannot collide with the page behind.
    for (const fn of keyHooks) fn(e)
  })

  document.body.appendChild(overlay)
  return overlay
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/**
 * Keep Tab inside the dialog while it is open.
 *
 * The overlay claims `aria-modal="true"`, and without this that claim is false:
 * Tab walks out of the panel into the form behind, which is still live and
 * still announced. Someone using a screen reader would be told they are in a
 * dialog and then find themselves editing a sample weight.
 */
function trapFocus(e) {
  const focusable = [...overlay.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  )
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  } else if (!overlay.contains(document.activeElement)) {
    // Focus escaped some other way, a click on the page behind say. Pull it back.
    e.preventDefault()
    first.focus()
  }
}

/** Returns the body element so a caller can wire its own controls up. */
export function openModal(title, bodyHtml, { wide = false } = {}) {
  const el = ensureOverlay()
  // Only remember the opener if this is not a modal replacing another one, or
  // closing the second would restore focus into markup that no longer exists.
  if (!el.classList.contains('open')) lastFocused = document.activeElement
  el.querySelector('.modal-title').textContent = title
  el.querySelector('.modal').classList.toggle('modal--wide', wide)

  // A FRESH body element every time, not innerHTML on the old one.
  //
  // Callers wire their own controls by adding a listener to the element this
  // returns. Reusing the node keeps every one of those listeners alive for the
  // life of the page, so the save dialog's colour swatches were also being
  // handled by the colour dialog opened ten minutes earlier: clicking one
  // re-tagged whichever card that dialog had been about, and closed the modal
  // out from under the save. Replacing the node drops the listeners with it.
  const old = el.querySelector('.modal-body')
  const body = document.createElement('div')
  body.className = 'modal-body'
  body.innerHTML = bodyHtml
  old.replaceWith(body)
  const err = el.querySelector('.modal-err')
  err.textContent = ''
  err.hidden = true
  el.classList.add('open')
  // The modal scrolls its own body. Freezing the page underneath stops a scroll
  // gesture that runs past the end of the modal from carrying on into the form
  // behind it and losing the user's place.
  document.body.classList.add('modal-open')
  el.querySelector('.modal-close').focus()
  return body
}

export function closeModal() {
  if (!overlay) return
  overlay.classList.remove('open')
  overlay.querySelector('.modal-body').innerHTML = ''
  document.body.classList.remove('modal-open')
  keyHooks.clear()
  // Return focus to whatever opened the modal, so keyboard users are not dumped
  // back at the top of the document.
  if (lastFocused?.isConnected) lastFocused.focus()
  lastFocused = null
}

export function modalError(message) {
  if (!overlay) return
  const err = overlay.querySelector('.modal-err')
  err.textContent = message || ''
  err.hidden = !message
}

/* ─────────────────────────── `?` — read only ───────────────────────────── */

/** One or more definitions. Never writes anything. */
export function openInfo(keys, title) {
  const list = Array.isArray(keys) ? keys : [keys]
  const entries = list.map((k) => DEFINITIONS[k]).filter(Boolean)
  if (!entries.length) return

  // A card's `?` opens several definitions at once. Flat, that is several
  // screens of prose to scroll past to reach the term actually tapped for.
  // Folded, it is a list of terms to pick from, all shut so the list is the
  // first thing seen. A single definition is not a list, so it stays open:
  // folding one heading means tapping `?` and then tapping again to read it.
  const fold = entries.length > 1
  const heading = title || entries[0].title

  const html = entries
    .map((d) => {
      const paras = d.body.map((p) => `<p>${esc(p)}</p>`).join('')
      const src = d.source ? `<p class="modal-source">${esc(d.source)}</p>` : ''
      // A single definition takes its own title into the modal head, so an <h3>
      // saying the same word again is the first line of every one of these
      // panels wasted. It is kept only for the case where the two differ, which
      // is a sectionInfo() called with one key.
      const h3 = d.title === heading ? '' : `<h3>${esc(d.title)}</h3>`
      return fold
        ? `<details class="def def-fold">
             <summary>${esc(d.title)}</summary>
             <div class="def-fold-body">${paras}${src}</div>
           </details>`
        : `<section class="def">
             ${h3}${paras}${src}
           </section>`
    })
    .join('')

  openModal(heading, html)
}

/**
 * Free-form explanatory content, same read-only component.
 *
 * `collapsible` renders each section as a native <details>, closed by default.
 * A long guide opened on a phone is otherwise a wall of text. <details> rather
 * than a hand-rolled accordion because the browser already gives it keyboard
 * support, the right ARIA semantics, and the ability to be forced open by CSS
 * for printing.
 */
export function openGuide(title, sections, { collapsible = false, firstOpen = false } = {}) {
  const html = sections
    .map((s, i) => {
      const inner = `
        ${(s.body ?? []).map((p) => `<p>${esc(p)}</p>`).join('')}
        ${s.steps?.length ? `<ol>${s.steps.map((li) => `<li>${esc(li)}</li>`).join('')}</ol>` : ''}`

      if (!collapsible || !s.heading) {
        return `<section class="def">
          ${s.heading ? `<h3>${esc(s.heading)}</h3>` : ''}${inner}
        </section>`
      }

      return `<details class="def def-fold"${firstOpen && i === 0 ? ' open' : ''}>
        <summary>${esc(s.heading)}</summary>
        <div class="def-fold-body">${inner}</div>
      </details>`
    })
    .join('')
  openModal(title, html)
}

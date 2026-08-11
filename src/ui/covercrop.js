/**
 * The Grazing Cover Crops tab.
 *
 * For now this embeds the existing JotForm. A native version built on the same
 * calculation engine is planned: steps 3 to 5 of the perennial worksheet are
 * the same arithmetic as steps 2 to last of the cover crop worksheet, which is
 * why demand(), daysFrom(), acresFrom() and animalsFrom() are exported
 * separately from calc.js.
 *
 * The form is on another origin, so a service worker cannot cache it and this
 * tab cannot work offline. That is stated plainly rather than left to fail as
 * a blank white box, because the rest of the app does work offline and the
 * difference is not the user's fault to work out.
 */

const FORM_URL = 'https://form.jotform.com/221745599167065'

export function renderCoverCrop() {
  return `
    <div class="box">
      <div class="title">Grazing Cover Crops</div>
      <p class="hint">The existing SDSHC cover crop calculator. It works out grazing
        days or acres from cover crop height rather than from clipped samples.</p>

      <p class="offline-note" data-cc-offline hidden>
        This form is hosted by JotForm and needs an internet connection, so it cannot
        be used offline. The perennial grazing calculator on the other tab works
        without a connection.
      </p>

      <iframe
        class="cc-frame"
        data-cc-frame
        title="SDSHC Grazing Cover Crop Calculator"
        src="${FORM_URL}"
        loading="lazy"
        allow="geolocation; microphone; camera; fullscreen"
      ></iframe>

      <p class="hint">
        <a href="${FORM_URL}" target="_blank" rel="noopener noreferrer">Open the form in a new tab</a>
        if it does not load here.
      </p>
    </div>`
}

/**
 * Show the offline notice instead of a frame that will never paint.
 *
 * Checked on render and on the online and offline events, because someone can
 * lose signal with the tab already open.
 */
/**
 * Removes the previous tab visit's listeners.
 *
 * The whole page re-renders on every tab switch, so without this each visit
 * would add another pair of window listeners pointing at nodes that no longer
 * exist. The old node is gone but the closure is not, which is a leak that
 * grows for as long as the session lasts.
 */
let unwire = null

export function wireCoverCrop(root) {
  unwire?.()
  unwire = null

  const frame = root.querySelector('[data-cc-frame]')
  const note = root.querySelector('[data-cc-offline]')
  if (!frame || !note) return

  const sync = () => {
    const offline = navigator.onLine === false
    note.hidden = !offline
    frame.hidden = offline
  }

  // A cross-origin frame that fails to load does not reliably fire `error`, so
  // navigator.onLine is the signal that actually arrives.
  frame.addEventListener('error', () => {
    note.hidden = false
    frame.hidden = true
  })

  addEventListener('online', sync)
  addEventListener('offline', sync)
  unwire = () => {
    removeEventListener('online', sync)
    removeEventListener('offline', sync)
  }
  sync()
}

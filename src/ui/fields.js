/**
 * Field markup helpers.
 *
 * Ported from SDSHC-farm-budget. Every input declares `data-path`, the state
 * path it writes to, and one delegated listener in main.js handles all of
 * them, so adding a field never means adding a handler.
 *
 * The contract on help affordances carries over unchanged:
 *   `info` renders a round `?` that opens a definition and NEVER writes.
 *   Anything that writes a value is styled as a text link, never as a `?`.
 */

import { esc } from './format.js'

/**
 * How far one press of a number input's arrow moves the value.
 *
 * The browser's default of 1 is the wrong size for most fields here. A sample
 * weight in grams wants a tenth; a head count wants a whole animal; pasture
 * acres want a whole acre until they don't. `step` also governs VALIDITY: at
 * 0.1 a value of 177.85 is a step mismatch and matches :invalid. That is
 * harmless only because nothing in the stylesheets targets :invalid. Do not add
 * an :invalid rule without revisiting this.
 */
export const STEP = {
  tenth: '0.1',
  whole: '1',
  hundredth: '0.01',
}

/**
 * The label, its `?`, and any aside, side by side but NOT nested.
 *
 * A `<button>` is a labelable element and a `<label>` may not contain one other
 * than the control it labels, so the `?` is a SIBLING of the label rather than
 * inside it. Nesting it makes every field with a definition invalid HTML and
 * leaves each browser to decide what clicking the label does.
 *
 * `o.aside` is raw markup pinned to the right of the row. It is the caller's
 * own HTML and is NOT escaped, so it takes a string built in code and never
 * text a user typed.
 */
function labelRow(id, o) {
  return `
    <div class="field-label">
      <label for="${id}">${esc(o.label)}</label>
      ${o.info ? infoButton(o.info, o.label) : ''}
      ${o.aside ? `<span class="field-aside">${o.aside}</span>` : ''}
    </div>`
}

/**
 * Values destined for a `type="number"` box lose their formatting first.
 *
 * The model deliberately understands "1,200" because an imported calculation
 * can contain one. But the HTML value-sanitisation algorithm for number inputs
 * discards any string that is not a valid float, so that same value renders as
 * an EMPTY box while the totals below it are computed correctly from it. The
 * user sees a blank field they did not leave blank.
 */
function inputValue(value, type) {
  if (type !== 'number') return value ?? ''
  const s = String(value ?? '')
  return s === '' ? '' : s.replace(/[$\s,]/g, '')
}

const idFor = (path) => `f-${String(path).replace(/[.[\]]/g, '-')}`

/**
 * @param {object} o
 * @param {string} o.label
 * @param {string} o.path       state path, e.g. 'demand.animalWeight'
 * @param {string|number} o.value
 * @param {string} [o.type]     'text' | 'number'
 * @param {string} [o.prefix]   shown inside the input frame, left
 * @param {string} [o.suffix]   'lbs', '%', 'ac' — shown inside the frame, right
 * @param {string} [o.info]     definition key for the `?`
 * @param {string} [o.hint]     one line under the box
 * @param {string} [o.aside]    raw markup pinned right of the label row
 */
export function field(o) {
  const id = idFor(o.path)
  // The suffix is drawn OVER the box, so the box has to be told how much of its
  // right-hand end is already taken. Two facts decide that and neither is
  // knowable from CSS: how long the suffix is, and whether the browser is
  // painting a spinner at the right edge. See the .input-wrap block in
  // styles.css — `has-spin` alone is not enough, a one-character `%` and a
  // six-character `lbs/ac` want very different reservations.
  const wrap = [
    'input-wrap',
    o.prefix ? 'has-prefix' : '',
    o.suffix ? 'has-suffix' : '',
    o.type === 'number' ? 'has-spin' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `
    <div class="field">
      ${labelRow(id, o)}
      <div class="${wrap}"${
        o.suffix ? ` style="--suffix-len: ${String(o.suffix).length}"` : ''
      }>
        ${o.prefix ? `<span class="affix prefix">${esc(o.prefix)}</span>` : ''}
        <input
          id="${id}"
          type="${o.type || 'text'}"
          ${o.inputmode ? `inputmode="${o.inputmode}"` : ''}
          ${o.type === 'number' ? `step="${esc(o.step || STEP.tenth)}"` : ''}
          ${o.min !== undefined ? `min="${esc(o.min)}"` : ''}
          data-path="${esc(o.path)}"
          value="${esc(inputValue(o.value, o.type))}"
          placeholder="${esc(o.placeholder ?? '')}"
          ${o.ariaLabel ? `aria-label="${esc(o.ariaLabel)}"` : ''}
        />
        ${o.suffix ? `<span class="affix suffix">${esc(o.suffix)}</span>` : ''}
      </div>
      ${o.hint ? `<p class="hint">${esc(o.hint)}</p>` : ''}
    </div>`
}

/** A number box. inputmode=decimal so phones open the numeric keypad. */
export function numField(o) {
  return field({ ...o, type: 'number', inputmode: 'decimal' })
}

/** A whole-count box: head, days, sample count. */
export function countField(o) {
  return numField({ ...o, step: STEP.whole, min: 0 })
}

/**
 * @param {object} o           as field(), plus:
 * @param {Array<{key: string, label: string}>} o.options
 * @param {string} o.value     the selected key
 * @param {string} [o.placeholder]  rendered as a disabled first option
 */
export function selectField(o) {
  const id = idFor(o.path)
  const has = o.options.some((x) => x.key === o.value)
  return `
    <div class="field">
      ${labelRow(id, o)}
      <select id="${id}" data-path="${esc(o.path)}">
        ${
          o.placeholder
            ? `<option value=""${has ? '' : ' selected'}>${esc(o.placeholder)}</option>`
            : ''
        }
        ${o.options
          .map(
            (x) =>
              `<option value="${esc(x.key)}"${x.key === o.value ? ' selected' : ''}>${esc(
                x.label
              )}</option>`
          )
          .join('')}
      </select>
      ${o.hint ? `<p class="hint">${esc(o.hint)}</p>` : ''}
    </div>`
}

/**
 * A segmented control where every segment NAMES the mode it selects.
 *
 * Not a toggle. A button showing its current mode reads equally well as the
 * mode it would switch you to, so the state and the offer are indistinguishable.
 * Every segment carries the same `data-path` and its own `data-mode`, so the
 * handler writes the mode named rather than flipping to whatever is next, which
 * is the only thing that works once there are three of them.
 *
 * For tests: `querySelector('[data-path="…"]')` finds the FIRST segment, so a
 * click has to name the one it wants, `[data-path="…"][data-mode="pct"]`.
 */
export function modePill(o) {
  return `
    <div class="mode-pill" role="group" aria-label="${esc(o.label)}">
      ${o.modes
        .map(
          (m) => `<button type="button" class="mode-seg" data-action="${esc(
            o.action || 'set-mode'
          )}"
            data-path="${esc(o.path)}" data-mode="${esc(m.key)}"
            aria-pressed="${m.key === o.current}">${esc(m.label)}</button>`
        )
        .join('')}
    </div>`
}

/** The round `?`. Read-only by contract: it opens a definition, nothing else. */
export function infoButton(key, label) {
  return `<button type="button" class="help-btn" data-info="${esc(key)}"
    aria-label="What is ${esc(label)}?" title="What is ${esc(label)}?">?</button>`
}

/** A `?` for a whole card, opening several related definitions at once. */
export function sectionInfo(keys, title) {
  return `<button type="button" class="help-btn" data-info="${esc(keys.join(','))}"
    data-info-title="${esc(title)}" aria-label="About ${esc(title)}"
    title="About ${esc(title)}">?</button>`
}

/**
 * A computed figure.
 *
 * The value is a `[data-out]` placeholder, never a template literal, so
 * updateOutputs() can refresh it without re-rendering the step. `key` names a
 * field on the compute() result and `fmt` names a formatter in FORMATTERS.
 */
export function readout(label, key, opts = {}) {
  // A readout is not a form control, so its caption is a span and the `?` may
  // sit inside it without field()'s labelable-descendant problem.
  return `
    <div class="readout${opts.strong ? ' strong' : ''}">
      <span class="readout-label">
        ${esc(label)}
        ${opts.info ? infoButton(opts.info, label) : ''}
      </span>
      <span class="readout-value" data-out="${esc(key)}" data-fmt="${esc(
        opts.fmt || 'number'
      )}">&mdash;</span>
    </div>`
}

/**
 * A card that is really a checkbox or radio.
 *
 * The control is a visually hidden input INSIDE the label rather than a
 * `<button aria-pressed>`, so keyboard focus, Space to toggle, arrow keys
 * within a radio group, and screen-reader state all come from the browser
 * instead of being rebuilt. app.css draws the card off `:has(input:checked)`.
 *
 * The title and its sub-line share `.pick-body`, so both start at the same left
 * edge; `.pick-box` is a sibling of that column rather than a pseudo-element on
 * the title, which is what lets it centre against the two lines together.
 *
 * `o.noBox` drops the box for cards led by a photo, where a control beside the
 * caption competes with the image. Those get `.pick-flag` instead, a tick in
 * the corner of the chosen card, so selection is never carried by border colour
 * alone either way. The tick is drawn by CSS and the span is empty: a word
 * beside it took a whole line of a card that is already mostly photograph.
 */
export function pickCard(o) {
  return `
    <label class="pick ${esc(o.class || '')}">
      <input type="${o.multi ? 'checkbox' : 'radio'}"
        name="${esc(o.name)}"
        value="${esc(o.value)}"
        data-action="${esc(o.action)}"
        ${o.checked ? 'checked' : ''} />
      ${o.media || ''}
      <span class="pick-row">
        ${o.noBox ? '' : '<span class="pick-box" aria-hidden="true"></span>'}
        <span class="pick-body">
          <span class="pick-title">${esc(o.title)}</span>
          ${o.sub ? `<span class="pick-sub">${esc(o.sub)}</span>` : ''}
        </span>
      </span>
      ${o.noBox ? '<span class="pick-flag" aria-hidden="true"></span>' : ''}
      ${o.extra || ''}
    </label>`
}

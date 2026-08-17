/**
 * Boot, render, and the delegated listeners.
 *
 * Two conventions carried over from SDSHC-farm-budget, and both matter:
 *
 *   1. Inputs declare `data-path` and ONE delegated listener writes by path, so
 *      a new field needs markup only, never its own handler.
 *   2. Any number that changes without the DOM changing shape is a `[data-out]`
 *      placeholder refreshed by updateOutputs(), never a template literal. Steps
 *      that are hidden are still in the DOM, so a figure baked into markup goes
 *      stale the moment an earlier step is edited.
 *
 * The boot block is at the BOTTOM of this file. Everything it touches has to be
 * initialised first, and const bindings are in the temporal dead zone until
 * their declaration is evaluated.
 */

import { compute, GOALS, FRAMES } from './calc.js'
import {
  getCalculation,
  setCalculation,
  newCalculation,
  newMixRow,
  makeId,
  setPath,
  subscribe,
  notify,
  resolved,
  hasSamples,
} from './state.js'
import {
  saveWorking,
  loadWorking,
  clearWorking,
  listCalcs,
  getCalcById,
  saveCalc,
  updateCalcMeta,
  deleteCalc,
  reorderCalcs,
  storageAvailable,
  importCalcJSON,
  importBackupJSON,
  replaceAll,
} from './storage.js'
import {
  applyTheme,
  applyFont,
  toggleTheme,
  setFont,
  getPref,
  setPref,
  setNeedChecked,
  setOpenSteps,
  setStepOpen,
} from './prefs.js'
import {
  downloadCSV,
  downloadPNG,
  printResults,
  downloadCalcJSON,
  downloadBackup,
} from './export.js'

import { esc } from './ui/format.js'
import { openInfo, openGuide, openModal, closeModal } from './ui/modals.js'
import { openPhoto, releasePhotoViewer } from './ui/photo.js'
import { openDryMatterTable } from './ui/table.js'
import { renderSetup, renderChips } from './ui/setup.js'
import { renderStepper } from './ui/stepper.js'
import { renderSteps, howToPanel, STEP_LABELS } from './ui/steps.js'
import { renderResults, renderStickyBar, updateOutputs } from './ui/results.js'
import { renderSaved, openSaveDialog, openEditDialog, openSaveAsDialog } from './ui/saved.js'
import { renderCoverCrop, wireCoverCrop } from './ui/covercrop.js'
import { HOW_TO_SECTIONS } from './data/howto.js'
import { MIXED } from './data/forage.js'

const app = document.querySelector('#app')

/** True while the landing screen is showing rather than the steps. */
let setupOpen = true

/**
 * True once the steps have been opened at least once this session.
 *
 * Pressing Change to check which forage type was picked is not starting over,
 * so coming back lands on the step that was being worked on. Only a genuine
 * first start resets to step 1.
 */
let startedOnce = false

/* ──────────────────────────────── render ───────────────────────────────── */

function render() {
  const calc = getCalculation()
  const tab = getPref('tab')

  // Replacing the markup drops focus to the body, so nothing is being typed into
  // any more. Left standing, a stale flag would hold the spread note back until
  // somebody happened to tap a weight box and leave it again.
  editingSamples = false

  app.innerHTML = `
    ${header(tab)}
    ${tab === 'perennial' ? perennial(calc) : ''}
    ${tab === 'covercrop' ? renderCoverCrop() : ''}
    ${tab === 'saved' ? renderSaved(listCalcs(), savedFilter) : ''}
    ${footer(tab)}`

  if (tab === 'covercrop') wireCoverCrop(app)
  if (tab === 'saved') restoreFilterFocus()
  refresh()
}

/**
 * The Saved tab's search box, held outside the record so typing in it neither
 * marks a calculation as changed nor survives a reload as if it were data.
 */
let savedFilter = ''

/**
 * Typing re-renders the list, which replaces the box being typed into.
 *
 * Rebuilding the input is what keeps its `value` attribute honest for the next
 * render; putting the caret back is what stops the second character of a search
 * landing at the start of the string.
 */
function restoreFilterFocus() {
  if (!savedFilter) return
  const box = app.querySelector('[data-saved-filter]')
  if (!box) return
  box.focus()
  box.setSelectionRange(box.value.length, box.value.length)
}

function header(tab) {
  const tabs = [
    ['perennial', 'Perennial grazing'],
    ['covercrop', 'Cover crops'],
    ['saved', 'Saved'],
  ]
  // The `?` sits at the end of the tab strip rather than beside the title. It
  // is the one control on this row that opens something, and next to the h1 it
  // read as punctuation on the heading.
  return `
    <div class="app-head">
      <h1 class="app-title">Grazing Calculator</h1>
      <div class="app-nav-wrap">
        <nav class="app-nav" role="tablist" aria-label="Calculators">
          ${tabs
            .map(
              ([key, label]) =>
                `<button type="button" class="tab${tab === key ? ' active' : ''}" role="tab"
                  aria-selected="${tab === key}" data-action="set-tab" data-tab="${key}">${esc(
                  label
                )}</button>`
            )
            .join('')}
        </nav>
        <button type="button" class="help-btn help-btn--head" data-action="how-to"
          aria-label="How to use this calculator" title="How to use this calculator">?</button>
      </div>
    </div>`
}

/**
 * The foot of every screen, ported from SDSHC-farm-budget.
 *
 * The privacy line is STATED, not only linked. Somebody is being asked to type
 * their sample weights, their herd size and their acres into a web page at a
 * workshop, often on a borrowed device, and "there is a page about it somewhere"
 * is not the same answer as one sentence they cannot miss. The link opens the
 * full explanation for anyone who wants it, and `.footer button` is hidden when
 * the page is printed, so a printout carries the statement without the controls.
 *
 * NO export links here, unlike farm-budget's copy. Step 5 already carries Save
 * as image, Export CSV and Print, and a card's Save as carries the same four for
 * a stored record. A second set at the foot of the page would act on the WORKING
 * calculation while the Saved tab is showing a list of records that are not it.
 *
 * The cover crops tab gets its own sentence because the blanket one is not true
 * there: that tab is a JotForm on another origin, and submitting it sends what
 * was typed to JotForm. A promise the app cannot keep on one of its three tabs
 * is worse than no promise at all.
 */
function footer(tab) {
  const privacy =
    tab === 'covercrop'
      ? `The cover crop form on this tab is hosted by JotForm, and inputs will only be sent to them if you hit the "DO NOT CLICK" button at the bottom. Everything you enter in the rest of this calculator
         stays on this device.`
      : 'Everything you enter stays on this device.'

  return `
    <div class="footer">
      <button type="button" class="tip" data-action="how-to">How to use this calculator</button>
      <p class="footer-privacy">
        ${privacy}
        <button type="button" class="tip" data-info="privacy">Read more</button>
      </p>
      <p>South Dakota Soil Health Coalition</p>
    </div>`
}

function perennial(calc) {
  if (setupOpen) return renderSetup(calc, startedOnce)

  const showAll = getPref('showAll')
  const step = clampStep(getPref('step'))
  // Whether this calculation is already IN the saved list, not whether it has a
  // name. A duplicate opened and then cleared still carries a name.
  const saved = listCalcs().some((c) => c.id === calc.id)

  return `
    ${renderChips(calc)}
    ${showAll ? '' : renderStepper(STEP_LABELS, step, getPref('maxStep'))}
    ${renderSteps(calc, step, showAll, warnedSteps)}
    ${renderStickyBar(showAll, calc, saved)}`
}

function clampStep(n) {
  return Math.min(Math.max(Number(n) || 0, 0), STEP_LABELS.length - 1)
}

/**
 * Which branches of the calculation each step's Clear empties, in step order.
 *
 * Named here rather than derived from the markup, because "what this step is
 * for" is a fact about the worksheet and a step that renders a figure it does
 * not own must not be able to clear it. The values come from newCalculation(),
 * so a new field is blanked correctly by adding it to the factory and nothing
 * else. STEP_INPUTS in calc.js is the same idea for a different question:
 * which inputs a step COLLECTS, for saying what is still outstanding.
 */
const STEP_FIELDS = [['samples'], ['frame', 'dm'], ['usable'], ['demand'], ['pasture']]

/**
 * Steps the user has tried to leave with a required input still blank.
 *
 * Only these render a shortfall note. A step is blank when you arrive on it, so
 * a note on arrival is telling you what you can already see, every time, on
 * every step: the kind of warning people learn to read past, which is worse
 * than none at all.
 *
 * Session state, not a preference. It is about this run through the worksheet
 * and has no business surviving a reload or travelling in a saved record.
 */
const warnedSteps = new Set()

/**
 * One speed bump on the way out of an unfinished step.
 *
 * The first press stays put and shows what is outstanding. A second press goes
 * through: a partly filled worksheet still shows every sub-result it can, and
 * refusing to move would stop someone reading ahead to see what a later step is
 * going to ask them for.
 *
 * @returns {boolean} true to go ahead.
 */
function mayLeaveStep(from) {
  if (!(compute(resolved()).missingByStep?.[from] ?? []).length) return true
  if (warnedSteps.has(from)) return true
  warnedSteps.add(from)
  render()
  return false
}


/* ─────────────────────────────── autosave ──────────────────────────────── */

/*
 * ABOVE refresh() on purpose. refresh() ends by painting the indicator, so the
 * two are ordered by which one the other needs, not by which reads first. Below
 * it, the state declared here would be in its temporal dead zone for anything
 * that rendered during module evaluation. Nothing does today, which is exactly
 * the kind of safety that quietly stops being true.
 */

let saveTimer = null

/**
 * What the sticky bar says about the autosave.
 *
 * `''` before anything has been typed: a bar claiming "Saved" over an empty form
 * on first load is telling somebody their work is safe before there is any.
 *
 * The failed state is the one this exists for. The autosave is silent by design
 * and storage.js never throws, so a full quota or a locked-down Safari would
 * otherwise lose every keystroke with nothing on screen to say so.
 */
const AUTOSAVE = {
  saving: { text: 'Saving…', cls: '', hint: 'Your work is being written to this device.' },
  saved: { text: '✓ Saved', cls: 'is-saved', hint: 'Your work is on this device. Closing the page will not lose it.' },
  error: {
    text: '✕ Not saved',
    cls: 'is-error',
    hint: 'This browser refused to store your work. It may be out of space, or in private browsing.',
  },
}

let autosaveState = ''

function setAutosave(state) {
  autosaveState = state
  paintAutosave()
}

/**
 * Called from refresh(), so a full render cannot leave a stale state behind.
 *
 * The reassuring states are for a calculation ALREADY in the saved list, which
 * is what `data-listed` on the element carries. Beside a button offering to
 * "Save calculation", a line reading "Saved" contradicts it, and the button is
 * the one that matters.
 *
 * The FAILED state ignores that and always shows, because the case it exists for
 * is the opposite one: a browser refusing to store anything hits brand new work
 * hardest, and brand new work is exactly what nobody has saved yet. Hiding the
 * one message that must never be silent, in the only situation it was written
 * for, is how this was wrong the first time.
 */
function paintAutosave() {
  const el = app.querySelector('[data-autosave]')
  if (!el) return
  const shown = AUTOSAVE[autosaveState]
  const say = shown && (el.dataset.listed === '1' || autosaveState === 'error') ? shown : null
  el.hidden = !say
  el.textContent = say?.text ?? ''
  el.className = `autosave ${say?.cls ?? ''}`.trim()
  // The bar has room for two words. The sentence behind them is a title, which
  // is a desktop affordance, so nothing that matters is only said here: an
  // explicit save that cannot be written still raises its own alert.
  el.title = say?.hint ?? ''
}

/**
 * Write now rather than at the end of the debounce.
 *
 * 400ms of typing is a small window, and closing a tab is the moment somebody is
 * most likely to be inside it. Mobile Safari makes it worse: it suspends timers
 * when a tab goes to the background, so a pending save can simply never run.
 *
 * `pagehide` and `visibilitychange`, NOT `beforeunload`, which iOS does not fire
 * reliably and which is the wrong tool besides: this asks nothing and blocks
 * nothing, it only stops waiting.
 */
function flushSave() {
  if (saveTimer === null) return
  clearTimeout(saveTimer)
  saveTimer = null
  setAutosave(writeEverywhere() ? 'saved' : 'error')
}

/**
 * The autosave writes the working copy AND the saved record it came from.
 *
 * The record used to be written only when somebody pressed Save, so a
 * calculation saved half way through and then finished sat in the Saved tab
 * showing the figures it had at the moment it was saved, while the bar over the
 * top of it said "Saved". Both statements were true of different things, which
 * is not something a user can be expected to hold in their head: the tab is the
 * place they go to see what they have, and what they had was three steps behind.
 *
 * So "Saved" now means one thing. The working copy is written on every keystroke
 * as before, and if this calculation is already IN the list, that record is
 * written with it.
 *
 * Only if it is already in the list. Nothing here creates a record, so the Save
 * button still decides what gets kept, and a calculation nobody has named stays
 * out of the Saved tab.
 *
 * @returns {boolean} true when everything that needed writing was written.
 */
function writeEverywhere() {
  const calc = getCalculation()
  const working = saveWorking(calc)
  return syncSavedRecord(calc).ok && working.ok
}

/**
 * Write the working calculation over the record in the saved list, if it is one.
 *
 * The fingerprint check is what keeps merely LOOKING at a saved calculation from
 * touching it. Opening one replaces the working copy, which notifies, which
 * lands here: without the check, opening a record would rewrite it and move its
 * date for no reason, and on a list that has never been dragged into an order it
 * would jump to the top.
 *
 * A `Conflict` means another tab wrote this record after this one last read it.
 * The autosave leaves it alone rather than asking — the question belongs to a
 * button somebody pressed, and the explicit save still asks it. The working copy
 * is written either way, so nothing typed is at risk while that stands.
 */
function syncSavedRecord(calc) {
  const stored = getCalcById(calc.id)
  if (!stored) return { ok: true }

  const record = { ...structuredClone(calc), results: compute(resolved(calc)) }
  if (fingerprint(stored) === fingerprint(record)) return { ok: true }

  const result = saveCalc(record)
  return result.ok || result.error === 'Conflict' ? { ok: true } : result
}

/**
 * Everything on a record that the person using it can change, and nothing the
 * store owns: `updatedAt` and `createdAt` are stamped by saveCalc, `sortIndex`
 * belongs to the Saved tab, `tag` has its own two owners, and `results` are
 * worked out from the rest.
 */
function fingerprint(record) {
  const { updatedAt, createdAt, sortIndex, schemaVersion, tag, results, ...rest } = record
  return JSON.stringify(rest)
}

window.addEventListener('pagehide', flushSave)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave()
})

subscribe(() => {
  clearTimeout(saveTimer)
  // Assigned rather than set through setAutosave(), because refresh() below
  // paints it. Going through the setter would write the same two words twice on
  // every character typed.
  autosaveState = 'saving'
  refresh()
  saveTimer = setTimeout(() => {
    saveTimer = null
    setAutosave(writeEverywhere() ? 'saved' : 'error')
  }, 400)
})

/**
 * Repaint the results block, then every computed figure on the page.
 *
 * The results block is rebuilt only when its SHAPE could have changed, which is
 * on a full render. Here it is filled once if it is empty; after that
 * updateOutputs handles it, so the paddock width box does not lose focus on
 * every keystroke.
 */
function refresh() {
  const res = compute(resolved())

  const slot = app.querySelector('[data-results]')
  if (slot && !slot.dataset.built) {
    slot.innerHTML = renderResults(getCalculation())
    slot.dataset.built = '1'
  }

  updateOutputs(res, app, { spreadNote: !editingSamples })
  paintAutosave()
  return res
}

/* ───────────────── the spread note waits for the pen to lift ───────────── */

/**
 * True while a weight is part typed. It FREEZES the spread note; it does not hide
 * it.
 *
 * The spread note is the one thing on the page that is a JUDGEMENT of what has
 * been entered rather than a figure worked out from it, and it is a paragraph
 * three lines long. Recomputed on every keystroke it appears and vanishes under
 * the thumb, and mid-number it is judging a figure that is not all there: 1 and
 * 100 read as a wide spread while the 100 is still "1".
 *
 * So the note is settled once per ENTRY rather than per keystroke. Leaving a
 * weight box, including for the next weight box, is what says that entry is
 * finished, and that is when it appears, updates or stands down. In between it
 * holds whatever it last said — hiding it as soon as a key goes down would be the
 * same flicker approached from the other side.
 *
 * Everything else on the page keeps updating as you type. A figure that sits
 * still while its value changes is not the same thing as a sentence that comes
 * and goes.
 */
let editingSamples = false

const isSampleBox = (el) => !!el?.dataset?.path?.startsWith('samples.')

/**
 * Entering or leaving a weight box ends the entry, whichever box comes next.
 *
 * Both events are needed. `focusout` fires BEFORE focus lands anywhere, so it is
 * what catches a move to another weight box and to the page alike; `focusin`
 * covers focus arriving from outside the app, where no `focusout` was seen here.
 */
const endSampleEntry = () => {
  if (!editingSamples) return
  editingSamples = false
  refresh()
}

app.addEventListener('focusout', endSampleEntry)
app.addEventListener('focusin', endSampleEntry)

/* ─────────────────────── writing by path, one listener ─────────────────── */

app.addEventListener('input', (e) => {
  if (e.target.hasAttribute?.('data-saved-filter')) {
    savedFilter = e.target.value
    render()
    return
  }

  const path = e.target.dataset?.path
  if (!path) return
  setPath(getCalculation(), path, e.target.value)
  if (path === 'frame.customArea') syncFramePill(e.target.value)
  // Set BEFORE notify(), which is what repaints the page. A weight being typed
  // leaves the spread note as it stands until that box is left; typing anywhere
  // else means no weight is part entered, so the note is settled again.
  editingSamples = isSampleBox(e.target)
  notify()
})

/**
 * Typing an area of your own IS "Other frame", so the pill follows the box.
 *
 * Updated in place rather than by re-rendering: a render here would replace the
 * input mid-number and take the caret with it, which is the same reason
 * updateOutputs() exists instead of re-rendering the result cards.
 */
function syncFramePill(value) {
  const calc = getCalculation()
  const preset = FRAMES.find((f) => f.key === calc.frame?.key)
  if (!preset || preset.area == null || String(preset.area) === String(value)) return

  calc.frame.key = 'custom'
  for (const seg of app.querySelectorAll('[data-action="set-frame"]')) {
    seg.setAttribute('aria-pressed', String(seg.dataset.mode === 'custom'))
  }
}

// <select> fires change rather than input in older Safari, so both are wired.
app.addEventListener('change', (e) => {
  const el = e.target
  if (el.dataset?.path && el.tagName === 'SELECT') {
    setPath(getCalculation(), el.dataset.path, el.value)
    // Changing a mix row's forage type invalidates the stage chosen under it.
    if (/^dm\.mix\.\d+\.typeId$/.test(el.dataset.path)) {
      setPath(getCalculation(), el.dataset.path.replace('typeId', 'stageKey'), '')
      notify()
      render()
      return
    }
    notify()
    return
  }

  // The "what you will need" ticks. A device preference, deliberately not part
  // of the calculation, so this writes to prefs and does not notify().
  if (el.dataset?.need !== undefined) {
    setNeedChecked(el.dataset.need, el.checked)
    return
  }

  const action = el.dataset?.action
  if (action === 'toggle-goal') {
    const calc = getCalculation()
    const goals = new Set(calc.goals)
    if (el.checked) goals.add(el.value)
    else goals.delete(el.value)
    // Kept in the canonical order rather than the order they were clicked, so
    // the result cards, the checklist and the CSV always read the same way.
    calc.goals = GOALS.map((g) => g.key).filter((k) => goals.has(k))
    notify()
    render()
  } else if (action === 'set-forage') {
    chooseForage(el.value)
  } else if (action === 'set-stage') {
    const calc = getCalculation()
    calc.dm.stageKey = el.value
    calc.dm.stageTypeId = calc.forageType
    notify()
  }
})

/**
 * Choose a forage type, from the card or from the photo viewer.
 *
 * A stage belongs to a ROW of the chart. Keeping it across a change of row
 * would leave a forb stage selected on a grass, where it resolves to nothing
 * and reads on screen as a dry matter of zero.
 */
function chooseForage(id) {
  const calc = getCalculation()
  calc.forageType = id
  calc.dm.stageKey = ''
  calc.dm.stageTypeId = ''

  // The mix builder follows too, but only its UNUSED rows. A share entered
  // against a type is a deliberate statement about the stand and changing the
  // headline answer must not rewrite it; a row with no share is one the builder
  // filled in from the setup screen and never heard about again.
  for (const row of calc.dm.mix ?? []) {
    if (row.share === '' || row.share == null) {
      row.typeId = defaultMixType(calc)
      // The stage belongs to the ROW. Kept across a change of row it resolves
      // to nothing and reads on screen as a dry matter of zero.
      row.stageKey = ''
    }
  }

  notify()
  render()
}

/**
 * The row of the chart a new mix row starts on.
 *
 * "Mixed or not sure" is the one answer that names no row, and it is also the
 * answer most likely to lead here, so it defaults to nothing rather than to the
 * first type in the list.
 */
function defaultMixType(calc) {
  return calc.forageType === MIXED.id ? '' : calc.forageType || ''
}

/**
 * Ask before throwing away work that is not in the saved list.
 *
 * The working calculation is autosaved on every keystroke, so nothing is lost
 * by closing the page. It IS lost by replacing the working calculation, which
 * is what "+ New calculation" and opening a saved record both do. So the
 * question is not "have you saved recently", it is "is this one in the list at
 * all": if it is, the figures on screen are a copy of a record that survives.
 *
 * An untouched form is not work, so it goes without asking.
 *
 * The browser's own dialog, deliberately. A modal of ours could label its buttons
 * "Continue" and "Go back" instead of OK and Cancel, and that was tried: it costs
 * a callback in place of a return value here and at every call site, because a
 * modal cannot block. The words are not worth the shape of the code.
 *
 * @returns {boolean} true to go ahead.
 */
function confirmLeavingUnsaved(what) {
  const calc = getCalculation()
  const started = hasSamples(calc) || calc.goals.length > 0 || !!calc.forageType
  if (!started) return true
  if (listCalcs().some((c) => c.id === calc.id)) return true

  return confirm(
    `The calculation you have open is not in your saved list. ${what} will lose it. Hit Ok to continue, or Cancel to go back to the open calculation.`
  )
}

/* ─────────────────── reordering the saved list, by drag ────────────────── */

/**
 * A simplified port of farm-budget's reorder.
 *
 * That one has to deal with folders, spring-open sections and FLIP animation.
 * This list is a flat grid of a handful of cards, so it only needs the two
 * halves that matter: the native drag for a mouse, and a pointer-driven
 * equivalent for touch, where HTML5 drag and drop does not exist at all.
 *
 * Reordering is refused while the list is filtered. Dropping a card between two
 * others in a list that is hiding half its rows writes an order the user cannot
 * see and did not mean.
 */
let draggingId = null

/** The card the pointer is over, or the gap at the end of the row. */
function dropTarget(list, clientX, clientY, dragged) {
  const cards = [...list.querySelectorAll('.saved-card')].filter((c) => c !== dragged)
  for (const card of cards) {
    const box = card.getBoundingClientRect()
    if (clientY < box.bottom && clientX < box.left + box.width / 2) return card
    if (clientY < box.bottom && clientX < box.right) return card.nextElementSibling
  }
  return null
}

function moveDragged(list, clientX, clientY) {
  const dragged = list.querySelector('.saved-card.dragging')
  if (!dragged) return
  const target = dropTarget(list, clientX, clientY, dragged)
  if (target === dragged || dragged.nextElementSibling === target) return
  list.insertBefore(dragged, target)
}

function commitOrder(list) {
  const ids = [...list.querySelectorAll('.saved-card')].map((c) => c.dataset.calcId)
  reorderCalcs(ids)
  render()
}

app.addEventListener('dragstart', (e) => {
  const card = e.target.closest?.('.saved-card')
  if (!card || savedFilter.trim()) return
  draggingId = card.dataset.calcId
  card.classList.add('dragging')
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    // Firefox refuses to start a drag unless some data is set.
    e.dataTransfer.setData('text/plain', draggingId)
  }
})

app.addEventListener('dragover', (e) => {
  const list = draggingId && e.target.closest?.('[data-saved-list]')
  if (!list) return
  e.preventDefault()
  moveDragged(list, e.clientX, e.clientY)
})

app.addEventListener('drop', (e) => {
  if (draggingId) e.preventDefault()
})

app.addEventListener('dragend', () => {
  const card = app.querySelector('.saved-card.dragging')
  const list = card?.closest('[data-saved-list]')
  card?.classList.remove('dragging')
  draggingId = null
  if (list) commitOrder(list)
})

/**
 * The same reorder by finger.
 *
 * HTML5 drag and drop does not fire on touch at all, so without this the handle
 * would be decoration on the device most of these get sorted on. The gesture is
 * claimed on pointerdown: a touch the browser is allowed to turn into a scroll
 * is gone for good, which is what `touch-action: none` on .saved-grip prevents.
 */
let touchDrag = null

app.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || e.isPrimary === false || touchDrag) return
  const grip = e.target.closest?.('.saved-grip')
  const card = grip?.closest('.saved-card')
  const list = card?.closest('[data-saved-list]')
  if (!list || savedFilter.trim()) return

  e.preventDefault()
  touchDrag = { card, list }
  card.classList.add('dragging')
  try {
    grip.setPointerCapture(e.pointerId)
  } catch {
    /* the gesture still works, it just ends early if the finger leaves */
  }
})

app.addEventListener('pointermove', (e) => {
  if (!touchDrag) return
  // A re-render in another tab can take the card out from under the finger.
  if (!touchDrag.card.isConnected) {
    touchDrag = null
    return
  }
  e.preventDefault()
  moveDragged(touchDrag.list, e.clientX, e.clientY)
})

const endTouchDrag = () => {
  if (!touchDrag) return
  const { card, list } = touchDrag
  touchDrag = null
  card.classList.remove('dragging')
  if (list.isConnected) commitOrder(list)
}
app.addEventListener('pointerup', endTouchDrag)
app.addEventListener('pointercancel', endTouchDrag)

/**
 * A shut step opens from anywhere in its box, not only from the caret.
 *
 * Only while it is SHUT. Once it is open the box is full of inputs and readouts
 * and a stray click on the padding between two fields must not fold the step
 * away underneath what the user is reading; collapsing it again stays the
 * caret's job. Buttons are skipped so the `?` still explains the step rather
 * than expanding it.
 */
app.addEventListener('click', (e) => {
  const section = e.target.closest?.('.step--collapsible')
  if (!section || e.target.closest('button, a, input, select, textarea, label')) return
  const body = section.querySelector('.step-body')
  if (!body?.hidden) return
  setStepOpen(clampStep(section.dataset.step), true)
  render()
})

/* ───────────────────────────── click actions ───────────────────────────── */

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button')
  if (!btn) return

  // The `?` is read-only, always.
  const info = btn.dataset.info
  if (info) {
    openInfo(info.split(','), btn.dataset.infoTitle || undefined)
    return
  }

  const action = btn.dataset.action
  if (!action) return
  handleAction(action, btn, e)
})

function handleAction(action, btn) {
  const calc = getCalculation()

  switch (action) {
    /* chrome */
    case 'set-tab':
      // The last keystroke may still be inside the 400ms debounce, and the Saved
      // tab is about to draw the record that write updates. Waiting would put a
      // list on screen that is one edit behind and then never redraw it.
      flushSave()
      setPref('tab', btn.dataset.tab)
      render()
      break
    case 'how-to':
      openGuide('How to use this calculator', HOW_TO_SECTIONS, { collapsible: true })
      break

    /* setup */
    case 'start':
      setupOpen = false
      // Only a first start goes to step 1. Coming back from Change picks up
      // where the user left off, which is what the button now says it does.
      if (!startedOnce) {
        setPref('step', 0)
        setPref('maxStep', 0)
        startedOnce = true
      }
      render()
      break
    case 'edit-setup':
      setupOpen = true
      render()
      break
    case 'new-calc': {
      // Everything goes, including the goals and the forage type, which is what
      // separates this from a step's Clear. Saved records are untouched.
      if (!confirmLeavingUnsaved('Starting a new calculation')) return
      clearWorking()
      // A different worksheet has not been warned about anything yet.
      warnedSteps.clear()
      setCalculation(newCalculation())
      setupOpen = true
      startedOnce = false
      setPref('tab', 'perennial')
      setPref('step', 0)
      setPref('maxStep', 0)
      render()
      scrollToTop()
      break
    }

    /* stepping */
    case 'next-step': {
      if (!mayLeaveStep(clampStep(getPref('step')))) break
      const next = clampStep(getPref('step') + 1)
      setPref('step', next)
      setPref('maxStep', Math.max(getPref('maxStep'), next))
      render()
      scrollToTop()
      break
    }
    case 'prev-step':
      setPref('step', clampStep(getPref('step') - 1))
      render()
      scrollToTop()
      break
    case 'go-step': {
      // The stepper offers the next circle as well as the ones behind, so
      // arriving by circle has to raise the high-water mark the same way Next
      // does. Without it the strip would offer step 3, then refuse step 4.
      const to = clampStep(btn.dataset.step)
      // Forward only. Going BACK to check a figure is not leaving a step
      // unfinished, it is the thing the stepper is for.
      const from = clampStep(getPref('step'))
      if (to > from && !mayLeaveStep(from)) break
      setPref('step', to)
      setPref('maxStep', Math.max(getPref('maxStep'), to))
      render()
      scrollToTop()
      break
    }
    case 'toggle-show-all': {
      const now = !getPref('showAll')
      setPref('showAll', now)
      if (now) {
        // Everything reached, so returning to the wizard cannot lock a step the
        // user has already been reading.
        setPref('maxStep', STEP_LABELS.length - 1)
        // Five sections expanded is a very long page. The reason to turn this
        // on is usually to reach ONE earlier figure, so only the step being
        // left starts open.
        setOpenSteps([clampStep(getPref('step'))])
      }
      render()
      break
    }
    case 'toggle-step': {
      const i = clampStep(btn.dataset.step)
      setStepOpen(i, btn.getAttribute('aria-expanded') !== 'true')
      render()
      break
    }
    case 'open-howto': {
      const panel = howToPanel(btn.dataset.howto)
      if (panel) openModal(panel.title, panel.html, { wide: true })
      break
    }

    /* step 1 */
    case 'add-sample':
      calc.samples.push('')
      notify()
      render()
      break
    case 'remove-sample':
      if (calc.samples.length > 1) calc.samples.pop()
      notify()
      render()
      break

    /* step 2 */
    case 'set-frame': {
      const was = FRAMES.find((f) => f.key === calc.frame.key)
      calc.frame.key = btn.dataset.mode
      // A preset is a shortcut to a number, not a replacement for one. It fills
      // the box in so the figure being used is on screen and can be measured
      // against the hoop in the pickup.
      const preset = FRAMES.find((f) => f.key === calc.frame.key)
      if (preset?.area != null) calc.frame.customArea = String(preset.area)
      // Leaving a preset for "Other frame" empties the box, because the figure
      // in it is the preset's and not the user's. Left there it reads as an
      // answer, and 0.96 sq ft is a plausible enough number for somebody's own
      // frame that nothing on screen would say otherwise. Blank is the app's way
      // of saying a question is still outstanding, which this one now is.
      //
      // Only when LEAVING a preset. Pressing "Other frame" while already on it
      // is not a change of mind about the frame, and must not wipe a measurement
      // that was typed in.
      else if (was?.area != null) calc.frame.customArea = ''
      notify()
      render()
      break
    }
    case 'set-dm-mode':
      calc.dm.mode = btn.dataset.mode
      // Entering the builder from a screen that already named a forage type
      // should not ask for it again. Only EMPTY rows are filled: a row the user
      // has already set is theirs.
      if (calc.dm.mode === 'mix') {
        for (const row of calc.dm.mix) if (!row.typeId) row.typeId = defaultMixType(calc)
      }
      notify()
      render()
      break
    case 'toggle-stage-photos':
      setPref('showStagePhotos', !getPref('showStagePhotos'))
      render()
      break
    case 'open-chart':
      openDryMatterTable({
        group: null,
        typeId: calc.forageType === MIXED.id ? calc.dm.stageTypeId : calc.forageType,
        stageKey: calc.dm.stageKey,
      })
      break
    case 'open-chart-picker':
      openDryMatterTable({
        group: null,
        typeId: calc.dm.stageTypeId,
        stageKey: calc.dm.stageKey,
        pickable: true,
      })
      break
    case 'pick-cell':
      calc.dm.stageTypeId = btn.dataset.typeId
      calc.dm.stageKey = btn.dataset.stageKey
      notify()
      closeModal()
      render()
      break
    case 'add-mix':
      calc.dm.mix.push(newMixRow(defaultMixType(calc)))
      notify()
      render()
      break
    case 'remove-mix':
      calc.dm.mix.splice(Number(btn.dataset.index), 1)
      if (!calc.dm.mix.length) calc.dm.mix.push(newMixRow())
      notify()
      render()
      break

    /* step 3 */
    case 'set-usable-mode':
      calc.usable.mode = btn.dataset.mode
      notify()
      render()
      break

    /* photos */
    case 'open-photo':
      openPhoto(btn.dataset.photoSet, Number(btn.dataset.photoIndex))
      break
    case 'pick-forage':
      closeModal()
      chooseForage(btn.dataset.value)
      break

    /* exports */
    case 'print':
      printResults()
      break
    case 'export-csv':
      downloadCSV(calc, refresh())
      break
    case 'export-png':
      downloadPNG(calc, refresh())
      break

    /* saving */
    case 'save-calc': {
      // Already in the list, so this is an edit of that record and the dialog
      // says so. It still WRITES the figures as they now stand: a button that
      // only renamed things would silently leave the numbers behind.
      const existing = listCalcs().some((c) => c.id === calc.id)
      const apply = (name, pastureName, tag) => {
        calc.name = name
        calc.pastureName = pastureName
        // Kept on the working copy so re-saving does not drop the colour, the
        // same reason saveCalc() falls back to the stored record's tag.
        calc.tag = tag
        persist(calc)
        closeModal()
        // The autosave to the working key only runs off notify(). Without it a
        // reload shortly after saving shows the old name in the editor even
        // though the saved record has the new one.
        notify()
        render()
      }
      if (existing) openEditDialog(calc, apply)
      else openSaveDialog(calc, apply)
      break
    }
    case 'open-calc': {
      const found = getCalcById(btn.dataset.id)
      if (!found) return
      if (!openSavedCalc(found)) return
      render()
      break
    }
    case 'edit-calc': {
      const found = getCalcById(btn.dataset.id)
      if (!found) return
      openEditDialog(found, (name, pastureName, tag) => {
        updateCalcMeta(found.id, { name, pastureName, tag })
        // The open working copy may BE this calculation, so the three fields
        // follow it. Without that, editing here and then saving from the
        // sticky bar would put the old name and colour straight back.
        if (calc.id === found.id) {
          calc.name = name
          calc.pastureName = pastureName
          calc.tag = tag
          notify()
        }
        closeModal()
        render()
      })
      break
    }
    case 'go-saved': {
      // A button that says "to saved" must not land on a list this calculation
      // is missing from. It is written first if it is not in there yet, with
      // whatever name it carries: the card offers Edit right beside it, which is
      // a cheaper correction than a dialog in the way of every visit to the tab.
      if (!listCalcs().some((c) => c.id === calc.id)) {
        persist(calc)
        notify()
      }
      // Same reason as set-tab: anything still in the debounce belongs in the
      // record before the list that shows it is drawn.
      flushSave()
      setPref('tab', 'saved')
      render()
      scrollToTop()
      break
    }
    case 'clear-saved-filter':
      savedFilter = ''
      render()
      break

    /* files in and out of the saved list */
    case 'save-as': {
      const found = getCalcById(btn.dataset.id)
      if (!found) return
      openSaveAsDialog(found)
      break
    }
    case 'save-as-png':
    case 'save-as-csv':
    case 'save-as-json': {
      const found = getCalcById(btn.dataset.id)
      if (!found) return
      closeModal()
      if (action === 'save-as-json') {
        downloadCalcJSON(found)
        break
      }
      // Recomputed from the inputs rather than read off the record's stored
      // `results`. A record written before a correction to the model still
      // carries the figures it was saved with, and a file leaving the app has
      // to carry the right ones. Same rule as reopening one.
      const res = compute(resolved(found))
      if (action === 'save-as-png') downloadPNG(found, res)
      else downloadCSV(found, res)
      break
    }
    case 'save-as-print': {
      const found = getCalcById(btn.dataset.id)
      if (!found) return
      closeModal()
      printSavedCalc(found)
      break
    }
    case 'backup-all':
      if (!listCalcs().length) {
        alert('There is nothing saved on this device to back up yet.')
        break
      }
      downloadBackup()
      break
    case 'restore-all':
      restoreFromFile()
      break
    case 'upload-calc':
      uploadCalcFile()
      break
    case 'duplicate-calc': {
      const found = getCalcById(btn.dataset.id)
      if (!found) return
      const copy = structuredClone(found)
      copy.id = makeId('calc')
      copy.name = `${found.name} (copy)`
      delete copy.sortIndex
      saveCalc(copy)
      render()
      break
    }
    case 'delete-calc': {
      const found = getCalcById(btn.dataset.id)
      if (!found) return
      if (!confirm(`Delete "${found.name}"? This cannot be undone.`)) return
      deleteCalc(found.id)
      render()
      break
    }
    case 'clear-step': {
      // One step at a time, from the Clear on that step's own head. A single
      // button that emptied the whole worksheet had to be read carefully every
      // time; this one names its scope by where it sits, so it needs no confirm.
      const i = clampStep(btn.dataset.step)
      const fresh = newCalculation()
      for (const key of STEP_FIELDS[i]) calc[key] = fresh[key]
      // The mix rows come back blank with the rest of step 2, so they take the
      // forage type the setup screen already named, the same as entering the
      // builder does.
      if (STEP_FIELDS[i].includes('dm')) {
        for (const row of calc.dm.mix) row.typeId = defaultMixType(calc)
      }
      notify()
      render()
      break
    }

    default:
      break
  }
}

/**
 * Put a saved record on screen, replacing the working calculation.
 *
 * Opening REPLACES what is being worked on, so an unsaved calculation goes with
 * it. The record is cloned rather than adopted, so nothing on screen holds a live
 * pointer into the stored list.
 *
 * It is no longer a scratch copy, though. Editing a calculation that is in the
 * list writes back to it — see writeEverywhere() — because a Saved tab showing
 * figures three steps behind the screen was worse than the protection that
 * bought. LOOKING still changes nothing: syncSavedRecord() compares the record
 * with the working copy before it writes, so an open that touches no field
 * touches no record.
 *
 * setCalculation notifies, which is what schedules the autosave. Without it,
 * reloading straight after opening would revert to whatever was in the working
 * slot before.
 *
 * Does not render. The caller decides what else has to change first.
 *
 * @returns {boolean} true if the record is now the working calculation.
 */
function openSavedCalc(found) {
  if (!confirmLeavingUnsaved('Opening a saved calculation')) return false
  setCalculation(structuredClone(found))
  warnedSteps.clear()
  setupOpen = false
  startedOnce = true
  setPref('tab', 'perennial')
  setPref('maxStep', STEP_LABELS.length - 1)
  return true
}

/**
 * Print a saved calculation without adopting it.
 *
 * Printing prints the PAGE, so the record has to be on screen for the print
 * stylesheet to have anything to lay out. It goes back afterwards, because
 * printing is a read-only act and cancelling the print dialog was leaving
 * somebody standing in a calculation they never asked to open.
 *
 * Nothing is asked and nothing is lost, which is why this does not go through
 * openSavedCalc(): the working calculation is not replaced, it is borrowed for
 * as long as the dialog is up and then put back exactly as it was.
 *
 * The swap back runs on `afterprint`. Reading it off print() returning instead
 * would be wrong on a phone, where print() can hand back before the sheet has
 * even appeared and the page would be swapped out from under it. Browsers
 * without the event get the synchronous version, which is what they behave like.
 */
function printSavedCalc(found) {
  const before = {
    calc: getCalculation(),
    tab: getPref('tab'),
    setup: setupOpen,
    started: startedOnce,
  }

  // The step and maxStep prefs are left alone. Print forces every step visible
  // whatever the wizard is showing, so moving them would only disturb the place
  // the user is coming back to.
  setCalculation(structuredClone(found))
  setupOpen = false
  startedOnce = true
  setPref('tab', 'perennial')
  render()

  const restore = () => {
    window.removeEventListener('afterprint', restore)
    setCalculation(before.calc)
    setupOpen = before.setup
    startedOnce = before.started
    setPref('tab', before.tab)
    render()
  }

  if ('onafterprint' in window) {
    window.addEventListener('afterprint', restore, { once: true })
    printResults()
  } else {
    printResults()
    restore()
  }
}

/* ──────────────────────── files off the user's device ──────────────────── */

/**
 * Read a .json the user picks.
 *
 * The input is never added to the document. A detached one still opens the
 * picker, and one left in the page would print, be tabbed into, and have to be
 * cleaned up afterwards.
 */
function pickJSONFile(onText) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    onText(await file.text())
  })
  input.click()
}

/** "1 calculation", "3 calculations", for a dialog where the count is the point. */
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** A name nothing already in the list is using. */
function nameForUpload(name, taken) {
  const base = String(name || '').trim() || 'Uploaded calculation'
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} (${n})`)) n += 1
  return `${base} (${n})`
}

/**
 * Add one calculation from a file to the saved list.
 *
 * It lands in the LIST rather than on screen, and the calculation being worked
 * on is left alone. A file somebody was sent is something to keep, not something
 * to drop into the middle of what they were doing.
 *
 * A fresh id is what stops a file exported from this device overwriting the very
 * record it came out of, and the name is made unique so the list does not end up
 * with two cards nothing tells apart.
 */
function uploadCalcFile() {
  pickJSONFile((text) => {
    const result = importCalcJSON(text)
    if (!result.ok) {
      alert(result.error)
      return
    }
    const copy = result.calc
    copy.id = makeId('calc')
    copy.name = nameForUpload(copy.name, new Set(listCalcs().map((c) => c.name)))
    if (!saveCalc(copy).ok) {
      alert('That calculation could not be saved. This browser may be out of storage space.')
      return
    }
    // The list just grew. A filter hiding the card that has arrived reads as the
    // upload having failed.
    savedFilter = ''
    setPref('tab', 'saved')
    render()
  })
}

/**
 * Replace the whole saved list from a backup file.
 *
 * The one action in this app that can take away work the user never opened, so
 * the dialog states BOTH counts: what is arriving and what is going. "Are you
 * sure?" cannot be answered without them, and the dangerous case is the file
 * that holds two calculations on a device holding twenty. The file is parsed
 * BEFORE the dialog is raised, so one that turns out to be unreadable never gets
 * as far as asking.
 *
 * The calculation on screen is left exactly as it is, unsaved edits included.
 * It is not part of the saved list, so a restore has no business touching it.
 */
function restoreFromFile() {
  pickJSONFile((text) => {
    const result = importBackupJSON(text)
    if (!result.ok) {
      alert(result.error)
      return
    }

    const have = listCalcs().length
    const arriving = `This backup holds ${plural(result.calcs.length, 'calculation')}.`
    const losing = have
      ? `Restoring it deletes the ${plural(have, 'calculation')} saved on this device now.`
      : 'There is nothing saved on this device now, so nothing is lost.'
    if (!confirm(`${arriving}\n\n${losing}\n\nThis cannot be undone. Restore anyway?`)) return

    if (!replaceAll(result.calcs).ok) {
      alert('Nothing was changed. This browser is out of storage space.')
      return
    }
    savedFilter = ''
    setPref('tab', 'saved')
    render()
  })
}

/**
 * Write a calculation to the saved list, with its results alongside.
 *
 * The results are stored so the Saved tab can show headline figures without
 * recomputing every record, and so a saved calculation still reads correctly if
 * the model is later corrected. Reopening always recomputes from the inputs.
 */
function persist(calc) {
  const record = { ...structuredClone(calc), results: compute(resolved(calc)) }
  let result = saveCalc(record)

  if (!result.ok && result.error === 'Conflict') {
    if (!confirm('This calculation was changed in another tab. Overwrite it with this one?')) {
      return
    }
    // The retry can fail too, on quota for instance, so it is reported the same
    // way rather than being assumed to have worked.
    result = saveCalc(record, { force: true })
  }

  if (result.ok) return

  alert(
    result.error === 'QuotaExceededError'
      ? 'There is no room left in this browser to save. Delete a saved calculation and try again.'
      : 'That could not be saved. Your browser may be blocking storage for this site.'
  )
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/* ────────────────────────── chrome outside #app ────────────────────────── */

document.addEventListener('click', (e) => {
  const font = e.target.closest('[data-font-choice]')
  if (font) {
    setFont(font.dataset.fontChoice)
    return
  }
  if (e.target.closest('#themeToggle')) toggleTheme()
})

/**
 * Drop the photo viewer's state whenever the modal closes.
 *
 * It closes four ways: the X, the backdrop, Escape, and another modal opening
 * over it. Watching the overlay's class covers all four without each of them
 * having to remember to call this.
 */
const overlayWatcher = new MutationObserver(() => {
  const overlay = document.querySelector('.overlay')
  if (overlay && !overlay.classList.contains('open')) releasePhotoViewer()
})

/* ──────────────────────────────── boot ─────────────────────────────────── */

applyTheme()
applyFont()

const restored = loadWorking()
if (restored) {
  setCalculation(restored)
  // Someone with work in progress goes back to it rather than to the landing
  // screen they already answered.
  setupOpen = !(restored.goals?.length && restored.forageType)
  // Work in progress means the steps have been seen before, so pressing Change
  // and coming back must not throw away the step they were on.
  startedOnce = !setupOpen
}

overlayWatcher.observe(document.body, {
  attributes: true,
  subtree: true,
  attributeFilter: ['class'],
})

render()

if (!storageAvailable()) {
  const note = document.createElement('p')
  note.className = 'offline-note'
  note.textContent =
    'This browser is not allowing storage for this site, so your entries will be lost when you close the page. Private browsing is the usual cause.'
  app.prepend(note)
}

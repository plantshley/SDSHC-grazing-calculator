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

import { compute, GOALS } from './calc.js'
import {
  getCalculation,
  setCalculation,
  newCalculation,
  newMixRow,
  makeId,
  getPath,
  setPath,
  subscribe,
  notify,
  resolved,
} from './state.js'
import {
  saveWorking,
  loadWorking,
  clearWorking,
  listCalcs,
  getCalcById,
  saveCalc,
  renameCalc,
  tagCalc,
  deleteCalc,
  storageAvailable,
} from './storage.js'
import {
  applyTheme,
  applyFont,
  toggleTheme,
  setFont,
  getPref,
  setPref,
  setPanelOpen,
} from './prefs.js'
import { downloadCSV, downloadPNG, printResults } from './export.js'

import { esc } from './ui/format.js'
import { openInfo, openGuide, closeModal } from './ui/modals.js'
import { openPhoto, releasePhotoViewer } from './ui/photo.js'
import { openDryMatterTable } from './ui/table.js'
import { renderSetup, renderChips } from './ui/setup.js'
import { renderStepper } from './ui/stepper.js'
import { renderSteps, STEP_LABELS } from './ui/steps.js'
import { renderResults, renderStickyBar, updateOutputs } from './ui/results.js'
import { renderSaved, openSaveDialog, openTagDialog, openRenameDialog } from './ui/saved.js'
import { renderCoverCrop, wireCoverCrop } from './ui/covercrop.js'
import { HOW_TO_SECTIONS } from './data/howto.js'
import { MIXED } from './data/forage.js'

const app = document.querySelector('#app')

/** True while the landing screen is showing rather than the steps. */
let setupOpen = true

/* ──────────────────────────────── render ───────────────────────────────── */

function render() {
  const calc = getCalculation()
  const tab = getPref('tab')

  app.innerHTML = `
    ${header(tab)}
    ${tab === 'perennial' ? perennial(calc) : ''}
    ${tab === 'covercrop' ? renderCoverCrop() : ''}
    ${tab === 'saved' ? renderSaved(listCalcs()) : ''}`

  if (tab === 'covercrop') wireCoverCrop(app)
  refresh()
}

function header(tab) {
  const tabs = [
    ['perennial', 'Perennial grazing'],
    ['covercrop', 'Cover crops'],
    ['saved', 'Saved'],
  ]
  return `
    <div class="app-head">
      <h1 class="app-title">
        Grazing Calculator
        <button type="button" class="help-btn" data-action="how-to"
          aria-label="How to use this calculator" title="How to use this calculator">?</button>
      </h1>
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
    </div>`
}

function perennial(calc) {
  if (setupOpen) return renderSetup(calc)

  const showAll = getPref('showAll')
  const step = clampStep(getPref('step'))

  return `
    ${renderChips(calc)}
    ${showAll ? '' : renderStepper(STEP_LABELS, step, getPref('maxStep'))}
    ${renderSteps(calc, step, showAll)}
    ${renderStickyBar(showAll)}`
}

function clampStep(n) {
  return Math.min(Math.max(Number(n) || 0, 0), STEP_LABELS.length - 1)
}

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

  updateOutputs(res, app)
  return res
}

/* ─────────────────────────────── autosave ──────────────────────────────── */

let saveTimer = null

subscribe(() => {
  refresh()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveWorking(getCalculation()), 400)
})

/* ─────────────────────── writing by path, one listener ─────────────────── */

app.addEventListener('input', (e) => {
  const path = e.target.dataset?.path
  if (!path) return
  setPath(getCalculation(), path, e.target.value)
  notify()
})

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
    const calc = getCalculation()
    calc.forageType = el.value
    // A stage belongs to a row of the chart. Keeping it across a change of row
    // would leave a forb stage selected on a grass and silently resolve to
    // nothing, which reads as a dry matter of zero.
    calc.dm.stageKey = ''
    calc.dm.stageTypeId = ''
    notify()
    render()
  } else if (action === 'set-stage') {
    const calc = getCalculation()
    calc.dm.stageKey = el.value
    calc.dm.stageTypeId = calc.forageType
    notify()
  }
})

/** Remember which instructional panels were left open. */
app.addEventListener('toggle', (e) => {
  const id = e.target.dataset?.panel
  if (id) setPanelOpen(id, e.target.open)
}, true)

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
      setPref('tab', btn.dataset.tab)
      render()
      break
    case 'how-to':
      openGuide('How to use this calculator', HOW_TO_SECTIONS, { collapsible: true })
      break

    /* setup */
    case 'start':
      setupOpen = false
      setPref('step', 0)
      setPref('maxStep', 0)
      render()
      break
    case 'edit-setup':
      setupOpen = true
      render()
      break

    /* stepping */
    case 'next-step': {
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
    case 'go-step':
      setPref('step', clampStep(btn.dataset.step))
      render()
      scrollToTop()
      break
    case 'toggle-show-all': {
      const now = !getPref('showAll')
      setPref('showAll', now)
      // Everything reached, so returning to the wizard cannot lock a step the
      // user has already been reading.
      if (now) setPref('maxStep', STEP_LABELS.length - 1)
      render()
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
    case 'set-frame':
      calc.frame.key = btn.dataset.mode
      notify()
      render()
      break
    case 'set-dm-mode':
      calc.dm.mode = btn.dataset.mode
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
      calc.dm.mix.push(newMixRow())
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
    case 'save-calc':
      openSaveDialog(calc, (name, pastureName) => {
        calc.name = name
        calc.pastureName = pastureName
        persist(calc)
        closeModal()
        // The autosave to the working key only runs off notify(). Without it a
        // reload shortly after saving shows the old name in the editor even
        // though the saved record has the new one.
        notify()
        render()
      })
      break
    case 'open-calc': {
      const found = getCalcById(btn.dataset.id)
      if (!found) return
      // Open a COPY. Editing a saved calculation in place would rewrite a record
      // the user may only have wanted to look at.
      //
      // setCalculation notifies, which is what schedules the autosave. Without
      // that, reloading straight after opening a saved calculation would revert
      // to whatever was in the working slot before.
      setCalculation(structuredClone(found))
      setupOpen = false
      setPref('tab', 'perennial')
      setPref('maxStep', STEP_LABELS.length - 1)
      render()
      break
    }
    case 'rename-calc': {
      const found = getCalcById(btn.dataset.id)
      if (!found) return
      openRenameDialog(found, (name) => {
        renameCalc(found.id, name)
        closeModal()
        render()
      })
      break
    }
    case 'tag-calc': {
      const found = getCalcById(btn.dataset.id)
      if (!found) return
      openTagDialog(found.tag, (tag) => {
        tagCalc(found.id, tag)
        render()
      })
      break
    }
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
    case 'clear-all':
      if (!confirm('Clear everything you have entered? Saved calculations are not affected.')) {
        return
      }
      clearWorking()
      setCalculation(newCalculation())
      setupOpen = true
      setPref('step', 0)
      setPref('maxStep', 0)
      render()
      break

    default:
      break
  }
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

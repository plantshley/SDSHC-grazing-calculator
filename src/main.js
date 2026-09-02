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

import {
  getCalculation,
  setCalculation,
  hydrate,
  getActiveType,
  setActiveType,
  makeId,
  setPath,
  subscribe,
  notify,
} from './state.js'
import {
  CALCULATORS,
  calculatorById,
  calculatorFor,
  activeCalculator,
  computeRecord,
} from './calculators.js'
import { DEFAULT_CALC_TYPE } from './schema.js'
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
  getWizard,
  setWizard,
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

import { initAnalytics, track, trackOnce, resetOnce, setUserProps } from './analytics.js'

import { esc } from './ui/format.js'
import { openInfo, openGuide, openModal, closeModal } from './ui/modals.js'
import { openPhoto, releasePhotoViewer } from './ui/photo.js'
import { renderStepper } from './ui/stepper.js'
import { howToPanel } from './ui/steps.js'
import { renderStickyBar, updateOutputs } from './ui/results.js'
import {
  renderSaved,
  openSaveDialog,
  openEditDialog,
  openSaveAsDialog,
  openNewCalcDialog,
  filterTerms,
} from './ui/saved.js'
import { HOW_TO_SECTIONS } from './data/howto.js'

const app = document.querySelector('#app')

/**
 * Where each calculator's wizard has got to, for this session.
 *
 * Per worksheet, because switching tabs must not move the other one's place. All
 * three are session state exactly as `warnedSteps` alone used to be: they are
 * about this run through and have no business surviving a reload or travelling
 * in a saved record.
 *
 *  - `setupOpen`   the landing screen is showing rather than the steps.
 *  - `startedOnce` the steps have been opened at least once. Pressing Change to
 *                  check which forage type was picked is not starting over, so
 *                  coming back lands on the step being worked on; only a genuine
 *                  first start resets to step 1.
 *  - `warned`      steps gone past with a required input still blank. Only these
 *                  say so. A step is blank when you ARRIVE on it, so a note on
 *                  arrival tells you what you can already see, every time, on
 *                  every step: the kind of warning people learn to read past.
 */
const wizards = new Map(
  CALCULATORS.map((d) => [d.id, { setupOpen: true, startedOnce: false, warned: new Set() }])
)

const wizardFor = (type) => wizards.get(type) ?? wizards.get(DEFAULT_CALC_TYPE)

/** The wizard for whichever worksheet is on screen. */
const wz = () => wizardFor(getActiveType())

/**
 * The calculator a tab shows, or null.
 *
 * The Saved tab is not a calculator and must NOT change the active type: it is
 * the one screen you reach from either worksheet, and "+ New calculation", the
 * sticky bar and printSavedCalc()'s restore all need to know which one you came
 * from.
 */
const tabType = (tab) => (CALCULATORS.some((d) => d.id === tab) ? tab : null)

/* ──────────────────────────────── routing ──────────────────────────────── */

/*
 * Every tab has an address: /perennial, /cover-crop and /saved under the
 * deployed base. It is one direction of sync in the app and one in the build.
 *
 * IN THE APP the URL is only ever REPLACED, never pushed. Pressing Back has
 * always left this app and it still does, which matters most in the installed
 * copy on a phone, where Back is the way out and a stack of tab switches would
 * be a stack of presses to get through. What a link has to do is name a tab, and
 * replaceState does that: share it, bookmark it, reload it, and the same tab
 * comes back.
 *
 * IN THE BUILD, vite.config.js writes a copy of index.html at each of those
 * paths plus 404.html. GitHub Pages serves static files and knows nothing about
 * routes, so without the copies /cover-crop is a 404 on the first visit — the
 * service worker's navigateFallback only covers a visit after one that worked.
 * The slugs are in both places and the test asserts they agree.
 */

/** Where the deployed copy lives: '/SDSHC-grazing-calculator/', or '/' in dev. */
const BASE_PATH = import.meta.env?.BASE_URL ?? '/'

/**
 * Tab id -> the path segment naming it.
 *
 * The worksheets bring their own from the registry; `saved` is not a calculator
 * and has no descriptor to carry one.
 */
const ROUTES = new Map([...CALCULATORS.map((d) => [d.id, d.slug]), ['saved', 'saved']])

/** The path this app is being served from, always with one trailing slash. */
const basePath = () => (BASE_PATH.endsWith('/') ? BASE_PATH : `${BASE_PATH}/`)

/**
 * Which tab the address bar names, or null for the bare base URL.
 *
 * Null is not a failure: somebody opening the site with no path is coming back
 * to wherever they were, which is the stored `tab` preference. Only a URL that
 * actually names a tab is allowed to override it.
 */
function tabFromLocation() {
  const path = window.location?.pathname ?? ''
  const base = basePath()
  if (!path.startsWith(base)) return null
  // Lowercased because these get typed off a handout and read out at workshops,
  // where nothing carries the case. /Cover-Crop opens the right worksheet and
  // syncURL() then rewrites the address to the canonical spelling, so a link
  // shared onward from there is the one everything else uses.
  const slug = path.slice(base.length).replace(/^\/+|\/+$/g, '').toLowerCase()
  if (!slug) return null
  return [...ROUTES].find(([, s]) => s === slug)?.[0] ?? null
}

/**
 * Point the address bar at the tab on screen.
 *
 * Called from render(), which is the one funnel every tab change already goes
 * through — eight places set the pref and all eight render afterwards, so this
 * cannot be forgotten at a ninth. That includes printSavedCalc()'s borrow and
 * its restore, which is why this replaces rather than pushes: a print must not
 * leave a history entry pointing at a record the user never opened.
 *
 * The query string and the fragment are carried over. `?noga=1` is the author's
 * analytics opt-out and it is read on every load, so dropping it here would turn
 * reporting back on the first time somebody changed tabs.
 */
function syncURL(tab) {
  const slug = ROUTES.get(tab)
  if (!slug) return
  const { pathname, search, hash } = window.location ?? {}
  // A reload of /cover-crop can land on /cover-crop/ (a static host resolving a
  // directory), and that is the same address. Rewriting it back every render
  // would be churn for nothing.
  if (pathname?.replace(/\/+$/, '') === `${basePath()}${slug}`) return
  window.history?.replaceState?.(null, '', `${basePath()}${slug}${search ?? ''}${hash ?? ''}`)
}

/* ──────────────────────────────── render ───────────────────────────────── */

function render() {
  const tab = getPref('tab')
  const forTab = tabType(tab)

  syncURL(tab)

  // Replacing the markup drops focus to the body, so nothing is being typed into
  // any more. Left standing, a stale flag would hold the spread note back until
  // somebody happened to tap a weight box and leave it again.
  editingSamples = false

  app.innerHTML = `
    ${header(tab)}
    ${forTab ? worksheet(calculatorById(forTab)) : ''}
    ${tab === 'saved' ? renderSaved(listCalcs(), savedFilter, savedKind) : ''}
    ${footer()}`

  if (tab === 'saved') restoreFilterFocus()
  refresh()
}

/**
 * The Saved tab's search box, held outside the record so typing in it neither
 * marks a calculation as changed nor survives a reload as if it were data.
 */
let savedFilter = ''

/**
 * Which calculator's records the Saved tab is showing, or '' for all of them.
 *
 * Held here for the same reason as the search box: it narrows a VIEW of the
 * list, it is not a fact about any calculation, and it has no business surviving
 * a reload as if it were data. Somebody coming back to the tab should find every
 * record they saved, not the subset they last looked at.
 */
let savedKind = ''

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
  const tabs = [...CALCULATORS.map((d) => [d.id, d.tabLabel]), ['saved', 'Saved']]
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
 * full explanation for anyone who wants it. The whole footer is hidden when the
 * page is printed: it is site furniture, and on paper the sentence reads as a
 * caption to the figures above it rather than as a note about the app.
 *
 * NO export links here, unlike farm-budget's copy. Step 5 already carries Save
 * as image, Export CSV and Print, and a card's Save as carries the same four for
 * a stored record. A second set at the foot of the page would act on the WORKING
 * calculation while the Saved tab is showing a list of records that are not it.
 *
 * ONE sentence, and it takes no argument. This used to branch on the tab: the
 * cover crops tab was an embedded JotForm on another origin, and submitting it
 * sent what was typed to JotForm, so the blanket promise was one the app could
 * not keep on one of its three tabs. The native cover crop calculator replaced
 * that tab, and the promise is now true everywhere.
 *
 * DO NOT ADD A BRANCH BACK unless something on a tab genuinely leaves the
 * device. The older JotForm is still linked from the cover crop setup screen,
 * and that link says for itself where its entries go — a link off this site is
 * not the same as a form embedded in it, which is exactly the difference that
 * lets this sentence stand unqualified.
 */
function footer() {
  return `
    <div class="footer">
      <button type="button" class="tip" data-action="how-to">How to use this calculator</button>
      <p class="footer-privacy">
        Your figures stay on this device.
        <button type="button" class="tip" data-info="privacy">Read more</button>
      </p>
      <p>South Dakota Soil Health Coalition</p>
    </div>`
}

/**
 * One worksheet, whichever it is: the landing screen, or the chips, the stepper,
 * the steps and the sticky bar.
 *
 * Everything that differs between calculators comes off the descriptor. What is
 * left here — that a setup screen comes before steps, that the stepper is hidden
 * under "Show all steps", that the bar knows whether this record is in the list —
 * is true of any worksheet this app will ever have.
 */
function worksheet(desc) {
  const calc = getCalculation(desc.id)
  const wizard = wizardFor(desc.id)
  if (wizard.setupOpen) return desc.renderSetup(calc, wizard.startedOnce)

  const showAll = getPref('showAll')
  const { step: stored, maxStep } = getWizard(desc.id)
  const step = clampStep(stored, desc)
  // Whether this calculation is already IN the saved list, not whether it has a
  // name. A duplicate opened and then cleared still carries a name.
  const saved = listCalcs().some((c) => c.id === calc.id)

  return `
    ${desc.renderChips(calc)}
    ${showAll ? '' : renderStepper(desc.stepLabels, step, maxStep)}
    ${desc.renderSteps(calc, step, showAll, wizard.warned)}
    ${renderStickyBar(showAll, calc, saved)}`
}

function clampStep(n, desc = activeCalculator()) {
  return Math.min(Math.max(Number(n) || 0, 0), desc.stepLabels.length - 1)
}

/** Where the wizard on screen has got to, and how to move it. */
const step = () => getWizard(getActiveType()).step
const maxStep = () => getWizard(getActiveType()).maxStep
const setStep = (patch) => setWizard(getActiveType(), patch)

/**
 * Everything before `upto` has been gone past.
 *
 * Every way forward through the worksheet says that. In the wizard: pressing
 * Next, and pressing a circle further along the stepper. Under "Show all steps",
 * where there is no Next: turning the toggle on, which puts every step behind you
 * on the page at once; unfolding a later step; folding away the step you are in,
 * which goes past that step as well; and working in a later step, which is what
 * carries a step that was already open when the toggle went on.
 *
 * mayLeaveStep() marks the ONE step being left, because it also has to decide
 * whether to stay on it; this marks everything behind wherever the user has got
 * to.
 *
 * It writes `data-warned` straight onto the section as well as into the set,
 * because the typing route runs on a keystroke and a keystroke must not
 * re-render the field being typed into. An attribute is not structure, and
 * updateOutputs() reads it on the same notify(). The callers that render anyway
 * get the same attribute back from renderSteps().
 */
function markPassed(upto) {
  const warned = wz().warned
  for (let j = 0; j < upto; j += 1) {
    if (warned.has(j)) continue
    warned.add(j)
    app.querySelector(`.step[data-step="${j}"]`)?.setAttribute('data-warned', '')
  }
}

/**
 * The typing route, off the step an input sits in.
 *
 * Under "Show all steps" only. In the wizard there IS a Next, pressing it is the
 * statement, and only one step is on screen to type in anyway — so this would be
 * a second, silent way into the same set, on a mode that already has an explicit
 * one.
 */
function markStepsBefore(el) {
  if (!getPref('showAll')) return
  const i = Number(el?.closest?.('.step')?.dataset.step)
  if (Number.isInteger(i)) markPassed(i)
}

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
  if (!(computeRecord(getCalculation()).missingByStep?.[from] ?? []).length) return true
  const warned = wz().warned
  if (warned.has(from)) return true
  warned.add(from)
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

  const record = { ...structuredClone(calc), results: computeRecord(calc) }
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
  const desc = activeCalculator()
  const calc = getCalculation()
  const res = computeRecord(calc)

  const slot = app.querySelector('[data-results]')
  if (slot && !slot.dataset.built) {
    slot.innerHTML = desc.renderResults(calc)
    slot.dataset.built = '1'
  }

  // The label map travels with the worksheet: a shortfall has to read in the
  // words the form on screen used, not the other worksheet's.
  updateOutputs(res, app, { spreadNote: !editingSamples, labels: desc.inputLabels })
  paintAutosave()
  trackProgress(calc, res)
  return res
}

/* ──────────────────────────── what GA is told ──────────────────────────── */

/**
 * The three parameters that describe a calculation without describing anybody's
 * operation: which worksheet, which questions it was asked, and which forage or
 * season it was worked for.
 *
 * `goals` goes out as one sorted, comma-joined string rather than three flags.
 * With three goals there are only seven combinations, which is a readable report
 * table, and GA's "contains" filter still gets a per-goal total in one click.
 * The combination is the more interesting half anyway: whether somebody asks one
 * question or runs the whole sheet.
 *
 * What is deliberately NOT here: every number on the worksheet. See analytics.js.
 */
function calcParams(calc) {
  const type = calc?.calcType ?? DEFAULT_CALC_TYPE
  return {
    worksheet: type,
    goals: [...(calc?.goals ?? [])].sort().join(','),
    forage_type: type === DEFAULT_CALC_TYPE ? calc?.forageType || undefined : undefined,
    season: type === DEFAULT_CALC_TYPE ? undefined : calc?.season || undefined,
  }
}

/**
 * The actions worth counting, and what each one is called in GA.
 *
 * An allowlist rather than "track every action": most of the thirty-nine action
 * names are plumbing (`pick-cell`, `add-sample`, `toggle-step`) and counting them
 * would bury the eight questions anybody actually asks of this data.
 *
 * `next-step` and `go-step` are NOT here. Both can turn back at the speed bump in
 * `mayLeaveStep()`, and this map fires before the switch runs, so they would count
 * a move that never happened. They are tracked inside their own cases instead.
 */
const TRACKED_ACTIONS = {
  'toggle-show-all': () => ['show_all_steps', { state: getPref('showAll') ? 'off' : 'on' }],
  'open-photo': (btn) => ['photo_open', { set: btn.dataset.photoSet }],
  'how-to': () => ['guide_open', { source: 'footer' }],
  'open-howto': () => ['guide_open', { source: 'step' }],
  print: () => ['export_file', { format: 'print', scope: 'working' }],
  'export-csv': () => ['export_file', { format: 'csv', scope: 'working' }],
  'export-png': () => ['export_file', { format: 'png', scope: 'working' }],
  'save-as-csv': () => ['export_file', { format: 'csv', scope: 'saved' }],
  'save-as-png': () => ['export_file', { format: 'png', scope: 'saved' }],
  'save-as-json': () => ['export_file', { format: 'json', scope: 'saved' }],
  'save-as-print': () => ['export_file', { format: 'print', scope: 'saved' }],
  'backup-all': () => ['export_file', { format: 'json', scope: 'backup' }],
  'upload-calc': () => ['calc_imported', {}],
  'restore-all': () => ['backup_restored', {}],
  'set-saved-kind': (btn) => ['mode_select', { control: 'saved_filter', choice: btn.dataset.kind || 'all' }],
  // The segmented controls. Every one of these is a decision SDSHC made on the
  // producer's behalf, and none of them was measurable before now.
  'set-dm-mode': (btn) => ['mode_select', { control: 'dry_matter', choice: btn.dataset.mode }],
  'set-frame': (btn) => ['mode_select', { control: 'frame', choice: btn.dataset.mode }],
}

/**
 * One delegated hook for the allowlist above, plus the two events that are about
 * a calculation rather than a button.
 */
function trackAction(action, btn, calc) {
  if (action === 'start') {
    track('worksheet_start', calcParams(calc))
    return
  }
  // A genuinely blank start, so the once-per-calculation events arm again. The
  // id changes too, but clearing is cheaper than letting the set grow all session.
  if (action === 'new-calc' || action === 'choose-new-calc') resetOnce(calc?.id)

  const entry = TRACKED_ACTIONS[action]
  if (!entry) return
  const [name, params] = entry(btn)
  track(name, { worksheet: getActiveType(), ...params })
}

/**
 * A warning's identity, from its own first six words.
 *
 * The models raise warnings as finished sentences and the flat list is what the
 * CSV and the share image carry, so there is no id to send. Slugging the opening
 * is the cheapest thing that reads well in a report ("animal-weight-cannot-be-
 * below-zero"), and it has one real cost worth knowing before you reword a
 * warning: **rewording its first six words starts a new dimension value**, and
 * the old one stops accruing rather than erroring. Giving warnings real ids means
 * changing what `warnings` holds, which every consumer reads. That is a bigger
 * change than analytics should force, so this is the trade taken instead.
 */
function warningId(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join('-')
    .slice(0, 60)
}

/**
 * Finishing, and anything questionable on the way.
 *
 * Both go through `trackOnce()` against the calculation's id: this runs on every
 * keystroke, so an unguarded `results_complete` would fire again for every
 * character typed after the last box was filled.
 */
function trackProgress(calc, res) {
  const goals = calc?.goals ?? []
  if (goals.length && goals.every((g) => !res?.missing?.[g]?.length)) {
    trackOnce(calc.id, 'results_complete', calcParams(calc))
  }
  for (const text of res?.warnings ?? []) {
    trackOnce(calc.id, 'warning_shown', {
      worksheet: calc?.calcType ?? DEFAULT_CALC_TYPE,
      warning_id: warningId(text),
    })
  }
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

/**
 * What a calculator's own handlers are given.
 *
 * render() and the #app element are passed rather than imported, because this
 * module owns the page and a UI module reaching back into it would close a
 * cycle. One object, built once: the handlers are called on every keystroke.
 */
const ctx = {
  render: () => render(),
  closeModal: () => closeModal(),
  root: app,
}


app.addEventListener('input', (e) => {
  if (e.target.hasAttribute?.('data-saved-filter')) {
    savedFilter = e.target.value
    render()
    return
  }

  const path = e.target.dataset?.path
  if (!path) return
  setPath(getCalculation(), path, e.target.value)
  activeCalculator().handleInput?.(e.target, path, ctx)
  markStepsBefore(e.target)
  // Set BEFORE notify(), which is what repaints the page. A weight being typed
  // leaves the spread note as it stands until that box is left; typing anywhere
  // else means no weight is part entered, so the note is settled again.
  editingSamples = isSampleBox(e.target)
  notify()
})

// <select> fires change rather than input in older Safari, so both are wired.
app.addEventListener('change', (e) => {
  const el = e.target
  // Answering anything inside a step counts, not just a typed box: a growth
  // stage is a radio. Everything on the setup screen is outside a .step, so this
  // is inert there.
  markStepsBefore(el)

  // The "what you will need" ticks. A device preference, deliberately not part
  // of the calculation, so this writes to prefs and does not notify().
  if (el.dataset?.need !== undefined) {
    setNeedChecked(el.dataset.need, el.checked)
    return
  }

  // The goals are the one answer every worksheet asks for in the same words.
  if (el.dataset?.action === 'toggle-goal') {
    const calc = getCalculation()
    const goals = new Set(calc.goals)
    if (el.checked) goals.add(el.value)
    else goals.delete(el.value)
    // Kept in the canonical order rather than the order they were clicked, so
    // the result cards, the checklist and the CSV always read the same way.
    // The ACTIVE calculator's list. Both worksheets happen to ask for the same
    // three goals in the same order today, so a hard-coded import works by
    // coincidence — and would silently drop any goal one of them did not share,
    // leaving a ticked box reflected nowhere.
    calc.goals = activeCalculator()
      .goals.map((g) => g.key)
      .filter((k) => goals.has(k))
    notify()
    render()
    return
  }

  // The value goes in FIRST, so a worksheet reacting to a select is reacting to
  // a record that already holds what was chosen. Dispatching first and writing
  // afterwards silently drops the answer on any select the descriptor claims.
  const isSelect = el.dataset?.path && el.tagName === 'SELECT'
  if (isSelect) setPath(getCalculation(), el.dataset.path, el.value)

  // The occupation period is a select rather than a pill row, so it never
  // reaches TRACKED_ACTIONS. It is the same kind of answer as the others and
  // belongs under the same `control` dimension.
  if (el.dataset?.action === 'set-period') {
    track('mode_select', {
      worksheet: getActiveType(),
      control: 'occupation_period',
      choice: el.value,
    })
  }

  // Whatever this worksheet alone knows how to do about it.
  if (activeCalculator().handleChange?.(el, ctx)) return

  if (isSelect) notify()
})

/**
 * Ask before throwing away work that is not in the saved list.
 *
 * The working calculation is autosaved on every keystroke, so nothing is lost
 * by closing the page. It IS lost by replacing the working calculation, which
 * is what "+ New calculation" and opening a saved record both do. So the
 * question is not "have you saved recently", it is "is this one in the list at
 * all": if it is, the figures on screen are a copy of a record that survives.
 *
 * An untouched form is not work, so it goes without asking. What counts as
 * touched is per worksheet — there are no clipped samples on a cover crop sheet —
 * so `started()` comes off the descriptor for the record being REPLACED, which is
 * not necessarily the one on screen.
 *
 * The browser's own dialog, deliberately. A modal of ours could label its buttons
 * "Continue" and "Go back" instead of OK and Cancel, and that was tried: it costs
 * a callback in place of a return value here and at every call site, because a
 * modal cannot block. The words are not worth the shape of the code.
 *
 * @returns {boolean} true to go ahead.
 */
function confirmLeavingUnsaved(what, calc = getCalculation()) {
  if (!calculatorFor(calc).started(calc)) return true
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

/**
 * The list is hiding cards, by either route.
 *
 * Reordering is refused while it is. Dropping a card between two others in a
 * list that is showing half its rows writes an order the user cannot see and did
 * not mean, and that is as true of the calculator pills as it is of the search
 * box — filtering to Cover crop and dragging one card would silently reposition
 * it against perennial records nobody could see.
 */
// filterTerms(), NOT savedFilter.trim(). saved.js decides what counts as a
// filter and drops a lone comma to no terms at all, so `,` in the box leaves the
// list unfiltered, the cards draggable and the hint saying so — while this said
// "narrowed" and made every drag do nothing. Two answers to one question is the
// bug; there is only one answer and it lives in saved.js.
const narrowed = () => filterTerms(savedFilter).length > 0 || !!savedKind

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
  if (!card || narrowed()) return
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
  if (!list || narrowed()) return

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
  setStepOpen(getActiveType(), clampStep(section.dataset.step), true)
  render()
})

/* ───────────────────────────── click actions ───────────────────────────── */

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button')
  if (!btn) return

  // The `?` is read-only, always.
  const info = btn.dataset.info
  if (info) {
    // The FIRST id only. A `?` may open several definitions at once, and sending
    // the joined list would make every combination its own dimension value; the
    // first is the one heading the panel and is what was asked about.
    track('definition_open', { definition_id: info.split(',')[0], worksheet: getActiveType() })
    openInfo(info.split(','), btn.dataset.infoTitle || undefined)
    return
  }

  const action = btn.dataset.action
  if (!action) return
  handleAction(action, btn, e)
})

function handleAction(action, btn) {
  const calc = getCalculation()

  // Whatever only the worksheet on screen knows how to do. Tried first so a
  // calculator can own an action name; everything below is true of all of them.
  // Before the delegation, so a worksheet owning an action name is still counted.
  trackAction(action, btn, calc)

  if (tabType(getPref('tab')) && activeCalculator().handleAction?.(action, btn, ctx)) return

  switch (action) {
    /* chrome */
    case 'set-tab': {
      // The last keystroke may still be inside the 400ms debounce, and the Saved
      // tab is about to draw the record that write updates. Waiting would put a
      // list on screen that is one edit behind and then never redraw it.
      flushSave()
      const tab = btn.dataset.tab
      setPref('tab', tab)
      // The Saved tab is not a calculator, so it leaves the active one alone:
      // that is what "+ New calculation" and the sticky bar read to know which
      // worksheet you came from.
      if (tabType(tab)) setActiveType(tab)
      render()
      break
    }
    case 'how-to':
      openGuide('How to use this calculator', HOW_TO_SECTIONS, { collapsible: true })
      break

    /* setup */
    case 'start':
      wz().setupOpen = false
      // Only a first start goes to step 1. Coming back from Change picks up
      // where the user left off, which is what the button now says it does.
      if (!wz().startedOnce) {
        setStep({ step: 0, maxStep: 0 })
        wz().startedOnce = true
      }
      render()
      // The forage chart is eight rows of photographs, so this is pressed from
      // well down a long screen and Return comes back to a step that was being
      // worked on. Neither leaves a scroll position worth keeping: the setup
      // screen is what it belonged to, and the worksheet that replaces it is a
      // different length.
      scrollToWork(workTarget())
      break
    case 'edit-setup':
      wz().setupOpen = true
      render()
      break
    case 'choose-new-calc':
      // From the Saved tab, where neither worksheet is on screen to be meant.
      openNewCalcDialog()
      break
    case 'new-calc': {
      // Everything goes, including the goals and the forage type, which is what
      // separates this from a step's Clear. Saved records are untouched, and so
      // is the OTHER worksheet: this drops the calculation you are in.
      //
      // `data-kind` is set only by the chooser. From a worksheet's chip row
      // there is no question to ask: it is the worksheet you are standing in.
      const desc = btn.dataset.kind ? calculatorById(btn.dataset.kind) : activeCalculator()
      closeModal()
      if (!confirmLeavingUnsaved('Starting a new calculation', getCalculation(desc.id))) return
      clearWorking(desc.id)
      // A different worksheet has not been warned about anything yet.
      const wizard = wizardFor(desc.id)
      wizard.warned.clear()
      wizard.setupOpen = true
      wizard.startedOnce = false
      setCalculation(desc.newCalculation(), desc.id)
      setActiveType(desc.id)
      setPref('tab', desc.id)
      setWizard(desc.id, { step: 0, maxStep: 0 })
      render()
      scrollToTop()
      break
    }

    /* stepping */
    case 'next-step': {
      if (!mayLeaveStep(clampStep(step()))) break
      const next = clampStep(step() + 1)
      setStep({ step: next, maxStep: Math.max(maxStep(), next) })
      // Past the speed bump, so this move is real. `step` is 1-based here because
      // a report reading "step 0" against a worksheet whose first page is called
      // step 1 is a translation nobody should have to do.
      track('step_advance', { worksheet: getActiveType(), step: next + 1, method: 'next' })
      markPassed(next)
      render()
      scrollToWork(workTarget())
      break
    }
    case 'prev-step':
      setStep({ step: clampStep(step() - 1) })
      render()
      scrollToWork(workTarget())
      break
    case 'go-step': {
      // The stepper offers the next circle as well as the ones behind, so
      // arriving by circle has to raise the high-water mark the same way Next
      // does. Without it the strip would offer step 3, then refuse step 4.
      const to = clampStep(btn.dataset.step)
      // Forward only. Going BACK to check a figure is not leaving a step
      // unfinished, it is the thing the stepper is for.
      const from = clampStep(step())
      if (to > from && !mayLeaveStep(from)) break
      setStep({ step: to, maxStep: Math.max(maxStep(), to) })
      // Forward only here too: going BACK by circle is checking a figure, and
      // counting it as progress would inflate the funnel with the same step twice.
      if (to > from) {
        track('step_advance', { worksheet: getActiveType(), step: to + 1, method: 'stepper' })
      }
      // Forward only, again. Arriving back on step 2 to check a figure does not
      // mean step 1 has been gone past — it means the opposite.
      if (to > from) markPassed(to)
      render()
      scrollToWork(workTarget())
      break
    }
    case 'toggle-show-all': {
      const now = !getPref('showAll')
      // A way of WORKING, not a place in a worksheet, so it stays global and
      // both calculators follow it.
      setPref('showAll', now)
      if (now) {
        const here = clampStep(step())
        // Everything reached, so returning to the wizard cannot lock a step the
        // user has already been reading.
        setStep({ maxStep: activeCalculator().stepLabels.length - 1 })
        // And everything behind where they got to has now been gone past: the
        // steps are all on the page at once, folded, and a step that was filled
        // in on the way through was never bumped, so without this a shortfall
        // that appears later — a Clear, a figure taken back out — would have
        // nothing to say it on.
        markPassed(here)
        // Five sections expanded is a very long page. The reason to turn this
        // on is usually to reach ONE earlier figure, so only the step being
        // left starts open.
        setOpenSteps(getActiveType(), [here])
      }
      render()
      // Turning it on, the landing place is the step this left open just above:
      // the reason to turn the toggle on is to work on that step with the others
      // to hand. Turning it back off, the strip is there again and it is the top
      // of the work exactly as it is for Next. workTarget() reads the mode that
      // was set two lines up, so it answers both.
      scrollToWork(workTarget())
      break
    }
    case 'toggle-step': {
      const i = clampStep(btn.dataset.step)
      const opening = btn.getAttribute('aria-expanded') !== 'true'
      setStepOpen(getActiveType(), i, opening)
      // Unfolding a step further down the page is going past the ones above it.
      // Folding one away is going past THAT one as well — it is the caret's way
      // of saying the same thing Next says, and the count lands on the head the
      // fold just made the only place left to say it.
      markPassed(opening ? i : i + 1)
      render()
      break
    }
    case 'open-howto': {
      const panel = howToPanel(btn.dataset.howto)
      if (panel) openModal(panel.title, panel.html, { wide: true })
      break
    }

    /* photos — the viewer is the same control whatever it is showing */
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
        // Tracked here rather than on the button: `save-calc` opens a dialog that
        // can be cancelled, and a count of dialogs opened is not a count of work
        // kept. `existing` separates a first save from a re-save of the figures.
        track('calc_saved', { ...calcParams(calc), first_save: existing ? 'no' : 'yes' })
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
    case 'set-saved-kind':
      savedKind = btn.dataset.kind ?? ''
      render()
      break
    case 'clear-saved-filter':
      // Both narrowings, because one Clear beside two of them that only undid
      // one would leave a list still hiding cards with nothing saying why.
      savedFilter = ''
      savedKind = ''
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
      const res = computeRecord(found)
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
      const desc = activeCalculator()
      const i = clampStep(btn.dataset.step, desc)
      const fresh = desc.newCalculation()
      for (const key of desc.stepFields[i] ?? []) calc[key] = fresh[key]
      // Whatever this worksheet cannot leave blank — the mix rows take back the
      // forage type the setup screen already named.
      desc.afterClearStep?.(calc, i)
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
  // Which worksheet this record came out of decides where it lands, and which
  // working copy it replaces. From the Saved tab it may well not be the one that
  // was last on screen.
  const desc = calculatorFor(found)
  if (!confirmLeavingUnsaved('Opening a saved calculation', getCalculation(desc.id))) return false

  setCalculation(structuredClone(found), desc.id)
  const wizard = wizardFor(desc.id)
  wizard.warned.clear()
  wizard.setupOpen = false
  wizard.startedOnce = true
  setPref('tab', desc.id)
  setWizard(desc.id, { maxStep: desc.stepLabels.length - 1 })
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
  const borrowed = calculatorFor(found).id
  const wizard = wizardFor(borrowed)
  const before = {
    // The calculator that was ON SCREEN, which the Saved tab has not changed.
    type: getActiveType(),
    tab: getPref('tab'),
    // The slot ABOUT TO BE OVERWRITTEN, which is not necessarily that one:
    // printing a cover crop record while the perennial sheet is active clobbers
    // the COVER CROP working copy. Reading getCalculation() with no argument
    // here saves the wrong record and loses the right one.
    calc: getCalculation(borrowed),
    setup: wizard.setupOpen,
    started: wizard.startedOnce,
  }

  // The step and maxStep prefs are left alone. Print forces every step visible
  // whatever the wizard is showing, so moving them would only disturb the place
  // the user is coming back to.
  setCalculation(structuredClone(found), borrowed)
  wizard.setupOpen = false
  wizard.startedOnce = true
  setPref('tab', borrowed)
  render()

  const restore = () => {
    window.removeEventListener('afterprint', restore)
    setCalculation(before.calc, borrowed)
    // AFTER setCalculation, which makes the slot it wrote the active one. Before
    // it, this is overwritten and the user comes back to the wrong worksheet.
    setActiveType(before.type)
    wizard.setupOpen = before.setup
    wizard.startedOnce = before.started
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

/**
 * " (9 perennial, 3 cover crop)", or nothing when they are all one kind.
 *
 * One backup covers both calculators, so "12 will be replaced by 15" hides the
 * question somebody actually has: whether the file they are about to restore has
 * the cover crop work in it. Silent on a single-kind list, where the breakdown
 * would only repeat the total.
 */
function byKind(list) {
  const counts = CALCULATORS.map((d) => [d, list.filter((c) => calculatorFor(c).id === d.id).length])
  const present = counts.filter(([, n]) => n > 0)
  if (present.length < 2) return ''
  return ` (${present.map(([d, n]) => `${n} ${d.shortName.toLowerCase()}`).join(', ')})`
}

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

    const here = listCalcs()
    const arriving = `This backup holds ${plural(result.calcs.length, 'calculation')}${byKind(
      result.calcs
    )}.`
    const losing = here.length
      ? `Restoring it deletes the ${plural(here.length, 'calculation')}${byKind(
          here
        )} saved on this device now.`
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
  const record = { ...structuredClone(calc), results: computeRecord(calc) }
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

/**
 * The narrow layout, where everything above the worksheet is a stack.
 *
 * Below 900px the tool's name drops to its own row under the topbar, the tab
 * strip and the forage chips sit on rows of their own, and the top of the page
 * is a screenful before the work starts. The same boundary as `.topbar-title` in
 * app.css, deliberately: this is that layout, not a fourth number.
 */
function narrowLayout() {
  return !!window.matchMedia?.('(max-width: 899px)').matches
}

/**
 * Where the top of the work is, in whichever mode is on.
 *
 * The stepper in the wizard: it says which step this is, and that step's head is
 * directly under it.
 *
 * Under "Show all steps" there is no stepper, and the work is the EXPANDED step —
 * the one section that is not a folded head. Not `step`, which is the wizard's
 * current step and goes stale the moment the toggle goes on: nothing in this mode
 * moves it, so it still names wherever the user was when they left the wizard,
 * which may well be folded shut by now. The topmost open one when several are, so
 * the landing is never below work that is already unfolded above it. All of them
 * folded and there is no expanded step to go to, so it falls back to that stale
 * step's head, which is at least a place in the worksheet.
 *
 * Read off the DOM rather than off `openSteps`, because what the user is looking
 * at is the question, and it is the same answer isStepOpen() gave renderSteps().
 * Call it AFTER render() — anything from before it has been thrown away.
 */
function workTarget() {
  if (!getPref('showAll')) return app.querySelector('.stepper')
  const open = [...app.querySelectorAll('.step')].find(
    (section) => !section.querySelector('.step-body')?.hidden
  )
  return open ?? app.querySelector(`.step[data-step="${clampStep(step())}"]`)
}

/**
 * Land on the work rather than on the top of the page.
 *
 * On a phone, moving between steps and scrolling back to `top: 0` puts the
 * header, the tab strip and the chips on screen and the step that was just
 * opened below the fold — a move the user asked for, followed by having to
 * scroll to see that it happened. So the target is put at the top of the screen
 * instead. Wide screens keep the page top: there the same chrome is one compact
 * row, so the top of the page already IS the top of the worksheet and scrolling
 * past it would only throw the tabs away.
 *
 * `scroll-margin-top` on the targets (app.css) keeps the landing off the very
 * edge, so there is a visible sliver of what is above it.
 */
function scrollToWork(el) {
  const target = narrowLayout() ? el : null
  // jsdom has no scrollIntoView at all, and options are not universal either.
  if (target?.scrollIntoView) target.scrollIntoView({ block: 'start', behavior: 'smooth' })
  else scrollToTop()
}

/* ────────────────────────── chrome outside #app ────────────────────────── */

document.addEventListener('click', (e) => {
  const font = e.target.closest('[data-font-choice]')
  if (font) {
    // Both setters return the RESOLVED value, which is not always what is
    // stored: an unset theme follows the system, and an unknown font falls back
    // to `browser`. Reading the pref back would report a blank for the very
    // users who have never touched either control.
    const applied = setFont(font.dataset.fontChoice)
    // The event says somebody went looking for the setting; the user property
    // says what everybody is actually reading in. Both, for the reason set out
    // on initAnalytics().
    track('font_change', { choice: applied })
    setUserProps({ font: applied })
    return
  }
  if (e.target.closest('#themeToggle')) {
    const applied = toggleTheme()
    track('theme_change', { choice: applied })
    setUserProps({ theme: applied })
  }
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

// Both return the resolved value, which is what the user properties want: the
// face and the theme actually on screen, including for somebody who has never
// touched either control.
initAnalytics({ theme: applyTheme(), font: applyFont() })

// Every calculator's working copy comes back, not just the one whose tab is
// showing: the other one is what somebody finds when they switch, and finding it
// blank is the failure this whole shape exists to prevent.
//
// hydrate() rather than setCalculation(), which notifies — restoring is not a
// change, and announcing it would schedule an autosave per slot, rewriting what
// was just read.
for (const desc of CALCULATORS) {
  const restored = loadWorking(desc.id)
  if (!restored) continue
  hydrate(restored, desc.id)
  const wizard = wizardFor(desc.id)
  // Someone with work in progress goes back to it rather than to the landing
  // screen they already answered.
  wizard.setupOpen = !desc.setupAnswered(restored)
  // Work in progress means the steps have been seen before, so pressing Change
  // and coming back must not throw away the step they were on.
  wizard.startedOnce = !wizard.setupOpen
}

// A link wins over the stored preference: somebody who opened /cover-crop asked
// for that worksheet, whatever tab this browser was last on. A bare base URL
// names nothing and leaves the preference alone, which is what brings a returning
// user back to where they were. Before setActiveType(), which reads the pref this
// may have just changed.
const routedTab = tabFromLocation()
if (routedTab) setPref('tab', routedTab)

// The tab decides which worksheet is on screen. The Saved tab names no
// calculator, so it falls back rather than leaving the active one undefined.
setActiveType(tabType(getPref('tab')) ?? DEFAULT_CALC_TYPE)

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

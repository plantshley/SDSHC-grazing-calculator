/**
 * End-to-end smoke test through the real UI.
 *
 * Boots main.js against a jsdom copy of the app shell and walks the flow the
 * way someone using it would: pick the answers, pick the forage, enter sample
 * weights, step through, and read the results off the page.
 *
 * This is the test that catches what calc.test.js cannot, because it exercises
 * the wiring rather than the arithmetic: a data-path that does not match the
 * state shape, a [data-out] key that no longer exists, a step that renders
 * nothing.
 *
 * jsdom loads no CSS, so `el.hidden` here reflects the attribute and not what a
 * browser would actually paint. Anything depending on the stylesheet has to be
 * checked in a real browser.
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const SHELL = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

let dom
let boot

before(async () => {
  dom = new JSDOM(SHELL, { url: 'https://example.test/', pretendToBeVisual: true })

  global.window = dom.window
  global.document = dom.window.document
  // Node 22 defines globalThis.navigator with a getter and no setter, so a
  // plain assignment throws.
  Object.defineProperty(global, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  })
  global.localStorage = dom.window.localStorage
  global.MutationObserver = dom.window.MutationObserver
  global.HTMLElement = dom.window.HTMLElement
  global.Node = dom.window.Node
  global.Blob = dom.window.Blob

  // jsdom implements neither of these and throws "not implemented" rather than
  // returning, which would abort a click handler part way through.
  dom.window.scrollTo = () => {}
  dom.window.confirm = () => true
  dom.window.alert = () => {}
  dom.window.print = () => {}
  global.confirm = dom.window.confirm
  global.alert = dom.window.alert

  boot = await import('../src/main.js')
})

// The tests below run in order and build on each other, the way a session
// does. localStorage is deliberately NOT cleared between them: preferences and
// the autosave are part of what is being exercised.

const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => [...document.querySelectorAll(sel)]

function click(sel) {
  const el = typeof sel === 'string' ? $(sel) : sel
  assert.ok(el, `expected to find ${sel}`)
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  return el
}

/** Set an input the way a user would, so the delegated listener fires. */
function type(sel, value) {
  const el = typeof sel === 'string' ? $(sel) : sel
  assert.ok(el, `expected to find ${sel}`)
  el.value = String(value)
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  return el
}

function choose(sel) {
  const el = typeof sel === 'string' ? $(sel) : sel
  assert.ok(el, `expected to find ${sel}`)
  el.checked = true
  el.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  return el
}

/** Read a rendered figure by its [data-out] key. */
const out = (key) => $(`[data-out="${key}"]`)?.textContent ?? null

test('the app boots to the landing screen', () => {
  assert.ok($('.app-head'), 'header renders')
  assert.ok($('.goal-grid'), 'goals render')
  assert.equal($$('.forage-card').length, 7, 'all seven forage types are shown at once')
  assert.ok($('.forage-mixed'), 'the mixed fallback is offered')
})

test('the start button is disabled until both questions are answered', () => {
  const start = $('[data-action="start"]')
  assert.ok(start.disabled, 'nothing chosen yet')

  choose('input[data-action="toggle-goal"][value="days"]')
  assert.ok($('[data-action="start"]').disabled, 'a goal alone is not enough')

  choose('input[data-action="set-forage"][value="coolSeasonGrass"]')
  assert.ok(!$('[data-action="start"]').disabled, 'both answered')
})

test('the checklist is flat for one goal and sectioned for several', () => {
  choose('input[data-action="toggle-goal"][value="days"]')
  assert.equal($$('.needs-group').length, 0, 'one goal needs no sections')
  assert.ok($('.needs').textContent.includes('Number of animals'))

  choose('input[data-action="toggle-goal"][value="animals"]')
  const groups = $$('.needs-group')
  assert.ok(groups.length >= 3, 'a shared block plus one section per goal')
  assert.ok($('.needs').textContent.includes('For every calculation'))
  assert.ok($('.needs').textContent.includes('How many days you plan to graze'))
})

test('the whole worksheet runs and reproduces the golden fixture', () => {
  // Same numbers as the paper worksheet check in calc.test.js.
  choose('input[data-action="toggle-goal"][value="days"]')
  choose('input[data-action="toggle-goal"][value="acres"]')
  choose('input[data-action="toggle-goal"][value="animals"]')
  choose('input[data-action="set-forage"][value="coolSeasonGrass"]')
  click('[data-action="start"]')

  assert.ok($('.stepper'), 'the stepper appears')
  assert.equal($$('.step-item').length, 5, 'five steps')

  // Step 1
  const boxes = $$('[data-path^="samples."]')
  assert.equal(boxes.length, 5, 'five sample rows by default')
  for (const [i, g] of [20, 25, 30, 25, 25].entries()) type(boxes[i], g)
  assert.equal(out('avgGrams'), '25 g')
  assert.equal(out('sampleCount'), '5')

  // Step 2. Small hoop is the default, so only the stage needs choosing.
  click('[data-action="next-step"]')
  choose('input[data-action="set-stage"][value="headOut"]')
  assert.equal(out('totalProduction'), '2,500 lbs/ac')
  assert.equal(out('dryMatterPct'), '45%')
  assert.equal(out('availableForage'), '1,125 lbs/ac')

  // Step 3
  click('[data-action="next-step"]')
  type('[data-path="usable.amountLeaving"]', 600)
  assert.equal(out('usableForage'), '525 lbs/ac')

  // Step 4
  click('[data-action="next-step"]')
  type('[data-path="demand.animalWeight"]', 1200)
  type('[data-path="demand.numAnimals"]', 50)
  assert.equal(out('perAnimalDemand'), '31.2 lbs/day')
  assert.equal(out('herdDemand'), '1,560 lbs/day')

  // Step 5
  click('[data-action="next-step"]')
  type('[data-path="pasture.totalAcres"]', 160)
  type('[data-path="pasture.ungrazeableAcres"]', 10)
  type('[data-path="pasture.desiredDays"]', 30)

  // acres() drops the decimal above 10, where a tenth of an acre stops being a
  // number anyone acts on.
  assert.equal(out('acresAvailable'), '150 ac')
  assert.equal(out('totalUsableForage'), '78,750 lbs')

  assert.equal(out('grazingDays'), '50.5 days')
  assert.equal(out('acresPerDay'), '2.97 ac')
  assert.equal(out('animalsAllowed'), '84 head')

  assert.equal($$('.warn-list').length, 0, 'a clean worksheet shows no warnings')
})

test('every result card renders its formula in words', () => {
  const formulas = $$('[data-formula]')
  assert.equal(formulas.length, 3, 'one per selected goal')
  for (const el of formulas) {
    assert.ok(el.textContent.length > 20, `${el.dataset.formula} formula is written out`)
  }
})

test('picking two goals that could look contradictory gets a reconciliation line', () => {
  const line = $('[data-reconcile]')
  assert.ok(line, 'shown when both days and animals are selected')
  assert.ok(line.textContent.includes('50 head'), 'names what the user entered')
  assert.ok(line.textContent.includes('84 head'), 'and what the pasture supports')
})

test('the running totals bar tracks the same figures', () => {
  const bar = $('.sticky-bar')
  assert.ok(bar)
  assert.equal(bar.querySelector('[data-out="usableForage"]').textContent, '525 lbs/ac')
  assert.ok(!$('[data-headline-wrap]').hidden, 'a headline figure is showing')
})

test('hidden steps stay in the DOM and stay correct', () => {
  // This is the whole reason computed figures are [data-out] placeholders
  // rather than template literals. Step 2 is not on screen; its numbers must
  // still be right, because the wizard, show-all and print all read them.
  const step2 = $('.step[data-step="1"]')
  assert.ok(step2.hidden, 'step 2 is not the open step')
  assert.equal(
    step2.querySelector('[data-out="availableForage"]').textContent,
    '1,125 lbs/ac',
    'and is still up to date'
  )
})

test('show all reveals every step at once', () => {
  click('[data-action="toggle-show-all"]')
  const steps = $$('.step')
  assert.equal(steps.length, 5)
  assert.ok(
    steps.every((s) => !s.hidden),
    'nothing is hidden'
  )
  assert.equal($$('.stepper').length, 0, 'the stepper stands down')
  click('[data-action="toggle-show-all"]')
  assert.ok($('.stepper'), 'and comes back')
})

test('work survives a reload', async () => {
  assert.equal(out('usableForage'), '525 lbs/ac')

  // The autosave is debounced by 400ms so it does not write on every keystroke.
  await new Promise((r) => setTimeout(r, 600))

  const stored = JSON.parse(localStorage.getItem('sdshc-gc-working'))
  assert.ok(stored, 'the working calculation was written')
  assert.deepEqual(stored.samples, ['20', '25', '30', '25', '25'])
  assert.equal(stored.usable.amountLeaving, '600')
  assert.deepEqual(stored.goals, ['days', 'acres', 'animals'])
})

test('a negative residual is clamped and explained on screen', () => {
  type('[data-path="usable.amountLeaving"]', -600)
  assert.equal(out('usableForage'), '1,125 lbs/ac', 'not credited back')
  assert.ok($('.warn-list'), 'and the page says why')
  type('[data-path="usable.amountLeaving"]', 600)
})

test('the stepper only unlocks steps already reached', () => {
  click('[data-action="go-step"][data-step="0"]')
  const buttons = $$('.step-num')
  assert.ok(!buttons[4].disabled, 'step 5 was reached earlier, so it stays reachable')
  assert.ok(buttons[0].disabled, 'the step you are on is not a link to itself')
})

test('changing the forage type clears a stage that no longer applies', () => {
  click('[data-action="edit-setup"]')
  choose('input[data-action="set-forage"][value="succulentForb"]')
  click('[data-action="start"]')
  click('[data-action="go-step"][data-step="1"]')

  // A forb row has different stages. Keeping "headOut" would resolve to
  // nothing and read as a dry matter of zero with no explanation.
  assert.equal($$('input[data-action="set-stage"]:checked').length, 0)
  assert.equal(out('dryMatterPct'), '0%')
  assert.ok(
    $$('input[data-action="set-stage"]').some((el) => el.value === 'flowering'),
    'and the forb stages are offered instead'
  )
})

test('the mixed fallback offers the whole chart instead of one row', () => {
  click('[data-action="edit-setup"]')
  choose('input[data-action="set-forage"][value="mixed"]')
  click('[data-action="start"]')
  click('[data-action="go-step"][data-step="1"]')

  assert.equal($$('input[data-action="set-stage"]').length, 0, 'no single row to pick from')
  assert.ok($('[data-action="open-chart-picker"]'), 'the chart picker is offered')
})

test('clear all resets the form and returns to setup', () => {
  click('[data-action="clear-all"]')
  assert.ok($('.goal-grid'), 'back on the landing screen')
  assert.equal(localStorage.getItem('sdshc-gc-working'), null, 'and the autosave is gone')
})

test('the cover crops tab embeds the form and names the offline limit', () => {
  click('[data-action="set-tab"][data-tab="covercrop"]')
  const frame = $('[data-cc-frame]')
  assert.ok(frame, 'the form is embedded')
  assert.ok(frame.src.includes('221745599167065'), 'the existing SDSHC form')
  assert.ok(frame.title, 'the frame is named for screen readers')
  assert.ok($('[data-cc-offline]'), 'and the offline notice exists to be shown')
})

test('the saved tab starts empty and says so', () => {
  click('[data-action="set-tab"][data-tab="saved"]')
  assert.ok($('.empty-note'), 'an empty list explains itself')
})

/* ───────────────────── saving, reopening, and export ───────────────────── */

/** Walk the worksheet again with the fixture numbers, from a clean form. */
function runFixture() {
  click('[data-action="set-tab"][data-tab="perennial"]')
  if (!$('.goal-grid')) click('[data-action="edit-setup"]')

  for (const g of ['days', 'acres', 'animals']) {
    const box = $(`input[data-action="toggle-goal"][value="${g}"]`)
    if (!box.checked) choose(box)
  }
  choose('input[data-action="set-forage"][value="coolSeasonGrass"]')
  click('[data-action="start"]')
  click('[data-action="toggle-show-all"]')

  const boxes = $$('[data-path^="samples."]')
  for (const [i, g] of [20, 25, 30, 25, 25].entries()) type(boxes[i], g)
  choose('input[data-action="set-stage"][value="headOut"]')
  type('[data-path="usable.amountLeaving"]', 600)
  type('[data-path="demand.animalWeight"]', 1200)
  type('[data-path="demand.numAnimals"]', 50)
  type('[data-path="pasture.totalAcres"]', 160)
  type('[data-path="pasture.ungrazeableAcres"]', 10)
  type('[data-path="pasture.desiredDays"]', 30)
}

test('a calculation can be named and saved', () => {
  runFixture()
  assert.equal(out('grazingDays'), '50.5 days', 'the fixture is entered')

  click('.sticky-bar [data-action="save-calc"]')
  assert.ok($('#save-name'), 'the save dialog opens')

  $('#save-name').value = 'North pasture, June'
  $('#save-pasture').value = 'North quarter'
  click('[data-save-confirm]')

  const stored = JSON.parse(localStorage.getItem('sdshc-gc-calcs'))
  assert.equal(stored.length, 1)
  assert.equal(stored[0].name, 'North pasture, June')
  assert.equal(stored[0].pastureName, 'North quarter')
  // Headline figures travel with the record so the list does not have to
  // recompute every saved calculation just to draw itself.
  assert.ok(Math.abs(stored[0].results.grazingDays - 50.5) < 0.05)
})

test('a save with no name is refused rather than stored as Untitled', () => {
  click('.sticky-bar [data-action="save-calc"]')
  $('#save-name').value = '   '
  click('[data-save-confirm]')
  assert.ok(!$('.modal-err').hidden, 'the dialog says why')
  assert.equal(JSON.parse(localStorage.getItem('sdshc-gc-calcs')).length, 1, 'nothing was added')
  click('.modal-close')
})

test('the saved list shows the headline figures', () => {
  click('[data-action="set-tab"][data-tab="saved"]')
  const card = $('.saved-card')
  assert.ok(card, 'the calculation is listed')
  assert.ok(card.textContent.includes('North pasture, June'))
  assert.ok(card.textContent.includes('North quarter'))
  assert.ok(card.textContent.includes('50.5 days'), 'grazing days')
  assert.ok(card.textContent.includes('84 head'), 'animals allowed')
})

test('a saved calculation can be renamed', () => {
  click('[data-action="rename-calc"]')
  $('#rename-name').value = 'North pasture, July'
  click('[data-rename-confirm]')
  assert.ok($('.saved-card').textContent.includes('North pasture, July'))
})

test('a saved calculation can be duplicated and deleted', () => {
  click('[data-action="duplicate-calc"]')
  assert.equal($$('.saved-card').length, 2)
  assert.ok(
    $$('.saved-card').some((c) => c.textContent.includes('(copy)')),
    'the copy is named as one'
  )

  // window.confirm is stubbed to true in the before hook.
  click($$('.saved-card')[0].querySelector('[data-action="delete-calc"]'))
  assert.equal($$('.saved-card').length, 1)
})

test('a colour label can be set and removed', () => {
  click('[data-action="tag-calc"]')
  click('[data-tag="teal"]')
  assert.ok($('.saved-card').getAttribute('style').includes('--fld-teal'))

  click('[data-action="tag-calc"]')
  click('[data-tag=""]')
  assert.ok($('.saved-card').getAttribute('style').includes('--fld-grey'), 'falls back to grey')
})

test('reopening a saved calculation restores every entry', () => {
  click('[data-action="open-calc"]')
  assert.ok($('.steps'), 'lands on the worksheet rather than the landing screen')
  assert.equal($('[data-path="demand.animalWeight"]').value, '1200')
  assert.equal($('[data-path="usable.amountLeaving"]').value, '600')
  assert.equal(out('grazingDays'), '50.5 days', 'and recomputes to the same answer')
})

test('a colour survives editing and saving again', () => {
  // Colour the open calculation from the Saved tab, then edit and re-save.
  // The working copy in memory carries no tag, so without the stored value
  // winning, saving strips the colour with nothing on screen to say so.
  click('[data-action="set-tab"][data-tab="saved"]')
  click('[data-action="tag-calc"]')
  click('[data-tag="orange"]')

  click('[data-action="open-calc"]')
  type('[data-path="demand.animalWeight"]', 1250)
  click('.sticky-bar [data-action="save-calc"]')
  click('[data-save-confirm]')

  click('[data-action="set-tab"][data-tab="saved"]')
  assert.ok(
    $('.saved-card').getAttribute('style').includes('--fld-orange'),
    'the colour is still there'
  )
  assert.equal($$('.saved-card').length, 1, 'and it updated rather than adding a second card')
})

test('renaming through the save dialog updates the editor too', async () => {
  click('[data-action="open-calc"]')
  click('.sticky-bar [data-action="save-calc"]')
  $('#save-name').value = 'South pasture, August'
  click('[data-save-confirm]')

  // Saving has to notify() as well as persist, or the working copy keeps the
  // old name and a reload shortly after saving shows it.
  await new Promise((r) => setTimeout(r, 600))
  const working = JSON.parse(localStorage.getItem('sdshc-gc-working'))
  assert.equal(working.name, 'South pasture, August', 'the working copy has the new name too')

  click('[data-action="set-tab"][data-tab="saved"]')
  assert.ok($('.saved-card').textContent.includes('South pasture, August'))
})

test('editing a reopened calculation does not rewrite the saved record', () => {
  click('[data-action="open-calc"]')
  // Opening gives you a copy. Editing in place would rewrite a record someone
  // may only have wanted to look at.
  type('[data-path="demand.numAnimals"]', 100)
  const stored = JSON.parse(localStorage.getItem('sdshc-gc-calcs'))
  assert.equal(stored[0].demand.numAnimals, '50', 'the saved copy is untouched')
  type('[data-path="demand.numAnimals"]', 50)
})

test('a blank input shows a dash and names what is still needed', () => {
  const daysBefore = out('grazingDays')
  const animalsBefore = out('animalsAllowed')
  assert.match(daysBefore, /days$/, 'both answers are showing to begin with')
  assert.match(animalsBefore, /head$/)

  // Not "0 head allowed". That reads as a real answer.
  type('[data-path="pasture.desiredDays"]', '')

  assert.equal(out('animalsAllowed'), '—', 'the answer is withheld')
  const note = $('[data-missing="animals"]')
  assert.ok(!note.hidden, 'and the card says why')
  assert.ok(note.textContent.toLowerCase().includes('days you plan to graze'))
  assert.ok($('[data-formula="animals"]').hidden, 'no formula for a calculation not made')

  // The goal that does not need planned days is unaffected.
  assert.equal(out('grazingDays'), daysBefore)
  assert.ok($('[data-missing="days"]').hidden)

  type('[data-path="pasture.desiredDays"]', 30)
  assert.equal(out('animalsAllowed'), animalsBefore, 'and it comes back')
  assert.ok($('[data-missing="animals"]').hidden)
})

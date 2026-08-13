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
/** The same module instance main.js holds, so this reads the live record. */
let state

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
  state = await import('../src/state.js')
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
  // Seven chart rows plus the mixed fallback, all in one grid so the row reads
  // as one set of eight choices rather than two lists with a footnote.
  assert.equal($$('.forage-card').length, 8, 'all eight forage options are shown at once')
  assert.ok($('.forage-card--mixed'), 'the mixed fallback is offered')
  assert.equal(
    $$('.forage-card .pick-box').length,
    0,
    'no control competes with the photo for the same tap'
  )
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

test('a forage type can be chosen from the expanded photo', () => {
  choose('input[data-action="set-forage"][value="coolSeasonGrass"]')

  // The SECOND card, so the viewer opens on a type that is not already the
  // chosen one. On the chosen one it says so instead of offering the button,
  // which is the branch the next assertion would otherwise be testing.
  $$('.forage-card [data-action="open-photo"]')[1].click()

  const pick = $('[data-pv-pick] [data-action="pick-forage"]')
  assert.ok(pick, 'the viewer offers the photo it is showing')
  const wanted = pick.dataset.value
  assert.notEqual(wanted, 'coolSeasonGrass')
  pick.click()

  assert.equal(
    $('input[data-action="set-forage"]:checked').value,
    wanted,
    'the type from the photo is the one now selected'
  )
})

/**
 * Types carry a LIST of photos, so a card's index into the flattened viewer set
 * is not its position in the grid. Getting that wrong opens the viewer on
 * somebody else's plant, which the photos exist to prevent.
 */
test('each card opens the viewer on its own photo', () => {
  let checked = 0

  for (const card of $$('.forage-card')) {
    const button = card.querySelector('[data-action="open-photo"]')
    assert.ok(button, 'every card has a photo to open, the mixed fallback included')

    const title = card.querySelector('.pick-title').textContent.trim()
    button.click()
    assert.equal($('.pv-label').textContent, title, `${title} opened on its own photo`)
    assert.equal($('.pv-count').textContent, `${Number(button.dataset.photoIndex) + 1} of 8`)
    click('.modal-close')
    checked += 1
  }

  assert.equal(checked, 8, 'every chart row and the mixed fallback were checked')
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

  // Step 2. The form defaults to "Other frame" with an empty box rather than to
  // a hoop nobody confirmed owning, so the frame is chosen here.
  click('[data-action="next-step"]')
  click('[data-action="set-frame"][data-mode="small"]')
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

  // The last step has no Next, so the right-hand end of the row carries the way
  // out to the list this calculation can be kept in.
  const toSaved = $('.step-nav--results [data-action="go-saved"]')
  assert.ok(toSaved, 'the last step offers the way through to the saved list')
  assert.ok(toSaved.classList.contains('btn-step'), 'sized to match Back at the other end')
})

test('a frame preset fills the area box, and typing over it is Other frame', () => {
  click('[data-action="go-step"][data-step="1"]')

  const box = $('[data-path="frame.customArea"]')
  assert.equal(box.value, '0.96', 'the small hoop put its own figure on screen')

  // The box is the answer and the pill is a shortcut to it, so a number of your
  // own moves the pill rather than being overruled by it.
  type(box, '2')
  assert.equal(
    $('[data-action="set-frame"][data-mode="custom"]').getAttribute('aria-pressed'),
    'true',
    'a number of your own is what Other frame means'
  )
  // 96.03 over 2 sq ft, the exact conversion. Only the two hoop presets use the
  // worksheet's round numbers.
  assert.equal(out('totalProduction'), '1,200 lbs/ac')

  click('[data-action="set-frame"][data-mode="small"]')
  assert.equal($('[data-path="frame.customArea"]').value, '0.96', 'and the preset comes back')
  assert.equal(out('totalProduction'), '2,500 lbs/ac', 'on the worksheet constant, not 100.03')

  click('[data-action="go-step"][data-step="4"]')
})

test('a growth stage can be chosen from its photo', () => {
  click('[data-action="go-step"][data-step="1"]')
  click('[data-action="toggle-stage-photos"]')

  const thumbs = $$('.stage-card [data-action="open-photo"]')
  assert.equal(thumbs.length, 5, 'a photo for every stage of the row')
  thumbs[3].click()

  // Same contract as the forage picker: a photo you are looking at in order to
  // decide is a photo you can decide from.
  const pick = $('[data-pv-pick] [data-action="pick-cell"]')
  assert.ok(pick, 'the viewer offers the stage it is showing')
  assert.equal(pick.dataset.stageKey, 'mature')
  assert.equal(pick.dataset.typeId, 'coolSeasonGrass', 'and the row it belongs to travels with it')
  pick.click()

  assert.equal($('input[data-action="set-stage"]:checked').value, 'mature')
  assert.equal(out('dryMatterPct'), '85%')

  choose('input[data-action="set-stage"][value="headOut"]')
  click('[data-action="toggle-stage-photos"]')
  click('[data-action="go-step"][data-step="4"]')
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

test('show all puts every step on the page, collapsed except the current one', () => {
  const wasOn = Number($('.step-item--active .step-num').textContent) - 1
  click('[data-action="toggle-show-all"]')

  const steps = $$('.step')
  assert.equal(steps.length, 5)
  assert.ok(
    steps.every((s) => !s.hidden),
    'every section is on the page'
  )
  assert.equal($$('.stepper').length, 0, 'the stepper stands down')

  // Five expanded sections is a very long page, and the reason to turn this on
  // is usually to reach ONE earlier figure.
  const open = $$('.step-body').filter((b) => !b.hidden)
  assert.equal(open.length, 1, 'only one body starts open')
  assert.equal(
    open[0].closest('.step').dataset.step,
    String(wasOn),
    'and it is the step that was being worked on'
  )

  // A shut body is still in the DOM, so its figures are still refreshed.
  const shut = $('.step[data-step="1"] .step-body')
  assert.ok(shut.hidden, 'step 2 is collapsed')
  assert.equal(
    shut.querySelector('[data-out="availableForage"]').textContent,
    '1,125 lbs/ac',
    'and still up to date'
  )

  // A shut step opens from anywhere in its box, not only from the caret. The
  // click lands on the section itself, which is what a tap on the padding
  // beside the title does.
  click('.step[data-step="1"]')
  assert.ok(!$('.step[data-step="1"] .step-body').hidden, 'and opens from anywhere in the box')

  // Closing it again is the caret's job alone. A box that also closed would
  // fold the step away under a stray click between two of its own fields.
  click('.step[data-step="1"] .step-body')
  assert.ok(!$('.step[data-step="1"] .step-body').hidden, 'and an open one stays open')

  click('.step[data-step="1"] [data-action="toggle-step"]')
  assert.ok($('.step[data-step="1"] .step-body').hidden, 'the caret still shuts it')

  click('[data-action="toggle-show-all"]')
  assert.ok($('.stepper'), 'the stepper comes back')
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

test('Change and back again returns to the step being worked on', () => {
  click('[data-action="go-step"][data-step="3"]')
  click('[data-action="edit-setup"]')

  const start = $('[data-action="start"]')
  assert.ok(start.textContent.includes('Return'), 'the button says it is a return, not a start')

  click(start)
  const open = $$('.step').filter((s) => !s.hidden)
  assert.equal(open.length, 1)
  assert.equal(open[0].dataset.step, '3', 'the step survived the detour')
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

test('the weighted mix builder starts on the type already chosen', () => {
  click('[data-action="set-dm-mode"][data-mode="mix"]')
  assert.equal(
    $('[data-path="dm.mix.0.typeId"]').value,
    'succulentForb',
    'the setup screen already asked this once'
  )

  click('[data-action="add-mix"]')
  const rows = $$('[data-path$=".typeId"]')
  assert.equal(rows.length, 3)
  assert.equal(rows.at(-1).value, 'succulentForb', 'and so does a row added after it')

  click('[data-action="set-dm-mode"][data-mode="stage"]')
})

test('the mixed fallback offers the whole chart instead of one row', () => {
  click('[data-action="edit-setup"]')
  choose('input[data-action="set-forage"][value="mixed"]')
  click('[data-action="start"]')
  click('[data-action="go-step"][data-step="1"]')

  assert.equal($$('input[data-action="set-stage"]').length, 0, 'no single row to pick from')
  assert.ok($('[data-action="open-chart-picker"]'), 'the chart picker is offered')
})

test('a step clears itself and leaves every other step alone', () => {
  // Clear is on each step's own head, so the control names its scope by where it
  // sits. The one in the sticky bar emptied whatever happened to be on screen
  // and had to be read carefully every time.
  const before = state.getCalculation()
  assert.equal(before.frame.key, 'small', 'step 2 is filled in')
  assert.equal(before.demand.animalWeight, '1200', 'and so is step 4')

  click('.step[data-step="1"] [data-action="clear-step"]')

  const after = state.getCalculation()
  assert.equal(after.frame.key, 'custom', 'step 2 is back to its factory defaults')
  assert.equal(after.frame.customArea, '')
  assert.equal(after.dm.stageKey, '')

  assert.deepEqual(after.samples, ['20', '25', '30', '25', '25'], 'step 1 is untouched')
  assert.equal(after.demand.animalWeight, '1200', 'and so is step 4')
  assert.equal(after.pasture.totalAcres, '160', 'and step 5')
  assert.ok(!$('.goal-grid'), 'and it does not throw you back to the setup screen')

  // Every step head carries one, in both modes.
  assert.equal($$('[data-action="clear-step"]').length, 5, 'one Clear per step')
  assert.equal($('[data-action="clear-all"]'), null, 'and none in the sticky bar')
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
  click('[data-action="set-frame"][data-mode="small"]')
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

test('one Edit dialog changes the name, the pasture and the color together', () => {
  click('[data-action="edit-calc"]')
  $('#save-name').value = 'North pasture, July'
  $('#save-pasture').value = 'North half'
  click('[data-tag="violet"]')
  click('[data-save-confirm]')

  const card = $('.saved-card')
  assert.ok(card.textContent.includes('North pasture, July'), 'the name changed')
  assert.ok(card.textContent.includes('North half'), 'and so did the pasture')
  assert.ok(card.classList.contains('fld-c-violet'), 'and the color, in one go')
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

test('a color label can be set and removed', () => {
  click('[data-action="edit-calc"]')
  click('[data-tag="teal"]')
  click('[data-save-confirm]')
  assert.ok($('.saved-card').classList.contains('fld-c-teal'))

  // '' is "no color, deliberately", which has to survive the write. Grey is
  // not offered as a swatch because grey is already what untagged looks like.
  click('[data-action="edit-calc"]')
  click('[data-tag=""]')
  click('[data-save-confirm]')
  assert.ok($('.saved-card').classList.contains('saved-card--untagged'), 'the color came off')
  assert.equal($('.fld-c-grey'), null, 'and grey is not on offer as a color')
})

test('reopening a saved calculation restores every entry', () => {
  click('[data-action="open-calc"]')
  assert.ok($('.steps'), 'lands on the worksheet rather than the landing screen')
  assert.equal($('[data-path="demand.animalWeight"]').value, '1200')
  assert.equal($('[data-path="usable.amountLeaving"]').value, '600')
  assert.equal(out('grazingDays'), '50.5 days', 'and recomputes to the same answer')
})

test('a color survives editing and saving again', () => {
  // Colour the open calculation from the Saved tab, then edit and re-save.
  // The working copy in memory carries no tag, so without the stored value
  // winning, saving strips the colour with nothing on screen to say so.
  click('[data-action="set-tab"][data-tab="saved"]')
  click('[data-action="edit-calc"]')
  click('[data-tag="orange"]')
  click('[data-save-confirm]')

  click('[data-action="open-calc"]')
  type('[data-path="demand.animalWeight"]', 1250)
  click('.sticky-bar [data-action="save-calc"]')
  click('[data-save-confirm]')

  click('[data-action="set-tab"][data-tab="saved"]')
  assert.ok($('.saved-card').classList.contains('fld-c-orange'), 'the color is still there')
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

test('the sticky button edits the record once there is one to edit', () => {
  click('[data-action="open-calc"]')

  // Already in the list, so the button is not offering to create a second
  // record and the dialog it opens says Save changes rather than Save.
  const button = $('.sticky-bar [data-action="save-calc"]')
  assert.ok(button.textContent.includes('Edit'), 'the button changed with the state')

  click(button)
  assert.equal($('[data-save-confirm]').textContent.trim(), 'Save changes')
  assert.ok($('#save-pasture'), 'and the pasture is editable from here too')
  click('.modal-close')

  click('[data-action="set-tab"][data-tab="saved"]')
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

/* ─────────────────── the saved list: colour, search, order ─────────────── */

test('a colour can be chosen at the same time as the name', () => {
  click('[data-action="set-tab"][data-tab="perennial"]')
  click('.sticky-bar [data-action="save-calc"]')

  $('#save-name').value = 'East draw, July'
  click('[data-tag="violet"]')
  assert.equal(
    $('[data-tag="violet"]').getAttribute('aria-pressed'),
    'true',
    'the picker shows what was chosen'
  )
  click('[data-save-confirm]')

  click('[data-action="set-tab"][data-tab="saved"]')
  const card = $$('.saved-card').find((c) => c.textContent.includes('East draw, July'))
  assert.ok(card, 'the new calculation is listed')
  assert.ok(card.classList.contains('fld-c-violet'), 'with the colour it was saved under')
})

test('the search box filters the list and turns reordering off', () => {
  // Saving an open calculation UPDATES its record, so a second one has to be
  // made deliberately rather than by saving twice.
  click('[data-action="duplicate-calc"]')
  click('[data-action="edit-calc"]')
  $('#save-name').value = 'West flat, May'
  click('[data-save-confirm]')
  assert.equal($$('.saved-card').length, 2, 'two to choose between')

  type('[data-saved-filter]', 'east draw')
  assert.equal($$('.saved-card').length, 1, 'only the match is listed')
  assert.ok($('.saved-card').textContent.includes('East draw'))

  // Reordering a list that is hiding half its rows writes an order the user
  // cannot see and did not mean, so the handle is switched off while filtering.
  assert.equal($('.saved-grip').getAttribute('draggable'), 'false')

  type('[data-saved-filter]', 'no such pasture')
  assert.equal($$('.saved-card').length, 0)
  assert.ok($('.empty-note').textContent.includes('no such pasture'))

  click('[data-action="clear-saved-filter"]')
  assert.equal($$('.saved-card').length, 2, 'and clearing brings them back')
  assert.equal($('.saved-grip').getAttribute('draggable'), 'true')
})

test('a saved calculation can be searched by pasture and by forage', () => {
  type('[data-saved-filter]', 'cool season')
  assert.ok($$('.saved-card').length >= 1, 'the forage type is searchable too')
  click('[data-action="clear-saved-filter"]')
})

test('the saved list can be dragged into an order that sticks', () => {
  const before = $$('.saved-card').map((c) => c.querySelector('.saved-name').textContent)
  assert.equal(before.length, 2, 'two cards to swap')

  // jsdom lays nothing out, so every getBoundingClientRect is zeroes and the
  // drop target cannot be worked out from coordinates. The drag is exercised
  // through its two ends instead: the DOM order at drop time is what gets
  // written, which is the contract commitOrder() actually has.
  const list = $('[data-saved-list]')
  const [first, second] = $$('.saved-card')
  first.dispatchEvent(new dom.window.MouseEvent('dragstart', { bubbles: true }))
  list.insertBefore(first, second.nextElementSibling)
  first.dispatchEvent(new dom.window.MouseEvent('dragend', { bubbles: true }))

  const after = $$('.saved-card').map((c) => c.querySelector('.saved-name').textContent)
  assert.deepEqual(after, [before[1], before[0]], 'the order swapped on screen')

  const stored = JSON.parse(localStorage.getItem('sdshc-gc-calcs'))
  assert.ok(
    stored.every((c) => Number.isFinite(Number(c.sortIndex))),
    'and every record carries its position'
  )

  click('[data-action="set-tab"][data-tab="perennial"]')
  click('[data-action="set-tab"][data-tab="saved"]')
  assert.deepEqual(
    $$('.saved-card').map((c) => c.querySelector('.saved-name').textContent),
    after,
    'the order survives leaving the tab and coming back'
  )
})

test('a saved calculation can be filtered by the date on its card', () => {
  // Matched as DISPLAYED. Someone typing a date is reading the line on the
  // card, not the ISO timestamp underneath it.
  const shown = $('.saved-meta').textContent.match(/saved (.+)$/m)[1].trim()
  type('[data-saved-filter]', shown)
  assert.equal($$('.saved-card').length, 2, 'both were saved today')
  click('[data-action="clear-saved-filter"]')
})

test('the filter takes several words at once, separated by commas', () => {
  // The two cards are "East draw, July" and "West flat, May".
  type('[data-saved-filter]', 'east')
  assert.equal($$('.saved-card').length, 1, 'one word, one card')

  // OR, not AND. Typing already narrows; the comma is for pulling two pastures
  // up beside each other, which nothing else on this tab does.
  type('[data-saved-filter]', 'east, may')
  assert.equal($$('.saved-card').length, 2, 'either word matching is enough')

  type('[data-saved-filter]', 'east, no such pasture')
  assert.equal($$('.saved-card').length, 1, 'a word that matches nothing adds nothing')

  // A stray comma is not a filter. Left as one it would hide nothing and still
  // switch reordering off, which reads as the handle having broken.
  type('[data-saved-filter]', ' , ')
  assert.equal($$('.saved-card').length, 2, 'punctuation on its own filters nothing')
  assert.equal($('.saved-grip').getAttribute('draggable'), 'true', 'and reordering stays on')
  assert.equal($('[data-action="clear-saved-filter"]'), null, 'nothing to clear, so no Clear')

  type('[data-saved-filter]', '')
})

test('New calculation puts the work down and starts again', () => {
  click('[data-action="set-tab"][data-tab="perennial"]')
  const before = state.getCalculation().id

  // Clear empties the boxes and keeps the two setup answers. This one is the
  // NEXT calculation: the answers go too, and it lands back on the setup screen.
  click('[data-action="new-calc"]')

  assert.ok($('.goal-grid'), 'back on the setup screen')
  assert.notEqual(state.getCalculation().id, before, 'a new record, not the old one emptied')
  assert.deepEqual(state.getCalculation().goals, [], 'the goals go too, unlike Clear')
  assert.equal(state.getCalculation().forageType, '')
  assert.equal(localStorage.getItem('sdshc-gc-working'), null, 'and the autosave with them')
  assert.equal(
    JSON.parse(localStorage.getItem('sdshc-gc-calcs')).length,
    2,
    'saved records are not touched'
  )

  const start = $('[data-action="start"]')
  assert.ok(start.disabled, 'nothing is answered yet')
  assert.ok(start.textContent.includes('Start'), 'and it is a start, not a return')
  assert.ok($('.start-warn'), 'with the reason on the row beside it')
})

test('the stepper offers the next circle, and a step says what it still needs', () => {
  // Straight after New calculation, so nothing has been reached but step 1.
  choose('input[data-action="toggle-goal"][value="days"]')
  choose('input[data-action="set-forage"][value="coolSeasonGrass"]')
  click('[data-action="start"]')
  // "Show all steps" is a device preference and survived the new calculation.
  // There is no stepper while it is on, which is the whole point of it.
  if (!$('.stepper')) click('[data-action="toggle-show-all"]')

  const nums = $$('.step-num')
  assert.ok(!nums[1].disabled, 'the next circle is live, so it is another way to press Next')
  assert.ok(nums[2].disabled, 'the one after it is not: the strip still says where the work got to')

  // A step is blank when you arrive on it, so saying it is unfinished on arrival
  // is telling the user what they can already see.
  assert.equal($('[data-step-missing="0"]'), null, 'nothing is said just for turning up')

  // Trying to leave it is the moment that changes. The first press stays put.
  click('[data-action="next-step"]')
  assert.equal($('.step-item--active .step-num').textContent, '1', 'still on step 1')
  const note = $('[data-step-missing="0"]')
  assert.ok(note && !note.hidden, 'and now it names what it is still waiting for')
  assert.ok(note.textContent.toLowerCase().includes('clipped forage samples'))

  // Once said, it is not said again: a partly filled worksheet still shows every
  // sub-result it can, and refusing to move would stop someone reading ahead.
  click('[data-action="next-step"]')
  assert.equal($('.step-item--active .step-num').textContent, '2', 'a second press goes through')

  click('[data-action="prev-step"]')
  const boxes = $$('[data-path^="samples."]')
  for (const [i, g] of [20, 25, 30, 25, 25].entries()) type(boxes[i], g)
  assert.ok($('[data-step-missing="0"]').hidden, 'the note goes as soon as the box is filled')

  click($$('.step-num')[1])
  assert.ok(!$$('.step-num')[2].disabled, 'arriving by circle unlocks the next one in turn')
})

test('To Saved writes a calculation that is not in the list yet', () => {
  // Steps 2 to 4 are still blank, so each costs one press to be told and one to
  // go on anyway. Counting presses would make this test pass on a hidden step 5
  // that was never reached, so it walks until it is actually there.
  const at = () => $('.step-item--active .step-num').textContent
  for (let i = 0; i < 12 && at() !== '5'; i += 1) click('[data-action="next-step"]')
  assert.equal(at(), '5', 'the last step is the one on screen')

  const before = JSON.parse(localStorage.getItem('sdshc-gc-calcs')).length
  click('[data-action="go-saved"]')

  // A button that says "to saved" must not land on a list this calculation is
  // missing from.
  const stored = JSON.parse(localStorage.getItem('sdshc-gc-calcs'))
  assert.equal(stored.length, before + 1, 'it was written on the way')
  assert.ok(
    stored.some((c) => c.id === state.getCalculation().id),
    'and the record is this calculation rather than a copy of another'
  )
  assert.equal($$('.saved-card').length, before + 1, 'the tab it lands on is showing it')
})

test('Save as offers the four ways a calculation leaves the app', () => {
  const card = $$('.saved-card')[0]
  const id = card.dataset.calcId
  click(card.querySelector('[data-action="save-as"]'))

  const items = $$('.save-as-item')
  assert.deepEqual(
    items.map((b) => b.dataset.action),
    ['save-as-png', 'save-as-csv', 'save-as-print', 'save-as-json'],
    'the image first, the file last'
  )
  // Every choice carries the id of the card it was opened from. The dialog is
  // a sibling of the list, not a child of the card, so nothing else says which
  // calculation is being written out.
  assert.ok(
    items.every((b) => b.dataset.id === id),
    'and all four name the same calculation'
  )
  click('.modal-close')
})

test('Print from a card borrows that calculation and gives it back', () => {
  click('[data-action="set-tab"][data-tab="saved"]')
  const card = $$('.saved-card').find((c) => c.dataset.calcId !== state.getCalculation().id)
  assert.ok(card, 'a record that is not the one being worked on')
  const id = card.dataset.calcId
  const working = state.getCalculation().id

  // Stands in for the print dialog: the browser lays the page out, then fires
  // afterprint when the dialog goes away, whether it was cancelled or not.
  let onScreen = null
  const realPrint = dom.window.print
  dom.window.print = () => {
    onScreen = { id: state.getCalculation().id, steps: !!$('.steps') }
    dom.window.dispatchEvent(new dom.window.Event('afterprint'))
  }

  click(card.querySelector('[data-action="save-as"]'))
  click('[data-action="save-as-print"]')
  dom.window.print = realPrint

  // Printing prints the page, so the record has to BE the page while the dialog
  // is up. From the Saved tab it would otherwise print the list.
  assert.deepEqual(onScreen, { id, steps: true }, 'the record is what went to the printer')

  // And then it is handed straight back. Cancelling the dialog was leaving
  // somebody standing in a calculation they never asked to open.
  assert.equal(state.getCalculation().id, working, 'the working calculation is back')
  assert.ok($('.saved-list'), 'on the tab the button was pressed from')
})

test('a backup carries the whole list, and the two file kinds are told apart', async () => {
  const storage = await import('../src/storage.js')
  const list = storage.listCalcs()
  assert.ok(list.length >= 2, 'more than one to back up')

  const backup = storage.exportBackupJSON()
  const tagged = list.find((c) => c.tag)
  assert.ok(tagged, 'one of them carries a colour')

  // A colour and a list position describe THIS device's list. They travel in a
  // backup, which restores a list onto itself, and are stripped from a single
  // calculation, which lands in somebody else's.
  const single = JSON.parse(storage.exportCalcJSON(tagged))
  assert.equal(single.tag, undefined)
  assert.equal(single.sortIndex, undefined)
  assert.ok(
    JSON.parse(backup).calculations.find((c) => c.id === tagged.id).tag,
    'but the backup keeps it'
  )

  // Both files are .json and both came out of this app, so each control has to
  // name the other rather than refuse the file as unreadable.
  const asCalc = storage.importCalcJSON(backup)
  assert.equal(asCalc.ok, false)
  assert.match(asCalc.error, /Restore backup/)

  const asBackup = storage.importBackupJSON(JSON.stringify(single))
  assert.equal(asBackup.ok, false)
  assert.match(asBackup.error, /Upload a calculation/)

  // An empty backup is refused. Restoring one would be a way to delete every
  // calculation on the device by agreeing to a dialog about a file that turned
  // out to hold nothing.
  const empty = storage.importBackupJSON(
    JSON.stringify({ kind: JSON.parse(backup).kind, calculations: [] })
  )
  assert.equal(empty.ok, false)

  const read = storage.importBackupJSON(backup)
  assert.equal(read.ok, true)
  assert.equal(read.calcs.length, list.length)

  // Restore REPLACES. A merge would leave a device that was restored to clear
  // out a mistake still holding the mistake.
  storage.replaceAll(read.calcs.slice(0, 1))
  assert.equal(storage.listCalcs().length, 1)
  storage.replaceAll(read.calcs)
  assert.equal(storage.listCalcs().length, list.length, 'and the list comes back whole')
})

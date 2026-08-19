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
  // A module calling bare addEventListener() gets window's in a browser. Without
  // these two, covercrop.js's online/offline wiring throws a ReferenceError the
  // moment that tab is opened, which is noise in the output at best and cover for
  // a real error at worst.
  global.addEventListener = dom.window.addEventListener.bind(dom.window)
  global.removeEventListener = dom.window.removeEventListener.bind(dom.window)
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

  // Leaving a preset for Other frame empties the box. 0.96 left sitting there
  // is the hoop's figure, not the user's, and it is plausible enough as
  // somebody's own frame that nothing on screen would say otherwise.
  click('[data-action="set-frame"][data-mode="custom"]')
  assert.equal($('[data-path="frame.customArea"]').value, '', 'the preset does not follow you out')
  // Which puts the app back in exactly the state it starts in: Other frame with
  // an empty box is the app's way of saying the frame is still outstanding, so
  // every answer goes back to a dash until a measurement is typed.
  assert.equal($('[data-headline="days"]').textContent, '—')

  // But pressing Other frame while already on it is not a change of mind, and
  // must not wipe a measurement that was typed in.
  type('[data-path="frame.customArea"]', '2')
  click('[data-action="set-frame"][data-mode="custom"]')
  assert.equal($('[data-path="frame.customArea"]').value, '2')

  click('[data-action="set-frame"][data-mode="small"]')
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

test('a folded step wears a count, once it has been gone past', () => {
  const pill = () => $('[data-step-pill="2"]')
  const note = () => $('[data-step-missing="2"]')

  // This worksheet was walked forward to step 5, by Next and by the stepper, so
  // every step behind it has been gone past — filled in on the way, and so never
  // bumped by mayLeaveStep(). Turning the toggle on marks them too, for the same
  // reason: it puts the lot on the page at once, behind you.
  assert.ok($('.step[data-step="2"]').hasAttribute('data-warned'), 'step 3 is behind us')
  click('[data-action="toggle-show-all"]')
  assert.ok($('.step[data-step="2"]').hasAttribute('data-warned'), 'and still is, folded')
  assert.ok(pill().hidden, 'which says nothing while the step is finished')

  // Empty step 3 while it is folded shut, and the head is the only place left to
  // say so: the note is in the page, correct, and folded away with the body.
  assert.ok($('.step[data-step="2"] .step-body').hidden, 'step 3 is folded')
  click('.step[data-step="2"] [data-action="clear-step"]')
  assert.ok(!pill().hidden, 'the shut head carries the count')
  assert.equal(pill().textContent, '1 missing')
  assert.ok(!note().hidden, 'with the note itself waiting inside')

  // Open it and the count stands down: the note is two lines below the head, and
  // the same shortfall twice in one box reads as two problems.
  click('.step[data-step="2"] [data-action="toggle-step"]')
  assert.ok(pill().hidden, 'the count is for a shut step only')
  assert.ok(!note().hidden, 'the note has the head to itself')

  // Both are placeholders like every figure on the page: they clear themselves
  // on the keystroke that answers them, not at the next render.
  type('[data-path="usable.amountLeaving"]', 600)
  assert.ok(note().hidden, 'the note goes as soon as the box is filled')
  click('.step[data-step="2"] [data-action="toggle-step"]')
  assert.ok(pill().hidden, 'and there is nothing left for the head to say')

  // Step 5 collects nothing of its own, so it can never owe anything.
  assert.equal($('[data-step-pill="4"]'), null, 'the results head has no count')

  click('[data-action="toggle-show-all"]')
  assert.ok($('.stepper'), 'back to one step at a time for what follows')
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

test('the cover crops tab is a calculator of its own, not an embedded form', () => {
  click('[data-action="set-tab"][data-tab="covercrop"]')

  // It was a cross-origin JotForm in an iframe, which could not be cached and
  // did not work offline. Nothing typed into it could be saved, named, exported,
  // or compared against a perennial calculation.
  assert.equal($('[data-cc-frame]'), null, 'the iframe is gone')
  assert.ok($('.goal-grid'), 'its own setup screen asks what to work out')
  assert.ok(
    $('input[data-action="set-season"][value="cool"]'),
    'and which season the stand is dominated by'
  )

  // The older online version stays reachable, and says for itself where its
  // entries go — which is what lets the footer's one sentence stand unqualified.
  const link = $('.cc-jotform a')
  assert.ok(link, 'the JotForm is still linked')
  assert.ok(link.href.includes('221745599167065'), 'and it is the same form')
  assert.match($('.cc-jotform').textContent, /goes to\s+JotForm|JotForm rather than/i)
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
  // is telling the user what they can already see. The placeholder is in the page
  // from the start, like every figure is, and says nothing until it has something
  // to say.
  assert.ok($('[data-step-missing="0"]').hidden, 'nothing is said just for turning up')
  assert.ok(!$('.step[data-step="0"]').hasAttribute('data-warned'), 'and nothing marks it yet')

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

test('a step ahead of where you got to is not warned about', () => {
  // Carries on from above: a fresh worksheet, on step 2, with only step 1 filled
  // in and everything after it blank.
  click('[data-action="toggle-show-all"]')
  assert.ok(
    !$('.step[data-step="2"]').hasAttribute('data-warned'),
    'the toggle marks what is behind you, not what is in front'
  )
  assert.ok($('[data-step-pill="2"]').hidden, 'so no head says anything about step 3')

  // Unfolding step 4 to read it is going past the steps above it: the same
  // statement Next makes, made with a caret. There is no Next in this mode.
  click('.step[data-step="3"] [data-action="toggle-step"]')
  assert.ok(!$('[data-step-pill="2"]').hidden, 'and now step 3 says so')
  assert.equal($('[data-step-pill="2"]').textContent, '1 missing')

  // Step 2 was gone past as well, but it is the one body left open, so it says
  // it at length instead of as a count.
  assert.ok(!$('.step[data-step="1"] .step-body').hidden, 'step 2 is the open one')
  assert.ok($('[data-step-pill="1"]').hidden, 'so its head keeps quiet')
  assert.ok(!$('[data-step-missing="1"]').hidden, 'and the note in its body does the talking')

  // Working in a step counts too, which is what carries this for a step that was
  // already open when the toggle went on.
  type('[data-path="demand.animalWeight"]', 1100)
  assert.equal($('[data-step-pill="2"]').textContent, '1 missing', 'the count holds while work goes on')

  // Folding step 4 away is going past step 4 itself, and the head it just folded
  // is the only place left to say what step 4 still owes.
  assert.ok($('[data-step-pill="3"]').hidden, 'nothing on step 4 while you are in it')
  click('.step[data-step="3"] [data-action="toggle-step"]')
  assert.ok(!$('[data-step-pill="3"]').hidden, 'putting it away is finishing with it')
  assert.equal($('[data-step-pill="3"]').textContent, '1 missing', 'the herd size, now the weight is in')

  click('[data-action="toggle-show-all"]')
})

test('on a phone a step change lands on the work, not on the top of the page', () => {
  // Carries on from above: the wizard, on step 2, with the stepper on the page.
  // jsdom has neither layout nor media queries and no scrollIntoView at all, so
  // both halves of the decision are stood in for. Restored in the finally, since
  // every test after this one shares the window.
  const realMatch = dom.window.matchMedia
  const realScroll = dom.window.scrollTo
  let landed = null
  let toTop = 0
  dom.window.Element.prototype.scrollIntoView = function () {
    landed = this
  }
  dom.window.scrollTo = () => {
    toTop += 1
  }

  try {
    dom.window.matchMedia = () => ({ matches: true })
    // Step 2 has already been warned about, so one press goes through.
    click('[data-action="next-step"]')
    assert.equal($('.step-item--active .step-num').textContent, '3', 'it moved on')
    assert.equal(landed, $('.stepper'), 'and the strip is what the screen starts at')
    assert.equal(toTop, 0, 'the header is not what the user asked to see')

    landed = null
    click($$('.step-num')[1])
    assert.equal(landed, $('.stepper'), 'a circle lands in the same place')

    // No stepper in show-all mode: the step left open is the work.
    landed = null
    click('[data-action="toggle-show-all"]')
    assert.equal(landed, $('.step[data-step="1"]'), 'the open step starts at the top')

    // Nothing in this mode moves the wizard's current step, so it is stale, and
    // the expanded step is the one the user is actually in. Fold step 2, unfold
    // step 4, and the two disagree.
    click('.step[data-step="1"] [data-action="toggle-step"]')
    click('.step[data-step="3"] [data-action="toggle-step"]')
    assert.ok($('.step[data-step="1"] .step-body').hidden, 'step 2 is away')
    landed = null
    click('[data-action="edit-setup"]')
    click('[data-action="start"]')
    assert.equal(landed, $('.step[data-step="3"]'), 'Return lands on the expanded step')

    click('.step[data-step="3"] [data-action="toggle-step"]')
    landed = null
    click('[data-action="edit-setup"]')
    click('[data-action="start"]')
    assert.equal(
      landed,
      $('.step[data-step="1"]'),
      'with every step folded there is nowhere better than the step it came from'
    )

    landed = null
    click('[data-action="toggle-show-all"]')
    assert.equal(landed, $('.stepper'), 'and the strip is back to land on')

    // Change and back again in the wizard: the scroll position belonged to the
    // setup screen, and the forage chart it was left in is eight rows of photos.
    landed = null
    click('[data-action="edit-setup"]')
    click('[data-action="start"]')
    assert.equal(landed, $('.stepper'), 'Return lands on the work too')

    // A wide screen keeps the page top, where that chrome is one compact row.
    dom.window.matchMedia = () => ({ matches: false })
    landed = null
    click('[data-action="next-step"]')
    assert.equal(landed, null, 'nothing is scrolled past on a desktop')
    assert.equal(toTop, 1, 'the top of the page is the landing place there')
  } finally {
    dom.window.matchMedia = realMatch
    dom.window.scrollTo = realScroll
    delete dom.window.Element.prototype.scrollIntoView
  }
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

test('a definition does not say its own name twice', () => {
  // The `?` beside the file controls opens one definition, so the modal head
  // already carries the term. An <h3> repeating it was the first line of the
  // panel every time.
  click('[data-info="backupFile"]')
  assert.equal($('.modal-title').textContent, 'Backups and calculation files')
  assert.equal($('.modal-body h3'), null, 'and the body starts on the prose')
  assert.ok($('.def p'), 'which is there')
  click('.modal-close')

  // Several definitions at once still need their own headings, because the
  // modal head names the section rather than any one term.
  click('[data-action="set-tab"][data-tab="perennial"]')
  const section = $('.help-btn[data-info-title]')
  assert.ok(section, 'a section `?` covering more than one term')
  click(section)
  assert.equal($('.modal-title').textContent, section.dataset.infoTitle)
  assert.ok($$('.def-fold > summary').length > 1, 'one fold per term')
  click('.modal-close')
})

test('Mono is a third font choice and a bad stored value is not', async () => {
  const prefs = await import('../src/prefs.js')
  const seg = (choice) => $(`[data-font-choice="${choice}"]`)

  assert.deepEqual(
    $$('[data-font-choice]').map((b) => b.dataset.fontChoice),
    ['browser', 'classic', 'mono']
  )

  click(seg('mono'))
  assert.equal(document.documentElement.dataset.font, 'mono')
  assert.equal(seg('mono').getAttribute('aria-pressed'), 'true')
  assert.equal(seg('browser').getAttribute('aria-pressed'), 'false')
  assert.equal(prefs.getPref('font'), 'mono', 'and it is remembered')

  // A value from an older build, or a hand-edited key. The page must not end up
  // with no --font at all.
  prefs.setPref('font', 'comic')
  assert.equal(prefs.applyFont(), 'browser')
  assert.equal(document.documentElement.dataset.font, 'browser')

  prefs.setFont('browser')
})

test('the browser bar colour follows the theme toggle', async () => {
  const prefs = await import('../src/prefs.js')
  const meta = () => $('meta[name="theme-color"]').getAttribute('content')

  prefs.setPref('theme', 'light')
  prefs.applyTheme()
  const light = meta()

  prefs.setPref('theme', 'dark')
  prefs.applyTheme()
  assert.notEqual(meta(), light, 'a dark page does not keep a light browser bar')

  prefs.setPref('theme', 'light')
  prefs.applyTheme()
  assert.equal(meta(), light)
})

test('the sticky bar says whether the autosave has landed', async () => {
  const storage = await import('../src/storage.js')
  click('[data-action="set-tab"][data-tab="perennial"]')
  const bar = () => $('[data-autosave]')

  // Only for a calculation that is in the saved list. Beside a button reading
  // "Save calculation" a line reading "Saved" contradicts it, and the button is
  // the one that decides whether the work survives the browser being cleared.
  assert.ok(
    storage.listCalcs().some((c) => c.id === state.getCalculation().id),
    'this test is standing on a calculation that IS in the list'
  )
  assert.ok($('[data-action="save-calc"]').textContent.includes('Edit'), 'so the button edits')

  type('[data-path="demand.animalWeight"]', '1201')
  assert.equal(bar().hidden, false)
  assert.match(bar().textContent, /Saving/, 'while the debounce is still pending')

  return new Promise((resolve) => {
    setTimeout(() => {
      assert.match(bar().textContent, /Saved/, 'and once it is written')
      assert.ok(bar().classList.contains('is-saved'))
      // The state survives a full render, which rebuilds the bar. It is a
      // [data-autosave] placeholder for the same reason every figure on the bar
      // is a [data-out] one.
      click('[data-action="toggle-show-all"]')
      assert.match($('[data-autosave]').textContent, /Saved/)
      click('[data-action="toggle-show-all"]')
      type('[data-path="demand.animalWeight"]', '1200')

      // And it says nothing at all for work that is not in the list yet.
      click('[data-action="new-calc"]')
      choose('input[data-action="toggle-goal"][value="days"]')
      choose('input[data-action="set-forage"][value="coolSeasonGrass"]')
      click('[data-action="start"]')
      assert.ok(
        $('[data-action="save-calc"]').textContent.includes('Save'),
        'the button still offers to save'
      )
      assert.equal(bar().dataset.listed, '0')
      type('[data-path="demand.animalWeight"]', '900')
      assert.equal(bar().hidden, true, 'so nothing beside it says the work already is saved')
      assert.equal(bar().textContent, '')
      resolve()
    }, 500)
  })
})

test('a failed autosave says so even on work that was never saved', () => {
  // The element is in the page whatever the calculation's status, and
  // paintAutosave() decides. Gating the ELEMENT on being in the saved list hid
  // this message from brand new work, which is the work it exists for: a
  // browser that refuses to store anything is losing every keystroke, and the
  // user has pressed nothing that would have told them.
  // Swapped at the global, not by assigning over `setItem` on jsdom's Storage:
  // that object is a Proxy where an unknown property write stores an ITEM, so
  // `store.setItem = fn` quietly saves a value under the key "setItem" and
  // leaves the real method in place.
  const real = global.localStorage
  global.localStorage = {
    getItem: (k) => real.getItem(k),
    removeItem: (k) => real.removeItem(k),
    setItem: () => {
      throw new dom.window.DOMException('full', 'QuotaExceededError')
    },
  }

  const bar = () => $('[data-autosave]')
  assert.equal(bar().dataset.listed, '0', 'still an unsaved calculation')
  type('[data-path="demand.animalWeight"]', '901')

  return new Promise((resolve) => {
    setTimeout(() => {
      global.localStorage = real
      assert.equal(bar().hidden, false, 'the failure is not hidden with the rest')
      assert.match(bar().textContent, /Not saved/)
      assert.ok(bar().classList.contains('is-error'))

      // And it clears itself once a write goes through again, rather than
      // leaving a warning up about a problem that has passed.
      type('[data-path="demand.animalWeight"]', '902')
      resolve()
    }, 500)
  })
})

test('a saved card names the pasture and the date, and not the goals again', () => {
  click('[data-action="set-tab"][data-tab="saved"]')
  const card = $('.saved-card')
  const meta = card.querySelector('.saved-meta').textContent

  assert.match(meta, /saved /, 'the date is on the meta line')
  assert.doesNotMatch(meta, /Grazing days|Acres|Animals/, 'the goals are not')
  // Because every one of them is a labelled figure two lines down.
  assert.match(card.querySelector('.saved-figs').textContent, /Grazing days|Acres|Animals/)
})

test('on the Saved tab the file controls sit after the filter hint in the DOM', () => {
  // They move below the hint on a phone with `order`, which only works between
  // siblings. Nothing here can assert the phone layout — jsdom loads no CSS —
  // so what is asserted is the arrangement `order` needs to exist.
  const head = $('.saved-head')
  const kids = [...head.children]
  const at = (sel) => kids.findIndex((el) => el.matches(sel))

  assert.ok(at('.head-tools') > -1, 'the file controls are in the head')
  assert.ok(at('.saved-tools') > at('.head-tools'), 'and the filter is a sibling after them')
  assert.ok(at('.saved-filter-hint') > at('.saved-tools'))
})

test('the footer says where the data lives, on every tab', () => {
  // Somebody typing their sample weights, their herd size and their acres into a
  // web page at a workshop is entitled to know where it goes without going
  // looking for it, so the sentence is on the screen rather than only behind a
  // link.
  // EVERY tab, one sentence, no exceptions. This used to branch: the cover
  // crops tab was an embedded JotForm and submitting it sent the entries to
  // JotForm, so the blanket promise was one the app could not keep there. The
  // native calculator replaced that tab and the promise is true everywhere.
  for (const tab of ['perennial', 'covercrop', 'saved']) {
    click(`[data-action="set-tab"][data-tab="${tab}"]`)
    const line = $('.footer-privacy')
    assert.ok(line, `the ${tab} tab states it`)
    assert.match(line.textContent, /stays on this device/i)
    assert.doesNotMatch(
      line.textContent,
      /JotForm/,
      `the ${tab} footer carries no exception any more`
    )
  }

  // And it survives printing while its link does not, so a printed worksheet
  // still carries a statement that is true on paper.
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const print = css.slice(css.indexOf('@media print'))
  assert.match(print, /\.footer button/)
  assert.doesNotMatch(print, /\.footer-privacy\s*\{[^}]*display:\s*none/)
})

test('the footer link explains at length and writes nothing', () => {
  click('[data-action="set-tab"][data-tab="perennial"]')
  const before = JSON.stringify(state.getCalculation())

  click('.footer-privacy [data-info="privacy"]')
  const body = $('.modal-body').textContent
  assert.equal($('.modal-title').textContent, 'Where your calculations live')
  assert.match(body, /not sent anywhere/i)
  assert.match(body, /cannot see your calculations/i)
  assert.match(body, /clearing your browsing data/i)
  assert.match(body, /Export backup/, 'and says how to keep a copy on purpose')
  assert.match(body, /JotForm/, 'and names the one exception')
  assert.equal($$('.modal-body input, .modal-body select').length, 0, 'nothing to fill in')
  click('.modal-close')

  assert.equal(JSON.stringify(state.getCalculation()), before, 'the `?` changed no value')
})

test('the footer offers no export of its own', () => {
  // Step 5 already carries Save as image, Export CSV and Print, and a card's
  // Save as carries the same four for a stored record. A second set at the foot
  // of the page would act on the working calculation while the Saved tab shows a
  // list of records that are not it.
  click('[data-action="set-tab"][data-tab="saved"]')
  const actions = [...$('.footer').querySelectorAll('button')].map(
    (b) => b.dataset.action ?? `info:${b.dataset.info}`
  )
  assert.deepEqual(actions, ['how-to', 'info:privacy'])
})

test('the unsaved-work warning is the browser dialog, and Cancel keeps the work', async () => {
  const storage = await import('../src/storage.js')
  click('[data-action="set-tab"][data-tab="perennial"]')

  // This test stands on a calculation that is NOT in the list, which is the only
  // case the question is asked in.
  const id = state.getCalculation().id
  assert.ok(!storage.listCalcs().some((c) => c.id === id), 'the working calculation is unsaved')

  const real = global.confirm
  let asked = ''
  global.confirm = (message) => {
    asked = message
    return false
  }
  click('[data-action="new-calc"]')
  assert.match(asked, /not in your saved list/i, 'the question names the reason')
  assert.equal(state.getCalculation().id, id, 'Cancel replaced nothing')

  global.confirm = () => true
  click('[data-action="new-calc"]')
  assert.notEqual(state.getCalculation().id, id, 'OK starts the new one')
  assert.ok($('.goal-grid'), 'and lands on the setup screen')
  global.confirm = real

  // Put the steps back for the tests below.
  choose('input[data-action="toggle-goal"][value="days"]')
  choose('input[data-action="set-forage"][value="coolSeasonGrass"]')
  click('[data-action="start"]')
})

test('the spread note is settled once per entry, not once per keystroke', () => {
  const note = () => $('[data-spread-note]')
  const boxes = $$('[data-path^="samples."]')
  assert.ok(boxes.length >= 3, 'step 1 is on screen')

  // A wide spread, which is what the note is about. Mid-number it would be
  // judging a figure that is not all there: 1 and 100 read as a wide spread while
  // the 100 is still "1".
  boxes[0].focus()
  type(boxes[0], 1)
  boxes[1].focus()
  type(boxes[1], 100)
  assert.equal(note().hidden, true, 'nothing appears under the thumb while typing')

  // Moving to the next weight means the last one is finished, which is the moment
  // the judgement is worth making. It does not wait for a tap on the page.
  boxes[2].focus()
  assert.equal(note().hidden, false, 'the next box is enough')
  assert.match(note().textContent, /wide spread/)

  // And once it is up it STAYS up while the next weight is typed. Hiding it on
  // the first keystroke and bringing it back on the last is the same flicker
  // approached from the other side.
  const said = note().textContent
  type(boxes[2], 5)
  assert.equal(note().hidden, false, 'typing does not take it away again')
  assert.equal(note().textContent, said, 'and does not rewrite it mid-number')

  // Leaving the box is what settles it again — up, updated, or down.
  boxes[2].blur()
  assert.equal(note().hidden, false, 'still a wide spread: 1, 100, 5')

  boxes[1].focus()
  type(boxes[1], 1)
  assert.equal(note().hidden, false, 'held while the evening-up is typed')
  boxes[2].focus()
  type(boxes[2], 1)
  boxes[2].blur()
  assert.equal(note().hidden, true, 'and it stands down once that entry is made')
})

test('editing a saved calculation keeps its card in step', async () => {
  const storage = await import('../src/storage.js')

  // Saved half way through, which is the normal thing to do: one pasture at a
  // time, in a pasture, before the herd figures are known.
  click('[data-action="save-calc"]')
  $('#save-name').value = 'Mid-way pasture'
  click('[data-save-confirm]')
  const id = state.getCalculation().id
  assert.ok(storage.getCalcById(id), 'it is in the list')

  // An unanswered goal has no answer on a card either. Every formatter treats a
  // non-finite number as zero, so this read "Grazing days: 0 days" — an answer,
  // and a wrong one: it says the pasture will not feed anything.
  click('[data-action="set-tab"][data-tab="saved"]')
  const card = () => $(`[data-calc-id="${id}"] .saved-figs`).textContent
  assert.match(card(), /Grazing days: —/, 'a figure with no answer yet is a dash')

  // Now finish it.
  click('[data-action="set-tab"][data-tab="perennial"]')
  click('[data-action="toggle-show-all"]')
  click('[data-action="set-frame"][data-mode="small"]')
  choose('input[data-action="set-stage"][value="headOut"]')
  type('[data-path="usable.amountLeaving"]', 600)
  type('[data-path="demand.animalWeight"]', 1200)
  type('[data-path="demand.numAnimals"]', 50)
  type('[data-path="pasture.totalAcres"]', 160)
  const onScreen = out('grazingDays')
  assert.notEqual(onScreen, '—', 'the worksheet is finished')

  return new Promise((resolve) => {
    setTimeout(() => {
      // The bar says "Saved" the whole way through this. It used to mean only
      // that the working copy had been written, while the record behind the card
      // still held the figures it was saved with three steps ago.
      assert.match($('[data-autosave]').textContent, /Saved/)
      click('[data-action="set-tab"][data-tab="saved"]')
      assert.match(card(), new RegExp(`Grazing days: ${onScreen}`), 'the card followed the work')
      assert.equal(
        storage.getCalcById(id).demand.numAnimals,
        '50',
        'and so did the inputs behind it'
      )

      // Opening one and only LOOKING at it writes nothing, which is what keeps
      // the date on the card honest and stops the list reordering itself under
      // somebody who came to read.
      const before = storage.getCalcById(id).updatedAt
      click(`[data-action="open-calc"][data-id="${id}"]`)
      setTimeout(() => {
        assert.equal(storage.getCalcById(id).updatedAt, before, 'an open is not an edit')
        click('[data-action="toggle-show-all"]')
        resolve()
      }, 500)
    }, 500)
  })
})

test('the privacy line is narrowed in app.css, not in the shared sheet', () => {
  // styles.css is shared with SDSHC-farm-budget and the Virtual Fence ROI tool,
  // so a width chosen for this app's sentences belongs in app.css. jsdom loads no
  // CSS, so this reads the two files.
  const shared = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8')

  assert.match(app, /\.footer-privacy\s*\{[^}]*max-width/, 'app.css sizes the line')
  assert.match(app, /\.footer-privacy\s*\{[^}]*margin-left:\s*auto/, 'and keeps it centred')
  assert.doesNotMatch(shared, /\.footer-privacy\s*\{[^}]*max-width/, 'the shared sheet is untouched')
})

test('closing the tab inside the debounce still writes the work', async () => {
  const storage = await import('../src/storage.js')
  const hide = () => dom.window.dispatchEvent(new dom.window.Event('pagehide'))

  click('[data-action="set-tab"][data-tab="perennial"]')
  hide() // settle anything the previous test left pending

  type('[data-path="demand.animalWeight"]', '1234')
  assert.notEqual(
    storage.loadWorking()?.demand?.animalWeight,
    '1234',
    'the write is still 400ms away'
  )

  // 400ms is a small window, and closing a tab is when somebody is most likely
  // to be inside it. Mobile Safari suspends timers on backgrounding, so a
  // pending save can otherwise never run at all.
  hide()
  assert.equal(storage.loadWorking()?.demand?.animalWeight, '1234', 'and it went in anyway')
})

/* ─────────────────────── two calculators, one list ─────────────────────── */
/* Appended at the END on purpose. The tests above run in order over one shared
   localStorage and several assert on record counts relative to earlier ones, so
   anything inserted among them that saves a record or moves the tab breaks tests
   nowhere near it. The full cover crop walkthrough is in covercrop.test.js,
   which gets a process and a clean store of its own. */

test('+ New calculation asks which worksheet, from the Saved tab only', () => {
  click('[data-action="set-tab"][data-tab="saved"]')

  // From here neither worksheet is on screen to be meant, so the button asks.
  click('.saved-new')
  const choices = $$('.save-as-item[data-action="new-calc"]')
  assert.equal(choices.length, 2, 'both calculators are offered')
  assert.ok(
    choices.every((b) => b.dataset.kind),
    'and each names which one it starts'
  )
  assert.match($('.modal-body').textContent, /clipped forage samples/i)
  assert.match($('.modal-body').textContent, /average height/i)

  click(choices.find((b) => b.dataset.kind === 'covercrop'))
  assert.ok($('input[data-action="set-season"]'), 'it lands on the cover crop setup screen')
  assert.equal($('.modal.open, .overlay.open'), null, 'and the chooser is closed')
})

test('the chip row inside a worksheet does not ask, because it already knows', () => {
  // The chip row only exists once a worksheet is past its setup screen, so this
  // reads the perennial one, which has been worked through above.
  click('[data-action="set-tab"][data-tab="perennial"]')

  // Standing in a worksheet, "+ New calculation" has only one sensible answer:
  // this one. A dialog there would be a question with the answer on screen.
  const chipNew = $('.chip-new')
  assert.ok(chipNew, 'the chip row carries its own copy')
  assert.equal(chipNew.dataset.action, 'new-calc')
  assert.equal(chipNew.dataset.kind, undefined, 'with no kind to choose')
})

test('a mixed saved list can be narrowed to one calculator', async () => {
  const { saveCalc } = await import('../src/storage.js')
  const { newCoverCropCalculation } = await import('../src/state-covercrop.js')

  // A cover crop record alongside the perennial ones saved earlier in this file.
  saveCalc({ ...newCoverCropCalculation('Rye field'), season: 'cool', goals: ['days'] })
  click('[data-action="set-tab"][data-tab="saved"]')

  const kinds = $$('[data-action="set-saved-kind"]')
  assert.equal(kinds.length, 3, 'All, and one per calculator')

  const typesOf = () => [...new Set($$('.saved-card').map((c) => c.dataset.calcType))]
  assert.ok(typesOf().length > 1, 'All shows both kinds')

  click('[data-action="set-saved-kind"][data-kind="covercrop"]')
  assert.deepEqual(typesOf(), ['covercrop'], 'and one pill shows one kind')
  assert.match($('.saved-card').textContent, /Cover crop/, 'the card says which it is')

  // Reordering is OFF while the list is hiding cards, by either route: dropping
  // a card into a list showing half its rows writes an order nobody meant.
  assert.equal($('.saved-grip').getAttribute('draggable'), 'false')

  // One Clear undoes both narrowings. Undoing only one would leave a list still
  // hiding cards with nothing on screen saying why.
  click('[data-action="clear-saved-filter"]')
  assert.ok(typesOf().length > 1, 'back to everything')
})

test('a backup names the two kinds it is about to replace', async () => {
  const { exportBackupJSON, listCalcs } = await import('../src/storage.js')

  const parsed = JSON.parse(exportBackupJSON())
  // ONE backup covering both. A backup means "everything saved on this device",
  // and splitting it makes keeping a copy a two-step job nobody does twice.
  const types = new Set(parsed.calculations.map((c) => c.calcType))
  assert.ok(types.has('perennial') && types.has('covercrop'), 'both kinds travel')
  assert.ok(listCalcs().length > 1)

  let asked = ''
  const realConfirm = dom.window.confirm
  dom.window.confirm = (text) => {
    asked = text
    return false // stop before anything is replaced
  }
  global.confirm = dom.window.confirm

  boot // the module is already loaded; the action below is what exercises it
  click('[data-action="restore-all"]')
  dom.window.confirm = realConfirm
  global.confirm = realConfirm

  // The file picker is asynchronous, so the confirm may not have been reached.
  // What matters is that nothing was destroyed on the way to asking.
  assert.ok(listCalcs().length > 1, 'refusing to pick a file changes nothing')
  if (asked) assert.match(asked, /perennial/i)
})

test('a lone comma leaves the drag working, not just looking like it works', () => {
  // The markup half of this is asserted further up: with " , " in the box the
  // cards still say draggable="true" and the hint still offers reordering.
  // This is the other half. narrowed() in main.js gates the drag HANDLER, and
  // it used to ask `savedFilter.trim()` while saved.js asked filterTerms(),
  // so a stray comma left the page inviting a drag that silently did nothing.
  click('[data-action="set-tab"][data-tab="saved"]')

  const names = () => $$('.saved-card').map((c) => c.querySelector('.saved-name').textContent)
  const before = names()
  assert.ok(before.length >= 2, 'two cards to swap')

  type('[data-saved-filter]', ' , ')
  assert.equal($$('.saved-card').length, before.length, 'nothing is hidden by punctuation')

  const list = $('[data-saved-list]')
  const [first, second] = $$('.saved-card')
  first.dispatchEvent(new dom.window.MouseEvent('dragstart', { bubbles: true }))
  list.insertBefore(first, second.nextElementSibling)
  first.dispatchEvent(new dom.window.MouseEvent('dragend', { bubbles: true }))

  // Asserted after a REDRAW, not off the nodes this test just moved by hand.
  // jsdom lays nothing out, so the drop itself has to be faked — which means the
  // on-screen order proves nothing about whether the handler ran. Only an order
  // that survives a re-render was actually committed to the store.
  type('[data-saved-filter]', '')
  click('[data-action="set-tab"][data-tab="perennial"]')
  click('[data-action="set-tab"][data-tab="saved"]')
  assert.deepEqual(names(), [before[1], before[0], ...before.slice(2)], 'the drag was committed')

  click('[data-action="set-tab"][data-tab="perennial"]')
})

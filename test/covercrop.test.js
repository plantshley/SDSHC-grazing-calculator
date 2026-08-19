/**
 * The cover crop worksheet, end to end through the real UI.
 *
 * Its own jsdom boot rather than more tests appended to app.test.js. That file
 * runs ~65 tests IN ORDER over one shared localStorage, and several of them
 * assert on record counts relative to earlier ones — anything inserted there
 * that saves a record or moves the tab breaks tests nowhere near it. `node
 * --test` gives every file its own process, so this gets a clean store and a
 * fresh module graph for nothing.
 *
 * What this catches that calc-covercrop.test.js cannot is the wiring: a
 * data-path that does not match the record shape, a [data-out] key no model
 * produces, a step that renders nothing, an action name nobody handles.
 *
 * The fixture is the worksheet's own worked example, so the figures asserted
 * here are the ones printed on the paper.
 */

import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const SHELL = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

let dom
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
  global.addEventListener = dom.window.addEventListener.bind(dom.window)
  global.removeEventListener = dom.window.removeEventListener.bind(dom.window)
  global.MutationObserver = dom.window.MutationObserver
  global.HTMLElement = dom.window.HTMLElement
  global.Node = dom.window.Node
  global.Blob = dom.window.Blob

  dom.window.scrollTo = () => {}
  dom.window.confirm = () => true
  dom.window.alert = () => {}
  dom.window.print = () => {}
  global.confirm = dom.window.confirm
  global.alert = dom.window.alert

  await import('../src/main.js')
  state = await import('../src/state.js')
})

const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => [...document.querySelectorAll(sel)]

function click(sel) {
  const el = typeof sel === 'string' ? $(sel) : sel
  assert.ok(el, `expected to find ${sel}`)
  el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  return el
}

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

const out = (key) => $(`[data-out="${key}"]`)?.textContent ?? null
const toTab = (tab) => click(`[data-action="set-tab"][data-tab="${tab}"]`)

/* ─────────────────────────────── the setup ─────────────────────────────── */

test('the cover crops tab opens on its own setup screen', () => {
  toTab('covercrop')

  assert.ok($('.goal-grid'), 'it asks what to work out')
  assert.equal($$('input[data-action="set-season"]').length, 3, 'three seasons on offer')
  assert.equal($('[data-cc-frame]'), null, 'and no embedded form anywhere')
})

test('Start is refused until both questions are answered', () => {
  assert.ok($('[data-action="start"]').disabled, 'nothing chosen yet')
  assert.ok($('.start-warn'), 'and the row says why')

  choose('input[data-action="toggle-goal"][value="days"]')
  assert.ok($('[data-action="start"]').disabled, 'a goal alone is not enough')

  choose('input[data-action="set-season"][value="cool"]')
  assert.equal($('[data-action="start"]').disabled, false, 'both answered')
})

test('the checklist is in this worksheet\'s words, not the other one\'s', () => {
  const items = $$('.needs-list label').map((l) => l.textContent)
  assert.ok(
    items.some((t) => /average height/i.test(t)),
    `a height is what this sheet measures: ${JSON.stringify(items)}`
  )
  assert.ok(
    !items.some((t) => /gram scale|clipping hoop/i.test(t)),
    'and nothing is clipped or weighed on it'
  )
  // Both worksheets ask for an animal weight, so an unprefixed tick id would be
  // one checkbox shared across two tabs.
  assert.ok(
    $$('.needs-list input').every((i) => i.dataset.need.startsWith('cc:')),
    'the ticks are scoped to this worksheet'
  )
})

/* ──────────────────── the worksheet's own worked example ───────────────── */

test('step 1: height in, total air-dry production out', () => {
  click('[data-action="start"]')

  assert.ok($('.step[data-step="0"]'), 'the steps render')
  assert.match($('.step[data-step="0"] .title').textContent, /Measure the stand/i)
  // The estimate is written out in the season's own constants, so the figure can
  // be checked against the paper without redoing the arithmetic.
  assert.match($('.step[data-step="0"] .hint').textContent + $('.step[data-step="0"]').textContent, /1,140/)

  type('[data-path="stand.height"]', '18')
  //  1,140 for the first 4 inches + 250 x 14 = 4,640
  assert.equal(out('totalProduction'), '4,640 lbs/ac')
})

test('step 2: the residual comes off, leaving the available forage', () => {
  click('[data-action="next-step"]')

  type('[data-path="residual.height"]', '4')
  assert.equal(out('residualProduction'), '1,140 lbs/ac')
  assert.equal(out('availableForage'), '3,500 lbs/ac')
})

test('step 3: utilization comes off the occupation period', () => {
  click('[data-action="next-step"]')

  const periods = $$('input[data-action="set-period"]')
  assert.equal(periods.length, 6, 'the whole table is on offer')
  // The percentage is a label read out of the table at render time, never a
  // figure written into the record.
  assert.match($('.stage-grid').textContent, /80% utilization/)

  choose('input[data-action="set-period"][value="five"]')
  //  3,500 x 65% = 2,275
  assert.equal(out('usableForage'), '2,275 lbs/ac')
  assert.equal(out('forageLeftBehind'), '1,225 lbs/ac')

  assert.equal(state.getCalculation().utilization.periodKey, 'five')
  assert.equal(
    state.getCalculation().utilization.ownPct,
    '',
    'and no percentage is stored on the record'
  )
})

test('a percent can be typed instead, and the period survives the switch', () => {
  click('[data-action="set-util-mode"][data-mode="own"]')
  type('[data-path="utilization.ownPct"]', '50')
  assert.equal(out('usableForage'), '1,750 lbs/ac')

  click('[data-action="set-util-mode"][data-mode="period"]')
  assert.equal(
    $('input[data-action="set-period"][value="five"]').checked,
    true,
    'the period chosen earlier is still chosen'
  )
  assert.equal(out('usableForage'), '2,275 lbs/ac')
})

test('step 4: daily demand', () => {
  click('[data-action="next-step"]')

  assert.equal(
    $('[data-path="demand.bodyWeightPct"]').value,
    '2.6',
    'the rate arrives filled in at the working figure, not blank'
  )
  type('[data-path="demand.animalWeight"]', '1200')
  type('[data-path="demand.numAnimals"]', '100')
  assert.equal(out('perAnimalDemand'), '31.2 lbs/day', '1200 x 2.6%')

  // The printed worksheet's example runs at 3%, and the field is editable, so
  // the rest of this file follows the paper by typing it in.
  type('[data-path="demand.bodyWeightPct"]', '3')
  assert.equal(out('perAnimalDemand'), '36 lbs/day')
  assert.equal(out('herdDemand'), '3,600 lbs/day')
})

test('step 5: the answer the worksheet prints', () => {
  click('[data-action="next-step"]')

  type('[data-path="pasture.totalAcres"]', '40')
  //  2,275 x 40 = 91,000 lbs, divided by 3,600 a day
  assert.equal(out('totalUsableForage'), '91,000 lbs')
  assert.match(out('grazingDays'), /^25/, `the worksheet prints 25 days, got ${out('grazingDays')}`)

  // And the calculation written out in words, for checking against the paper.
  const formula = $('[data-formula="days"]').textContent
  assert.match(formula, /91,000/)
  assert.match(formula, /3,600/)
})

test('nothing on the page is a stale figure baked into markup', () => {
  // Going back and changing step 1 has to move every figure that hangs off it.
  click('[data-action="prev-step"]')
  click('[data-action="prev-step"]')
  click('[data-action="prev-step"]')
  click('[data-action="prev-step"]')

  type('[data-path="stand.height"]', '10')
  assert.equal(out('totalProduction'), '2,640 lbs/ac', '1,140 + 250 x 6')

  type('[data-path="stand.height"]', '18')
  assert.equal(out('totalProduction'), '4,640 lbs/ac')
})

/* ───────────────────────────── the two sheets ──────────────────────────── */

test('switching tabs does not touch the other worksheet, in either direction', () => {
  const before = JSON.stringify(state.getCalculation('covercrop'))

  toTab('perennial')
  // The perennial sheet is untouched and on its own landing screen, with its own
  // question, not this one's.
  assert.ok($('input[data-action="set-forage"]'), 'the perennial setup asks for a forage type')
  assert.equal($('input[data-action="set-season"]'), null)

  choose('input[data-action="toggle-goal"][value="days"]')
  choose('input[data-action="set-forage"][value="coolSeasonGrass"]')
  click('[data-action="start"]')
  type('[data-path="samples.0"]', '25')

  toTab('covercrop')
  assert.equal(
    JSON.stringify(state.getCalculation('covercrop')),
    before,
    'the cover crop record came back exactly as it was left'
  )
  assert.equal(out('totalProduction'), '4,640 lbs/ac', 'and so did the page')

  toTab('perennial')
  assert.equal($('[data-path="samples.0"]').value, '25', 'and the perennial work is still there')
})

test('each worksheet keeps its own place in its own steps', () => {
  // The perennial sheet is on step 1; the cover crop sheet was left on step 1
  // too, having stepped back through. Move only one of them.
  toTab('covercrop')
  click('[data-action="next-step"]')
  const ccStep = $('.step:not([hidden])').dataset.step

  toTab('perennial')
  assert.equal($('.step:not([hidden])').dataset.step, '0', 'the perennial sheet has not moved')

  toTab('covercrop')
  assert.equal($('.step:not([hidden])').dataset.step, ccStep, 'and neither has this one')
})

test('the two records are stored under keys of their own', () => {
  // A failing write for one worksheet must not be able to take the other's work
  // with it, and the perennial key is the ORIGINAL one so an upgrade loses
  // nothing.
  assert.ok(localStorage.getItem('sdshc-gc-working'), 'perennial is where it always was')
  assert.ok(localStorage.getItem('sdshc-gc-working-covercrop'))

  const cc = JSON.parse(localStorage.getItem('sdshc-gc-working-covercrop'))
  assert.equal(cc.calcType, 'covercrop')
  assert.equal(cc.stand.height, '18')
  assert.equal(cc.samples, undefined, 'and it carries no branch from the other worksheet')
})

/* ─────────────────────────── saving and files ──────────────────────────── */

test('a cover crop calculation saves, and its card says which worksheet it is', async () => {
  toTab('covercrop')
  click('[data-action="save-calc"]')
  $('#save-name').value = 'Rye field 3'
  $('#save-pasture').value = 'North 40'
  click('[data-save-confirm]')

  toTab('saved')
  const card = $('.saved-card')
  assert.ok(card, 'the record is in the list')
  assert.match(card.textContent, /Rye field 3/)
  // Two kinds of record in one list, and nothing else on the card says which
  // worksheet produced the figures under it.
  assert.match(card.textContent, /Cover crop/i, 'the card names the calculator')
  assert.match(card.textContent, /Cool-season/i, 'and the season, where forage would be')
  assert.match(card.textContent, /Grazing days:\s*25/)
})

test('opening a saved cover crop record lands on the cover crop tab', () => {
  toTab('perennial')
  toTab('saved')
  click('[data-action="open-calc"]')

  assert.ok($('input[data-path="stand.height"]'), 'the cover crop worksheet is on screen')
  assert.equal($('[data-path="stand.height"]').value, '18')
})

test('a cover crop calculation exports as itself, not as the other worksheet', async () => {
  const { toCSV } = await import('../src/export.js')
  const { computeRecord } = await import('../src/calculators.js')
  const { listCalcs } = await import('../src/storage.js')

  const record = listCalcs().find((c) => c.calcType === 'covercrop')
  assert.ok(record, 'the record is there to export')

  const csv = toCSV(record, computeRecord(record))
  assert.match(csv, /Grazing Cover Crops/)
  assert.match(csv, /Average height \(in\)/)
  assert.match(csv, /Utilization source/)
  assert.match(csv, /Occupation period: 5 days/)
  // The perennial worksheet's steps must not appear on it.
  assert.doesNotMatch(csv, /Clip and weigh|Dry matter|Grams to lbs/)
})

test('a cover crop file declares its own type, so an upload needs no chooser', async () => {
  const { exportCalcJSON, importCalcJSON, listCalcs } = await import('../src/storage.js')

  const record = listCalcs().find((c) => c.calcType === 'covercrop')
  const file = exportCalcJSON(record)
  assert.match(file, /"calcType": "covercrop"/)

  const back = importCalcJSON(file)
  assert.ok(back.ok, back.error)
  assert.equal(back.calc.calcType, 'covercrop')
  assert.equal(back.calc.stand.height, '18')
})

/* ────────────────────────── shortfalls and clearing ────────────────────── */

test('a step that has been gone past says what it still owes, in its own words', () => {
  toTab('covercrop')
  // Clear step 2, then walk forward past it so it has been "gone past".
  click('.step[data-step="1"] [data-action="clear-step"]')

  const note = $('[data-step-missing="1"]')
  assert.ok(note, 'the placeholder is in the page from the start')

  // Move to step 2 and try to leave it unfinished: the first press stays put.
  while ($('.step:not([hidden])').dataset.step !== '1') {
    const at = Number($('.step:not([hidden])').dataset.step)
    click(at < 1 ? '[data-action="next-step"]' : '[data-action="prev-step"]')
  }
  click('[data-action="next-step"]')

  assert.equal($('.step:not([hidden])').dataset.step, '1', 'one speed bump')
  assert.equal($('[data-step-missing="1"]').hidden, false)
  assert.match($('[data-step-missing="1"]').textContent, /residual height/i)
  // The perennial worksheet's words for its own inputs must never appear here.
  assert.doesNotMatch($('[data-step-missing="1"]').textContent, /clipped|hoop|dry matter/i)

  // A second press goes through, so nobody is trapped reading ahead.
  click('[data-action="next-step"]')
  assert.equal($('.step:not([hidden])').dataset.step, '2')
})

test('Clear on step 1 empties the height and leaves the season alone', () => {
  while ($('.step:not([hidden])').dataset.step !== '0') click('[data-action="prev-step"]')

  type('[data-path="stand.height"]', '18')
  click('.step[data-step="0"] [data-action="clear-step"]')

  assert.equal(state.getCalculation().stand.height, '')
  // The season is answered on the setup screen, so a Clear here that took it
  // away would send somebody back to a landing screen they had finished.
  assert.equal(state.getCalculation().season, 'cool')
  assert.match($('.chip--forage').textContent, /Cool-season/)
})

test('an unanswered goal shows a dash, never a zero', () => {
  const days = $('[data-out="grazingDays"]')
  assert.ok(days, 'the card is on the page')
  // Step 1 was just cleared, so nothing downstream can be answered.
  while ($('.step:not([hidden])').dataset.step !== '4') click('[data-action="next-step"]')
  assert.equal($('[data-out="grazingDays"]').textContent, '—')
  assert.match($('[data-missing="days"]').textContent, /Still needed/)
  assert.match($('[data-missing="days"]').textContent, /height/i)
})

/* ────────────────── a warning sits on the step that raised it ──────────── */

test('a warning appears on its own step, not in a list at the end', async () => {
  const prefs = await import('../src/prefs.js')
  prefs.setPref('showAll', true)
  toTab('perennial')
  toTab('covercrop')

  const warningsOn = (i) =>
    [...document.querySelectorAll(`.step[data-step="${i}"] [data-warnings] li`)].map((li) =>
      li.textContent.trim()
    )

  type('[data-path="stand.height"]', '180')
  type('[data-path="residual.height"]', '200')
  type('[data-path="demand.bodyWeightPct"]', '40')

  assert.match(warningsOn(0).join(' '), /Average height of 180/, 'the height query is on step 1')
  assert.match(warningsOn(1).join(' '), /Residual height of 200/, 'the residual one on step 2')
  assert.match(warningsOn(1).join(' '), /at least as tall as the stand/)
  assert.match(warningsOn(3).join(' '), /40% of body weight/, 'and the intake rate on step 4')

  // The one that used to hold all of them now holds only its own.
  assert.deepEqual(warningsOn(4), [], 'nothing is repeated on the results step')

  // Fixed at the source, gone from the step, and not left behind anywhere else.
  type('[data-path="stand.height"]', '18')
  assert.deepEqual(warningsOn(0), [], 'clearing the entry clears the warning')
  assert.equal(
    document.querySelectorAll('[data-warnings] li').length,
    warningsOn(1).length + warningsOn(3).length,
    'and no copy of it survives on another step'
  )

  type('[data-path="residual.height"]', '4')
  type('[data-path="demand.bodyWeightPct"]', '2.6')
  prefs.setPref('showAll', false)
})

test('a folded step head carries a warning count, beside the missing count', async () => {
  const prefs = await import('../src/prefs.js')
  prefs.setPref('showAll', true)
  toTab('perennial')
  toTab('covercrop')

  const pillsOn = (i) =>
    [...document.querySelectorAll(`.step[data-step="${i}"] .step-pill`)]
      .filter((p) => !p.hidden)
      .map((p) => p.textContent)

  const fold = (i) => {
    const body = $(`.step[data-step="${i}"] .step-body`)
    if (!body.hidden) click(`.step[data-step="${i}"] [data-action="toggle-step"]`)
  }

  // Step 4 owes an animal count AND has a rate nobody feeds.
  type('[data-path="demand.bodyWeightPct"]', '40')
  type('[data-path="demand.numAnimals"]', '')
  for (const i of [0, 1, 2, 3, 4]) fold(i)

  assert.deepEqual(pillsOn(3), ['1 missing', '1 warning'], 'both counts, in that order')
  assert.equal(
    $('.step[data-step="3"] .step-toggle').getAttribute('aria-describedby'),
    'stepPill3 stepWarn3',
    'and the toggle names both to a screen reader'
  )

  // Unfolding puts the warnings themselves on screen, so the count stands down:
  // one problem said twice in one box reads as two.
  click('.step[data-step="3"] [data-action="toggle-step"]')
  assert.deepEqual(pillsOn(3), [], 'no count over an open body')
  assert.ok($('.step[data-step="3"] [data-warnings] li'), 'the warning itself is there instead')

  type('[data-path="demand.numAnimals"]', '100')
  type('[data-path="demand.bodyWeightPct"]', '2.6')
  fold(3)
  assert.deepEqual(pillsOn(3), [], 'and both clear once the entries are fixed')

  prefs.setPref('showAll', false)
})

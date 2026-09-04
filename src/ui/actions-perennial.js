/**
 * The perennial worksheet's own handlers.
 *
 * main.js keeps everything that is true of ANY worksheet — the stepper, the
 * shortfall marks, the autosave, the Saved tab, the drag. What is left here is
 * what only this worksheet has: hoops, Exhibit 4-2, the mix builder, and how
 * much forage is left behind.
 *
 * Every handler returns `true` when it dealt with the event, so main.js's
 * delegated listener can fall through to its own generic cases. None of them
 * calls render() directly — `ctx.render` is passed in, because main.js owns the
 * page and a UI module reaching back into it would close a cycle.
 */

import { FRAMES, DEFAULT_AREA_UNIT, areaUnit, convertArea } from '../calc.js'
import { getCalculation, setPath, notify, newMixRow } from '../state.js'
import { getPref, setPref } from '../prefs.js'
import { MIXED } from '../data/forage.js'
import { openDryMatterTable } from './table.js'
import { track } from '../analytics.js'

/**
 * The row of the chart a new mix row starts on.
 *
 * "Mixed or not sure" is the one answer that names no row, and it is also the
 * answer most likely to lead here, so it defaults to nothing rather than to the
 * first type in the list.
 */
export function defaultMixType(calc) {
  return calc.forageType === MIXED.id ? '' : calc.forageType || ''
}

/**
 * Choose a forage type, from the card or from the photo viewer.
 *
 * A stage belongs to a ROW of the chart. Keeping it across a change of row
 * would leave a forb stage selected on a grass, where it resolves to nothing
 * and reads on screen as a dry matter of zero.
 */
export function chooseForage(id, ctx) {
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
  ctx.render()
}

/**
 * Typing an area of your own IS "Other frame", so the pill follows the box.
 *
 * Updated in place rather than by re-rendering: a render here would replace the
 * input mid-number and take the caret with it, which is the same reason
 * updateOutputs() exists instead of re-rendering the result cards.
 */
function syncFramePill(value, root) {
  const calc = getCalculation()
  const preset = FRAMES.find((f) => f.key === calc.frame?.key)
  if (!preset || preset.area == null) return
  // Against the preset AS SHOWN. A preset is stated in square feet and the
  // box may be in square inches, so comparing the raw 0.96 would read the
  // figure the app itself just put there as a number of the user's own.
  const shown = convertArea(String(preset.area), 'sqft', calc.frame?.areaUnit)
  if (String(shown) === String(value)) return

  calc.frame.key = 'custom'
  // The pill moved without anybody pressing it, so TRACKED_ACTIONS never sees
  // this. Left out, "Other frame" would look far less used than it is: typing a
  // measurement over a preset IS choosing it, and is the commoner of the two
  // routes. Guarded by the early return above, so it fires on the transition
  // rather than on every keystroke.
  track('mode_select', { worksheet: 'perennial', control: 'frame', choice: 'custom' })
  for (const seg of root.querySelectorAll('[data-action="set-frame"]')) {
    seg.setAttribute('aria-pressed', String(seg.dataset.mode === 'custom'))
  }
}

/**
 * The unit the frame area box is in.
 *
 * The measurement travels with it. Choosing "sq in" is a statement about how
 * the frame was measured, not about a different frame, so 2 sq ft becomes 288
 * sq in rather than silently shrinking the hoop by a factor of 144.
 *
 * It carries no `data-path`, so nothing has written the new unit yet and the
 * old one is still there to convert from. A select main.js writes by path is
 * written BEFORE the descriptor sees it, which would leave nothing to read.
 */
function chooseAreaUnit(value, ctx) {
  const calc = getCalculation()
  const from = calc.frame.areaUnit || DEFAULT_AREA_UNIT
  const to = areaUnit(value)?.key
  if (!to || to === from) return

  calc.frame.areaUnit = to
  calc.frame.customArea = convertArea(calc.frame.customArea, from, to)
  // A select never reaches TRACKED_ACTIONS, which is a click allowlist. It is
  // the same kind of answer as the frame size beside it and belongs under the
  // same `control` dimension, so it says so itself.
  track('mode_select', { worksheet: 'perennial', control: 'frame_unit', choice: to })
  notify()
  ctx.render()
}

/** A keystroke in a box this worksheet cares about beyond writing the value. */
export function handleInput(el, path, ctx) {
  if (path === 'frame.customArea') syncFramePill(el.value, ctx.root)
}

/** A <select> or a radio this worksheet owns. */
export function handleChange(el, ctx) {
  const path = el.dataset?.path
  if (path && el.tagName === 'SELECT') {
    // Changing a mix row's forage type invalidates the stage chosen under it.
    if (/^dm\.mix\.\d+\.typeId$/.test(path)) {
      setPath(getCalculation(), path.replace('typeId', 'stageKey'), '')
      notify()
      ctx.render()
      return true
    }
    return false
  }

  const action = el.dataset?.action
  if (action === 'set-forage') {
    chooseForage(el.value, ctx)
    return true
  }
  if (action === 'set-frame-unit') {
    chooseAreaUnit(el.value, ctx)
    return true
  }
  if (action === 'set-stage') {
    const calc = getCalculation()
    calc.dm.stageKey = el.value
    calc.dm.stageTypeId = calc.forageType
    notify()
    return true
  }
  return false
}

export function handleAction(action, btn, ctx) {
  const calc = getCalculation()

  switch (action) {
    /* step 1 */
    case 'add-sample':
      calc.samples.push('')
      notify()
      ctx.render()
      return true
    case 'remove-sample':
      if (calc.samples.length > 1) calc.samples.pop()
      notify()
      ctx.render()
      return true

    /* step 2 */
    case 'set-frame': {
      const was = FRAMES.find((f) => f.key === calc.frame.key)
      calc.frame.key = btn.dataset.mode
      // A preset is a shortcut to a number, not a replacement for one. It fills
      // the box in so the figure being used is on screen and can be measured
      // against the hoop in the pickup.
      const preset = FRAMES.find((f) => f.key === calc.frame.key)
      // And in square feet, which is the unit the preset is stated in on the
      // pill, in the hint, and on the printed worksheet. Converting 0.96 into
      // 138.24 square inches to preserve a unit nobody is using any more puts
      // a figure on screen that agrees with no copy of the worksheet.
      if (preset?.area != null) {
        calc.frame.customArea = String(preset.area)
        calc.frame.areaUnit = DEFAULT_AREA_UNIT
      }
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
      ctx.render()
      return true
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
      ctx.render()
      return true
    case 'toggle-stage-photos':
      setPref('showStagePhotos', !getPref('showStagePhotos'))
      ctx.render()
      return true
    case 'open-chart':
      openDryMatterTable({
        group: null,
        typeId: calc.forageType === MIXED.id ? calc.dm.stageTypeId : calc.forageType,
        stageKey: calc.dm.stageKey,
      })
      return true
    case 'open-chart-picker':
      openDryMatterTable({
        group: null,
        typeId: calc.dm.stageTypeId,
        stageKey: calc.dm.stageKey,
        pickable: true,
      })
      return true
    case 'pick-cell':
      calc.dm.stageTypeId = btn.dataset.typeId
      calc.dm.stageKey = btn.dataset.stageKey
      notify()
      ctx.closeModal()
      ctx.render()
      return true
    case 'add-mix':
      calc.dm.mix.push(newMixRow(defaultMixType(calc)))
      notify()
      ctx.render()
      return true
    case 'remove-mix':
      calc.dm.mix.splice(Number(btn.dataset.index), 1)
      if (!calc.dm.mix.length) calc.dm.mix.push(newMixRow())
      notify()
      ctx.render()
      return true

    /* step 3 */
    case 'set-usable-mode':
      calc.usable.mode = btn.dataset.mode
      notify()
      ctx.render()
      return true

    case 'pick-forage':
      ctx.closeModal()
      chooseForage(btn.dataset.value, ctx)
      return true

    default:
      return false
  }
}

/**
 * Which branches of the calculation each step's Clear empties, in step order.
 *
 * Named rather than derived from the markup, because "what this step is for" is
 * a fact about the worksheet and a step that renders a figure it does not own
 * must not be able to clear it. The values come from newCalculation(), so a new
 * field is blanked correctly by adding it to the factory and nothing else.
 * STEP_INPUTS in calc.js is the same idea for a different question: which inputs
 * a step COLLECTS, for saying what is still outstanding.
 */
export const STEP_FIELDS = [['samples'], ['frame', 'dm'], ['usable'], ['demand'], ['pasture']]

/**
 * Put back what a Clear cannot leave blank.
 *
 * The mix rows come back empty with the rest of step 2, so they take the forage
 * type the setup screen already named, the same as entering the builder does.
 */
export function afterClearStep(calc, index) {
  if (STEP_FIELDS[index]?.includes('dm')) {
    for (const row of calc.dm.mix) row.typeId = defaultMixType(calc)
  }
}

/** Enough entered that replacing it would lose work. */
export function started(calc) {
  const typed = (calc.samples ?? []).some((s) => s !== '' && s != null)
  return typed || (calc.goals?.length ?? 0) > 0 || !!calc.forageType
}

/**
 * Every question the landing screen asks has an answer.
 *
 * What "Start" is gated on, and what boot reads to decide whether a restored
 * calculation goes back to the steps or to the setup screen it already answered.
 */
export function setupAnswered(calc) {
  return !!(calc.goals?.length && calc.forageType)
}

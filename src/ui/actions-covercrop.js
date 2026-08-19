/**
 * The cover crop worksheet's own handlers.
 *
 * Short, because this worksheet asks fewer questions of its own: a season, a
 * height, a residual, and how utilization is arrived at. Everything from the
 * daily demand onward is the same arithmetic the perennial sheet does, and
 * everything about moving through the steps belongs to main.js.
 *
 * Same contract as actions-perennial.js: return `true` when the event has been
 * dealt with, never call render() directly, take it off `ctx`.
 */

import { getCalculation, notify } from '../state.js'

/**
 * Choose which season the stand is dominated by.
 *
 * Nothing else has to be cleared, unlike the perennial sheet's forage type — a
 * growth stage belongs to a ROW of Exhibit 4-2 and cannot survive a change of
 * row, but a height is a height whichever season it was measured in.
 */
function chooseSeason(id, ctx) {
  const calc = getCalculation()
  calc.season = id
  notify()
  ctx.render()
}

export function handleChange(el, ctx) {
  const action = el.dataset?.action

  if (action === 'set-season') {
    chooseSeason(el.value, ctx)
    return true
  }

  if (action === 'set-period') {
    const calc = getCalculation()
    calc.utilization.periodKey = el.value
    notify()
    return true
  }

  return false
}

export function handleAction(action, btn, ctx) {
  const calc = getCalculation()

  switch (action) {
    case 'set-util-mode':
      // `periodKey` and `ownPct` are kept apart in the record, so switching
      // across to check the other one and back does not throw either away.
      calc.utilization.mode = btn.dataset.mode
      notify()
      ctx.render()
      return true

    case 'pick-season':
      ctx.closeModal()
      chooseSeason(btn.dataset.value, ctx)
      return true

    default:
      return false
  }
}

/**
 * Which branches each step's Clear empties.
 *
 * `season` is NOT among them. It is answered on the setup screen, the same as
 * the perennial sheet's forage type, and a Clear on step 1 that silently took it
 * away would send somebody back to a landing screen they had already finished.
 */
export const STEP_FIELDS = [['stand'], ['residual'], ['utilization'], ['demand'], ['pasture']]

/** Enough entered that replacing it would lose work. */
export function started(calc) {
  return (
    (calc.goals?.length ?? 0) > 0 ||
    !!calc.season ||
    !!calc.stand?.height ||
    !!calc.residual?.height
  )
}

/** Every question the landing screen asks has an answer. */
export function setupAnswered(calc) {
  return !!(calc.goals?.length && calc.season)
}

/**
 * The step indicator.
 *
 * Equal spacing at every width, nothing clipped, nothing scrolling sideways.
 * Each item takes an equal share of the row and the connector is drawn from the
 * previous circle's centre to this one's, so the gaps stay equal by
 * construction rather than by a fixed pixel width that stops fitting on a
 * narrow phone. See the .stepper block in app.css.
 *
 * Below 480px the labels are hidden and the caption under the strip names the
 * current step instead. The circles stay full size, so every tap target
 * survives.
 *
 * A step already reached is clickable, and so is the NEXT one: the circle is
 * another way of pressing Next, and a producer who has read ahead to step 3
 * should not have to go back through step 2 to get there. Steps beyond that are
 * still locked, because a strip where every circle is live stops saying where
 * the work has got to.
 *
 * Reached and REACHABLE are separate on purpose. Only the first colours the
 * connector, so opening the next step does not backdate the trail to it.
 *
 * The high-water mark is kept separately from the current step so going back
 * does not lock the steps in front of you.
 */

import { esc } from './format.js'

export function renderStepper(labels, current, maxReached) {
  return `
    <nav aria-label="Worksheet steps">
      <ol class="stepper">
        ${labels
          .map((label, i) => {
            const done = i < current
            const active = i === current
            const reached = i <= maxReached
            const reachable = i <= maxReached + 1
            const classes = [
              'step-item',
              reached ? 'step-item--reached' : '',
              done ? 'step-item--done' : '',
              active ? 'step-item--active' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return `
              <li class="${classes}">
                <button type="button" class="step-num" data-action="go-step" data-step="${i}"
                  ${reachable && !active ? '' : 'disabled'}
                  aria-current="${active ? 'step' : 'false'}"
                  aria-label="Step ${i + 1}: ${esc(label)}">${done ? '&#10003;' : i + 1}</button>
                <span class="step-label">${esc(label)}</span>
              </li>`
          })
          .join('')}
      </ol>
      <p class="step-caption">Step ${current + 1} of ${labels.length}: ${esc(
        labels[current] ?? ''
      )}</p>
    </nav>`
}

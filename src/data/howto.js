/**
 * "How to use this calculator", behind the `?` in the header.
 *
 * Same house style as definitions.js: short sentences, direct, no filler.
 * Shape: { heading, body?: string[], steps?: string[] }
 */

export const HOW_TO_SECTIONS = [
  {
    heading: 'What this does',
    body: [
      'This is the SDSHC Graziers Math Worksheet as a calculator. It works out how long a pasture will feed your herd, how many acres you need, or how many animals you can run.',
      'It uses clipped forage samples, so it measures what is actually growing rather than guessing from a stocking rate table.',
      'The steps and the numbers match the paper worksheet, so you can follow along with a printed copy.',
    ],
  },
  {
    heading: 'Before you start',
    body: ['You will need to be out in the pasture for the first part of this.'],
    steps: [
      'A clipping hoop or frame, and its area in square feet.',
      'Scissors or hand shears, and bags for the samples.',
      'A scale that reads grams.',
      'A dry place to leave the samples until they stop losing weight.',
      'Your average animal weight and herd size, and your pasture acres.',
    ],
  },
  {
    heading: 'Working through it',
    steps: [
      'Choose the answers you want. You can pick more than one. The calculator asks only for what those answers need.',
      'Choose the forage type that makes up most of your stand.',
      'Clip and weigh at least five samples, and enter each weight in grams.',
      'Enter your frame size and the growth stage, or your own dried sample percent.',
      'Say how much forage you plan to leave behind.',
      'Enter animal weight and herd size.',
      'Read your answers on the last step.',
    ],
  },
  {
    heading: 'Reading the results',
    body: [
      'Every step shows its own sub-result, so you can see where a number came from and catch a bad entry early.',
      'The bar at the bottom of the screen keeps the running figures in view while you work.',
      'Turn on "Show all steps" to see the whole worksheet on one page. Printing always shows all five steps, whichever one is open.',
    ],
  },
  {
    heading: 'What it assumes',
    body: [
      'That your samples represent the pasture. Clip several spots away from water, gates, and shade.',
      'That the herd grazes the area evenly. Real animals do not, so treat the answers as planning figures and keep checking your residual on the ground.',
      'That this season is this season. Rainfall moves forage production a long way year to year, so resample rather than reusing last year’s answer.',
    ],
  },
  {
    heading: 'Saving your work',
    body: [
      'Your entries save on this device as you type, so closing the page will not lose them.',
      'Use Save calculation to keep a named copy you can come back to, for example one per pasture per season. Once a calculation is saved, that button becomes Edit saved and writes your changes back to the same copy.',
      'Clear empties the boxes in the steps and keeps your goals and forage type, for the next pasture. New calculation starts over from the setup screen. Neither touches anything you have saved.',
      'Nothing is uploaded anywhere. Everything stays in this browser, which also means clearing your browser data will remove it.',
    ],
  },
]

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
      'This is two SDSHC worksheets as calculators. Each works out how long a piece will feed your herd, how many acres you need, or how many animals you can run.',
      'Perennial grazing is the Graziers Math Worksheet, for native range and tame pasture. It works from clipped forage samples, so it measures what is growing rather than reading a stocking rate off a table.',
      'Cover crop grazing is the Grazing Cover Crops worksheet, for annual cover crops. It works from the average height of the stand.',
      'Pick one from the tabs at the top. Each keeps its own entries, so you can leave one part way through and come back to it. The steps and the numbers match the paper worksheets, so you can follow along with a printed copy.',
    ],
  },
  {
    heading: 'Before you start: perennial grazing',
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
    heading: 'Working through perennial grazing',
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
    heading: 'Before you start: cover crop grazing',
    body: ['Nothing is clipped, weighed, or dried. Production is estimated from the height of the stand.'],
    steps: [
      'A yardstick or a tape measure.',
      'Which season dominates the standing growth: warm, cool, or a mix.',
      'The residual height you plan to leave.',
      'How long the animals will be on each piece.',
      'Your average animal weight and herd size, and your field acres.',
    ],
  },
  {
    heading: 'Working through cover crop grazing',
    steps: [
      'Choose the answers you want. You can pick more than one. The calculator asks only for what those answers need.',
      'Choose the season that makes up most of the standing growth. The three seasons grow at different rates, so this sets the production estimate.',
      'Measure the average height of the stand in inches, in several places across the field.',
      'Enter the residual height you plan to leave. What stays standing is not available to graze, so it is subtracted first.',
      'Enter how long the animals will be on the piece, or type your own utilization percent.',
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
      'Clear, on a step, empties that step and nothing else. New calculation starts the calculator you are in over from its setup screen. Neither touches anything you have saved.',
      'Both calculators save into one list. Each card is tagged with the calculator it came from, and the buttons beside the filter box show one kind at a time.',
      'Save as, on a card in the Saved tab, writes one calculation out as an image, a spreadsheet, a printout, or a file. Upload a calculation reads a file back in alongside what you already have.',
      'Export backup, on the Saved tab, downloads every saved calculation of both kinds as one file. Restore backup reads it back and replaces everything on the tab, so the calculator says how many are arriving and how many are going before it does anything.',
      'Nothing is uploaded anywhere. Everything stays in this browser, which also means clearing your browser data will remove it. Export a backup for anything you want to keep.',
    ],
  },
]

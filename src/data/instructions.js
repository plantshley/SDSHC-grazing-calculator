/**
 * The three instructional panels above Step 1.
 *
 * Each has a media slot that is null until SDSHC has photography or video.
 * The UI renders a labelled placeholder for null and is otherwise identical,
 * so adding real media is an edit to this file and no code change.
 *
 * A filled slot is either:
 *   { type: 'image', src, alt, credit }
 *   { type: 'video', src, poster, alt, credit }
 * where `src` resolves against import.meta.env.BASE_URL.
 */

export const INSTRUCTIONS = [
  {
    id: 'clip',
    title: 'How to clip',
    media: null,
    mediaCaption: 'Placing the hoop, clipping to ground level, and bagging the sample',
    body: [
      'Toss or place the hoop on a spot that represents the stand, not the best patch and not the worst.',
      'Clip every standing plant rooted inside the hoop, down to ground level.',
      'Leave litter and old residue on the ground. That is armor for the soil, and it is not forage.',
      'Bag each sample separately and label it. Repeat at least five times across the pasture.',
    ],
  },
  {
    id: 'dry',
    title: 'How to dry',
    media: null,
    mediaCaption: 'Air drying samples to a steady weight',
    body: [
      'Spread each sample out somewhere dry and out of the weather. A shop bench or a shed floor works.',
      'Leave it until it stops losing weight. Weigh it, wait a day, weigh it again. When the two match it is done.',
      'Do not use an oven, a heater, or a microwave. Artificial heat drives off more than air drying, and every figure in this worksheet is built on air-dry weight.',
      'If you are skipping this, use the growth stage chart in Step 2 instead.',
    ],
  },
  {
    id: 'weigh',
    title: 'How to weigh',
    media: null,
    mediaCaption: 'Zeroing the scale on an empty bag and reading grams',
    body: [
      'Use a scale that reads grams. A kitchen scale is accurate enough.',
      'Put the empty bag on the scale and zero it first, so you weigh the forage and not the packaging.',
      'Weigh each sample on its own and write the weight down before you tip it out.',
      'Enter each weight in Step 1. The calculator averages them for you.',
    ],
  },
]

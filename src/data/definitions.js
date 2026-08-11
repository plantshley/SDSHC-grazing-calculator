/**
 * Definitions behind every round `?`.
 *
 * Terms are taken from the National Range and Pasture Handbook glossary, NRCS,
 * September 1997, the companion to the same handbook Exhibit 4-2 comes from.
 * The NRPH wording is kept in a comment where this file rephrases it, so a
 * reviewer can check the plain-language version against the source without
 * opening the PDF.
 *
 * House style, matching SDSHC-farm-budget:
 *   - Short sentences. Direct technical writing.
 *   - Say what the number is, then what the user does with it.
 *   - No em-dashes, no hedging, no filler, no citations inside the prose.
 *   - Serial commas.
 *
 * Shape: { title, body: string[], source?: string }
 */

const NRPH = 'National Range and Pasture Handbook, NRCS, September 1997.'

export const DEFINITIONS = {
  /* ─────────────────────────── step 1 ──────────────────────────────────── */

  clipping: {
    title: 'Clipping a sample',
    body: [
      'Drop your hoop or frame on a spot that represents the stand, then clip all the standing forage inside it down to ground level.',
      'Take at least five samples from different spots. Rangeland varies a lot over short distances, and one sample from a good patch will overstate the whole pasture.',
      'Clip standing forage only. Litter and old residue lying on the ground are not forage an animal will graze, so leaving them out keeps the estimate honest. This is armor for the soil and it should stay where it is.',
      'Avoid clipping right next to water, fence lines, gates, or shade. Those spots are grazed differently from the rest of the pasture.',
    ],
  },

  airDryMatter: {
    title: 'Air-dry matter',
    body: [
      'The share of a sample that is left once the water has gone out of it. A green sample is mostly water, and animals are fed by the dry part.',
      // NRPH: "The weight of a substance, usually vegetation, after it has been
      // allowed to dry to equilibrium with the atmosphere, usually without
      // artificial heat."
      'Air drying means leaving the sample out until it stops losing weight. Do not use an oven or a heater. Artificial heat drives off more than air drying does, and every figure in this worksheet is built on air-dry weight.',
      'You can dry and weigh your own samples, or use the growth stage chart to look up a typical figure for your forage type.',
    ],
    source: NRPH,
  },

  sampleSpread: {
    title: 'Spread between samples',
    body: [
      'The gap between your lightest and heaviest sample, next to the average.',
      'A wide spread means the stand is patchy and the average is resting on very little. Clip a few more spots. It costs a few minutes and it is the cheapest accuracy in the whole worksheet.',
    ],
  },

  /* ─────────────────────────── step 2 ──────────────────────────────────── */

  frame: {
    title: 'Clipping frame or hoop',
    body: [
      'The known area you clip inside. Its size is what turns a handful of grass into pounds per acre, so it has to be right.',
      'The two standard NRCS hoops are 0.96 square feet and 1.92 square feet. The worksheet multiplies grams by 100 for the small hoop and by 50 for the large one.',
      'If you use something else, measure its area in square feet and enter it. A square frame is easy: a 12 inch by 12 inch frame is 1 square foot.',
    ],
  },

  totalProduction: {
    title: 'Total production',
    body: [
      'What the stand grew this year, in pounds per acre, before anything is taken off for water content or for what you leave behind.',
      'This is your average sample weight scaled up from the frame to a full acre. It is a green weight, so it is larger than the number you will actually plan on.',
    ],
    source: NRPH,
  },

  availableForage: {
    title: 'Available forage',
    body: [
      'Total production once the water is taken out. This is the dry forage standing in the pasture.',
      // NRPH: "That portion of the forage production that is accessible for use
      // by a specified kind or class of grazing animal."
      'It is not all grazeable. Some has to stay on the ground to protect the soil and let the plants recover, which is the next step.',
    ],
    source: NRPH,
  },

  growthStage: {
    title: 'Growth stage',
    body: [
      'How far along the stand is in its season. Dry matter climbs as a plant matures, from about a third of its weight when it is growing to nearly all of it once it is dormant.',
      'Pick the stage that matches what most of the stand looks like now. If the pasture is a mix and no single stage fits, dry your own samples instead, or use the weighted mix option.',
    ],
    source: NRPH,
  },

  forageType: {
    title: 'Forage type',
    body: [
      'Which row of the dry matter chart applies to your stand. Cool season and warm season grasses cure at different rates, and forbs use a different set of stages again.',
      'Most South Dakota rangeland is a mix. Pick the type that makes up most of what you clipped. If nothing dominates, choose "Mixed or not sure" and pick any cell from the full chart, or build a weighted mix.',
      'Your clipped sample already contains the mix physically. The forage type only decides which dry matter figure gets applied to it.',
    ],
  },

  mixBuilder: {
    title: 'Weighted mix',
    body: [
      'For a stand where two or three forage types each make up a real share.',
      'Enter each type, its growth stage, and roughly what percent of the stand it is. The result is each dry matter figure weighted by its share.',
      'The shares are treated as weights, so 60 and 30 gives the same answer as 67 and 33. If they do not total 100 the calculator still works, and it will say so in case you meant to add another row.',
    ],
  },

  /* ─────────────────────────── step 3 ──────────────────────────────────── */

  amountLeaving: {
    title: 'Forage left behind',
    body: [
      'How much dry forage per acre you plan to leave standing when the animals move off.',
      'This is the residual that armors the soil, keeps roots alive, and lets the plant regrow. Grazing it away costs you next year to pay for this year.',
      'A common starting point is to take half and leave half. Your own soil, rainfall, and recovery plan should move that figure, so this one is your call.',
    ],
    source: NRPH,
  },

  usableForage: {
    title: 'Usable forage',
    body: [
      'Available forage minus what you leave behind. This is the amount you can actually plan to graze.',
      'Every answer at the end of the worksheet is built on this number, so it is worth getting the residual right before you read them.',
    ],
    source: NRPH,
  },

  harvestPct: {
    title: 'Harvest percent',
    body: [
      // NRPH harvest efficiency: "The total percent of vegetation harvested by
      // a machine or ingested by a grazing animal compared to the total amount
      // of vegetation grown in the area in a given year."
      'The share of available forage the animals actually eat. The rest is trampled, fouled, or left standing.',
      'It is the same calculation as entering pounds left behind, said the other way round. Take half and leave half is 50 percent.',
      'Shorter grazing periods on smaller paddocks raise this figure, because animals have less time to pick through and waste what they walk on.',
    ],
    source: NRPH,
  },

  /* ─────────────────────────── step 4 ──────────────────────────────────── */

  bodyWeightPct: {
    title: 'Percent of body weight',
    body: [
      'How much an animal eats each day, as a share of what it weighs.',
      // NRPH animal-unit-day: "The pounds of feed needed to meet an animal's
      // daily requirement is usually calculated by taking 2.5 to 3 percent of
      // the animal's body weight."
      'NRCS puts the usual range at 2.5 to 3 percent. The worksheet uses 2.6 percent.',
      'Intake changes with the kind and class of animal and with the forage in front of it. A lactating cow eats more than a dry one. Check your own conditions and move the figure if you have reason to.',
    ],
    source: NRPH,
  },

  perAnimalDemand: {
    title: 'Forage demand per animal',
    body: [
      'Pounds of dry forage one animal needs each day. Animal weight times percent of body weight.',
    ],
  },

  herdDemand: {
    title: 'Total forage demand',
    body: [
      'Pounds of dry forage the whole herd needs each day. Per-animal demand times the number of animals.',
    ],
  },

  animalDay: {
    title: 'Animal-days',
    body: [
      'One animal grazing for one day. A pasture holding 500 animal-days will carry 50 head for 10 days, or 25 head for 20 days.',
      // NRPH: "The amount of forage required by an animal unit for 1 day."
      'It is a useful way to hold the forage in a pasture in your head without fixing either the herd size or the length of stay first.',
    ],
    source: NRPH,
  },

  /* ─────────────────────────── step 5 ──────────────────────────────────── */

  ungrazeable: {
    title: 'Ungrazeable acres',
    body: [
      'Acres inside the fence that grow no forage the animals will use. Water, rock, dense timber, roads, buildings, and steep ground they will not climb.',
      'Counting them costs you real forage on paper that is not there on the ground, which overstates every answer. If you are unsure, walk it or check an aerial photo.',
    ],
  },

  paddock: {
    title: 'Paddock',
    body: [
      // NRPH: "One of the subdivisions or subunits of the entire pasture unit."
      'A fenced subdivision of a pasture, grazed for a set time and then rested.',
      'The square footage here is the area one day of grazing needs. The calculator shows a square by default because that is the least fence for the area. Enter one side and it will work out the other, which is what you want when you are running off an existing fence line.',
    ],
    source: NRPH,
  },

  grazingDays: {
    title: 'Grazing days',
    body: [
      'How many days the pasture will feed your herd before the forage you planned to use is gone.',
      'It assumes the herd eats evenly across the whole area. Real animals do not, so treat this as a planning figure and keep watching your residual on the ground.',
    ],
  },

  acresNeeded: {
    title: 'Acres needed',
    body: [
      'How much ground your herd needs for one day, and for the whole rotation if you entered planned days.',
      'Use the daily figure to size a paddock and the total to check the pasture is big enough for the stay you have in mind.',
    ],
  },

  animalsAllowed: {
    title: 'Animals allowed',
    body: [
      'How many animals the pasture will carry for the number of days you entered.',
      'The figure is rounded down. A partial animal does not fit, and rounding up is overstocking.',
      // NRPH carrying capacity: "The maximum stocking rate possible without
      // inducing permanent or long-term damage to vegetation or related
      // resources."
      'This is one season, from one set of samples. Carrying capacity changes year to year with rainfall, so do not carry this number into next season.',
    ],
    source: NRPH,
  },

  totalUsableForage: {
    title: 'Total usable forage',
    body: [
      'Every pound you can plan to graze in the whole pasture. Grazeable acres times usable forage per acre.',
    ],
  },
}

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
      'Ideally take at least five samples from different spots. Rangeland varies a lot over short distances, so one sample may not be representative of the whole pasture.',
      'Clip standing forage only. Litter and old residue lying on the ground are not forage an animal will graze, so leave them out. This is armor for the soil and it should stay where it is.',
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
      'Air drying means leaving the sample out until it stops losing weight. Do not use an oven or a heater. Every figure in this worksheet is built on air-dry weight.',
      'You can dry and weigh your own samples, or use the growth stage chart to look up a typical figure for your forage type.',
    ],
    source: NRPH,
  },

  sampleSpread: {
    title: 'Spread between samples',
    body: [
      'The gap between your lightest and heaviest sample, next to the average.',
      'A wide spread means the stand is patchy, so it is recommended to clip a few more spots to improve the estimate accuracy.',
    ],
  },

  /* ─────────────────────────── step 2 ──────────────────────────────────── */

  frame: {
    title: 'Clipping frame or hoop',
    body: [
      'The known area you clip inside. It is usually a round hoop or a square frame, and the area is in square feet.',
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
      'Most South Dakota rangeland is a mix. Pick the type that makes up most of what you clipped. If nothing dominates, choose "Mixed or not sure" and pick any cell from the full growth stages chart in step 2, or build a weighted mix.',
      'Your clipped sample already contains the mix physically. The forage type only decides which dry matter figure gets applied to it.',
    ],
  },

  mixBuilder: {
    title: 'Weighted mix',
    body: [
      'For a stand where two or three forage types each make up a clear share.',
      'Enter each type, its growth stage, and roughly what percent of the stand it is. The result is each dry matter figure weighted by its share.',
      'The shares are treated as weights, so 60 and 30 gives the same answer as 67 and 33. If they do not total 100 the calculator still works, and it will say so in case you meant to add another row.',
    ],
  },

  /* ─────────────────────────── step 3 ──────────────────────────────────── */

  amountLeaving: {
    title: 'Forage left behind',
    body: [
      'How much dry forage per acre you plan to leave standing when the animals move off.',
      'This is the residual that armors the soil, keeps roots alive, and lets the plant regrow. Grazing it has a cost.',
      'A common starting point is to take half and leave half. Your own soil, rainfall, and recovery plan should move that figure, so this one is your call.',
    ],
    source: NRPH,
  },

  usableForage: {
    title: 'Usable forage',
    body: [
      'Available forage minus what you leave behind. This is the amount you can actually plan to graze.',
      'Every answer at the end of the worksheet is built on this number, so it is important to get the residual right.',
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
      'NRCS puts the usual range at 2.5 to 3 percent. The worksheet adds 2.6 percent as a default.',
      'Intake changes with the kind and class of animal and with the forage in front of it. A lactating cow eats more than a dry one. Consider your own conditions and adjust the figure if needed.',
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
      'It is a useful way to understand the forage in a pasture without fixing either the herd size or the length of stay first.',
    ],
    source: NRPH,
  },

  /* ─────────────────────────── step 5 ──────────────────────────────────── */

  ungrazeable: {
    title: 'Ungrazeable acres',
    body: [
      'Acres inside the fence that grow no forage the animals will use. This may include water, rock, dense timber, roads, buildings, and steep ground they will not climb.',
      'If you are unsure of the amount, walk it or check an aerial photo.',
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
      'Use the daily figure to size a paddock and the total to check the pasture is big enough for the stay you would like.',
    ],
  },

  animalsAllowed: {
    title: 'Animals allowed',
    body: [
      'How many animals the pasture will carry for the number of days you entered.',
      'Note that the figure is rounded down (partial animals do not count).',
      // NRPH carrying capacity: "The maximum stocking rate possible without
      // inducing permanent or long-term damage to vegetation or related
      // resources."
      'This is one season, from one set of samples. Carrying capacity changes year to year with rainfall, so it is recommended to recalculate for each season.',
    ],
    source: NRPH,
  },

  totalUsableForage: {
    title: 'Total usable forage',
    body: [
      'Every pound you can plan to graze in the whole pasture. Equals grazeable acres times usable forage per acre.',
    ],
  },

  /* ──────────────────── the cover crop worksheet ───────────────────────── */

  ccSeason: {
    title: 'Which season dominates',
    body: [
      'Cover crops put on growth at different rates, so the production estimate is different for each.',
      'Warm-season stands include sorghum-sudan, pearl millet, sunn hemp, and cowpeas. Cool-season stands include cereal rye, oats, barley, peas, turnips, and radish.',
      'Use the mix estimate when neither dominates. It applies a flat rate to every inch of height rather than treating the first few inches separately.',
    ],
  },

  ccHeight: {
    title: 'Average height',
    body: [
      'The average height of the standing growth across the whole field, in inches.',
      'Take readings in several places across the field rather than one reading in one spot. Do not measure the tallest seed heads, and do not skip the thin places. Both belong in the average.',
      'Every figure in this worksheet is derived from this one measurement, so the accuracy of the result depends on it.',
    ],
  },

  ccTotalProduction: {
    title: 'Total air-dry production',
    body: [
      'What the whole standing crop is worth, in pounds per acre, before anything is taken off for what you will leave behind.',
      'It is worked out from the height you measured and the estimate for the season that dominates: a figure for the first four inches, then a figure for every inch above that. The mix estimate is a flat rate for every inch instead.',
      'Air-dry, so it is already the dry part. There is no separate dry matter step on this worksheet.',
    ],
  },

  ccResidual: {
    title: 'Minimum residual height',
    body: [
      'The height you plan to leave standing when the animals come off.',
      'Four inches is the usual starting point. Leave more on erodible ground, in a dry year, or where you want the regrowth.',
      'The residual keeps the soil covered and leaves the plant enough leaf area to regrow. Grazing below it costs production in the following season.',
      'The production estimate is applied twice, once at the stand height and once at the residual height. The difference between the two is what is available to graze.',
    ],
  },

  ccAvailableForage: {
    title: 'Available forage',
    body: [
      'Total production minus the residual you plan to leave. Pounds per acre.',
      'This is not the same as usable forage. Available forage is everything standing above your residual height. Usable forage is the share of that the animals eat, after what is trampled, fouled, or passed over.',
    ],
  },

  ccUtilization: {
    title: 'Percent utilization',
    body: [
      'The share of the available forage that actually gets eaten.',
      'The rest is trampled, fouled, bedded on, or passed over. It stays on the field as residue, but it is not feed and must not be counted as feed.',
      'The shorter the animals are on one piece, the higher it goes. Half a day to a day is 80%. Two or three days is 75%. Four days is 70%, five days is 65%, and anything from six to thirty days is 60%.',
      'Fencing off a smaller area is how the occupation period gets shortened. That is why the paddock figures on the last step are worth having.',
    ],
  },

  /* ─────────────────────────── the saved tab ───────────────────────────── */

  backupFile: {
    title: 'Backups and calculation files',
    body: [
      'A backup is a .json file holding everything on the Saved tab at once: every saved calculation, its color, and the order you dragged them into. "Export backup" downloads it.',
      'A calculation file is a .json file holding one calculation. "Save as" on a card writes one, and "Upload a calculation" reads one back in alongside what you already have. Use it to move one calculation to another device or to hand it to somebody else.',
      'Your calculations live in this browser, so clearing your browsing data deletes them, and so does replacing the device. A backup is how you get them back.',
      '"Restore backup" replaces everything on the Saved tab with what is in the file. Calculations saved on this device that are not in the file are deleted, and there is no undo. The calculator states how many are arriving and how many are going before it does anything.',
      'The backup file is dated, so backups taken on different days sit beside each other in your downloads folder rather than overwriting one another.',
    ],
  },

  /* ─────────────────────────── the footer ──────────────────────────────── */

  // Not a grazing term, and it opens from the footer rather than from a `?`
  // beside a field. It belongs here because it is the same kind of thing: a
  // read-only explanation that changes no number. Somebody is being asked to
  // type their sample weights, their herd size, and their acres into a web page
  // at a workshop, often on a borrowed device, and the honest answer to "who can
  // see this?" should be one tap away rather than something they have to ask a
  // person about.
  privacy: {
    title: 'Where your calculations live',
    body: [
      'Your figures stay on this device, in this browser. They are not sent anywhere and they are not stored on any server.',
      'The South Dakota Soil Health Coalition cannot see your calculations. Nobody can, except somebody using this device.',
      'Your saved calculations will not appear on your other phone or computer, and they are not shared with anyone.',
      'To move one to another device, or to hand it to somebody else, use "Save as" on its card to download a calculation file, and "Upload a calculation" on the Saved tab to read it back in.',
      'To keep a copy of everything at once, use "Export backup" on the Saved tab. Those files are the only things that ever leave this device, and only when you download them yourself.',
      'Because the calculations live in this browser, clearing your browsing data deletes them. Export a backup for anything you want to keep.',
      'We count anonymous usage: which worksheet you open, which options you pick, and how far you get. The numbers you type, your pasture names, and your saved calculations are never sent, and nothing identifies you.',
      // This paragraph used to carry an exception: the cover crops tab was an
      // embedded JotForm, and submitting it sent the entries to JotForm. The
      // native cover crop calculator replaced it, so the blanket promise above
      // is now true of every tab and the exception is gone.
      //
      // The older JotForm is still linked from the cover crop setup screen, and
      // the link says for itself where its entries go. It is a link off this
      // site rather than a part of it, which is the difference that lets the
      // sentence above stand unqualified.
      'The setup screen for cover crops links to SDSHC’s older online version of that worksheet. That one is hosted by JotForm, so anything submitted there goes to them. It is a separate website, and nothing you enter in this calculator is sent to it.',
    ],
  },
}

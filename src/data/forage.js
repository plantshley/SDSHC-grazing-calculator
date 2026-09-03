/**
 * Percentage of air-dry matter in harvested plant material at various stages
 * of growth.
 *
 * Source: NRPH Exhibit 4-2, reproduced on the SDSHC GRAZIERS MATH WORKSHEET.
 * National Range and Pasture Handbook, NRCS, September 1997.
 *
 * This file is the ONLY source for the growth stage picker, the table modal,
 * the forage picker on the landing screen, and the weighted mix builder. If a
 * percentage appears anywhere else in the app it is a bug.
 *
 * Grasses and forbs have different stage names in the source table, so the
 * stage descriptions live per group rather than per type. Stage PHOTOS are
 * grouped differently again: cool-season grasses, warm-season grasses and forbs
 * each get one photographed set (a season of one species), because stages look
 * broadly similar within a set and photographing all seven types at all five
 * stages would be 35 images for very little added meaning.
 *
 * Every photo slot is null until real photography lands. The UI renders a
 * labelled placeholder for null and is otherwise identical, so adding images is
 * an edit to this file and nothing else. A filled slot is
 * `{ src, alt, credit }`, where `src` resolves against import.meta.env.BASE_URL.
 *
 * A type carries `photos`, an ARRAY, not one image. Several rows of the chart
 * list four or five species, so a row may one day carry one photo per species.
 * The first entry is the thumbnail; the rest are reached by paging the viewer.
 * Today every row carries exactly one, which is why registerForageSet() in
 * ui/table.js hands back an index map rather than letting a caller assume that
 * card 3 is item 3 of the viewer set.
 */

/** Column headings for the four grass rows. */
export const GRASS_STAGES = [
  { key: 'vegetative', label: 'Vegetative', desc: 'Growth start to boot stage' },
  { key: 'headOut', label: 'Head out', desc: 'Boot stage to flowering' },
  { key: 'hardSeed', label: 'Hard seed', desc: 'Seed ripe, leaf tips dry' },
  { key: 'mature', label: 'Mature', desc: 'Leaves dry, stems partly dry' },
  { key: 'dry', label: 'Plants dry', desc: 'Summer dormancy or dormancy' },
]

/** Column headings for the three forb rows. Different stages, not a rename. */
export const FORB_STAGES = [
  { key: 'vegetative', label: 'Vegetative', desc: 'Initial growth to flower' },
  { key: 'flowering', label: 'Flowering', desc: 'Flowering stage to seed maturity' },
  { key: 'seedDissem', label: 'Seed dissemination', desc: 'Seed ripe, leaf tips dry' },
  { key: 'lateVeg', label: 'Late vegetative', desc: 'Seed drop, leaves dry, stems drying' },
  { key: 'dormant', label: 'Dead or dormant', desc: 'Plants dead or dormant' },
]

export const STAGES_BY_GROUP = { grass: GRASS_STAGES, forb: FORB_STAGES }

export const GROUP_LABELS = { grass: 'Grasses', forb: 'Forbs' }

const OSU = 'Bunchgrass Phenology, OSU Extension EM-9276.'

const SQUIRRELTAIL = 'Bottlebrush squirreltail'

/**
 * One photographed season of one plant, drawn on by every row of the chart.
 *
 * Every stage photo in the app comes from this object. Bottlebrush squirreltail
 * is a cool season bunchgrass, and it is the only species SDSHC has a full
 * season of, so the grass sets and the forb set below are both built out of
 * these seven frames rather than out of seven species each.
 */
const FRAME = {
  growthInit: {
    src: 'forage-images/stages_growth-init.webp',
    alt: 'New green leaves pushing up through the dead centre of a bunchgrass crown',
    credit: `Growth initiation, bottlebrush squirreltail. ${OSU}`,
  },
  bootLate: {
    src: 'forage-images/stages_boot-late.webp',
    alt: 'A seed head still wrapped in the leaf sheath, swelling the stem below the collar',
    credit: `Late boot, bottlebrush squirreltail. ${OSU}`,
  },
  flowering: {
    src: 'forage-images/stages_flowering.webp',
    alt: 'An open seed head shedding pollen, anthers hanging clear of the glumes',
    credit: `Flowering, bottlebrush squirreltail. ${OSU}`,
  },
  seed: {
    src: 'forage-images/stages_seed.webp',
    alt: 'A green bunchgrass carrying ripe seed heads with awns fully out',
    credit: `Seed set, bottlebrush squirreltail. ${OSU}`,
  },
  seedShatter: {
    src: 'forage-images/stages_seed-shatter.webp',
    alt: 'A mostly cured bunchgrass with seed heads breaking apart and leaves curling dry',
    credit: `Seed shatter, bottlebrush squirreltail. ${OSU}`,
  },
  dormant: {
    src: 'forage-images/stages_dormant.webp',
    alt: 'Fully cured golden bunchgrasses on a rangeland site, with a measuring stake for scale',
    credit: `Dormant, bottlebrush squirreltail. ${OSU}`,
  },
}

/**
 * Stage photos, one set per photoSet key, indexed to line up with that group's
 * stages. `note` is rendered above the picker and says what the photos may and
 * may not be read for.
 *
 * All four grass rows share one set, because they share the same five stage
 * definitions. What a shared photo does not show is TIMING: a warm season grass
 * reaches these stages weeks later than this plant did.
 *
 * The forb set is the same plant again, mapped onto the forb stages, which is a
 * bigger stretch and its note says so. A forb has no boot stage, so the forb
 * mapping reaches for the flowering frame where the grass mapping uses late
 * boot, and the two sets are NOT the same list in a different order. Purple
 * coneflower through a season is still the photography that would replace this.
 */
export const STAGE_PHOTOS = {
  coolSeason: {
    species: SQUIRRELTAIL,
    note: `Note: the photos are ${SQUIRRELTAIL.toLowerCase()}. Every grass row of the chart uses these same five stages, so read them for what the plant is doing rather than for the date.`,
    photos: [FRAME.growthInit, FRAME.bootLate, FRAME.seed, FRAME.seedShatter, FRAME.dormant],
  },
  forb: {
    species: SQUIRRELTAIL,
    note: `Note: the photos are ${SQUIRRELTAIL.toLowerCase()}, a grass, standing in until forbs are photographed. Read them for how far through the season the stand is rather than comparing how your stand looks.`,
    photos: [FRAME.growthInit, FRAME.flowering, FRAME.seed, FRAME.seedShatter, FRAME.dormant],
  },
}

STAGE_PHOTOS.warmSeason = STAGE_PHOTOS.coolSeason

const PLANTS = 'USDA PLANTS Database.'

/**
 * The seven rows of Exhibit 4-2.
 *
 * `dm` is the row of percentages, in the same order as the group's stages.
 * `photoSet` names which STAGE_PHOTOS set illustrates this type's stages.
 */
export const FORAGE_TYPES = [
  {
    id: 'coolSeasonGrass',
    group: 'grass',
    photoSet: 'coolSeason',
    label: 'Cool season grasses',
    species: [
      'Wheatgrasses',
      'Needlegrasses',
      'Bluegrasses',
      'Perennial bromes',
      'Prairie junegrass',
    ],
    dm: [35, 45, 60, 85, 95],
    photos: [
      {
        src: 'forage-images/a1-local-western-wheatgrass.webp',
        alt: 'A stand of western wheatgrass, blue-green with stiff upright stems',
      },
    ],
  },
  {
    id: 'warmTallGrass',
    group: 'grass',
    photoSet: 'warmSeason',
    label: 'Warm season tall grasses',
    species: ['Big bluestem', 'Indiangrass', 'Switchgrass'],
    dm: [30, 45, 60, 85, 95],
    photos: [
      {
        src: 'forage-images/a2-local-big-bluestem.webp',
        alt: 'Big bluestem in late summer, showing its three-pronged turkeyfoot seed head',
      },
    ],
  },
  {
    id: 'warmMidGrass',
    group: 'grass',
    photoSet: 'warmSeason',
    label: 'Warm season mid grasses',
    species: ['Sideoats grama', 'Little bluestem'],
    dm: [40, 55, 65, 90, 95],
    photos: [
      {
        src: 'forage-images/a3-local-little-bluestem-2.webp',
        alt: 'A little bluestem bunch turning rust red, with fluffy white seed along the stems',
      },
    ],
  },
  {
    id: 'warmShortGrass',
    group: 'grass',
    photoSet: 'warmSeason',
    label: 'Warm season short grasses',
    species: ['Blue grama', 'Buffalograss', 'Three-awn'],
    dm: [45, 60, 80, 90, 95],
    photos: [
      {
        src: 'forage-images/a4-local-buffalo-grass.webp',
        alt: 'A low buffalograss sod, curly grey-green leaves only a few inches tall',
      },
    ],
  },
  {
    id: 'succulentForb',
    group: 'forb',
    photoSet: 'forb',
    label: 'Succulent forbs',
    species: ['Onion', 'Cow parsnip', 'Lilies', 'Violets', 'Dandelion'],
    dm: [15, 35, 60, 90, 100],
    photos: [
      {
        src: 'forage-images/a5-PLANTS.webp',
        alt: 'Dandelion in a rangeland stand, in flower and gone to seed at the same time',
        credit: `Gary A. Monroe. Sierra Valley, Sierra County, California, 21 May 2005. ${PLANTS}`,
      },
    ],
  },
  {
    id: 'leafyForb',
    group: 'forb',
    photoSet: 'forb',
    label: 'Leafy forbs',
    species: ['Lupine', 'Purple coneflower', 'Globemallow', 'Vetches', 'Sageworts'],
    dm: [20, 40, 60, 90, 100],
    photos: [
      {
        src: 'forage-images/a6-local-purple-coneflower.webp',
        alt: 'Purple coneflower in bloom, with broad leaves low on the stem',
      },
    ],
  },
  {
    id: 'fibrousForb',
    group: 'forb',
    photoSet: 'forb',
    label: 'Fibrous leaves or mat forbs',
    species: ['Phlox', 'Pussytoes'],
    dm: [30, 50, 75, 90, 100],
    photos: [
      {
        src: 'forage-images/a7-local-phlox.webp',
        alt: 'A low mat of phlox in flower, hugging the ground over fine needle-like leaves',
      },
    ],
  },
]

/**
 * The fallback for a mixed stand, which is most South Dakota rangeland.
 *
 * Not an eighth row of the table and not a set of percentages. It means "show
 * me the whole chart and let me pick any cell", so it has no `dm` of its own.
 */
export const MIXED = {
  id: 'mixed',
  label: 'Mixed or not sure',
  sub: 'Show the whole chart and let me pick any cell',
  // A photo of what a mixed stand actually looks like, so this card is read
  // alongside the seven rows rather than as the place the photos run out. It is
  // deliberately a whole pasture rather than a plant: nothing in it is the
  // answer, which is the point of the card.
  photos: [
    {
      src: 'forage-images/grazing-management.webp',
      alt: 'A grazed mixed-grass pasture, several species and heights in the same stand',
    },
  ],
}

const BY_ID = new Map(FORAGE_TYPES.map((t) => [t.id, t]))

export function forageById(id) {
  return BY_ID.get(id) || null
}

export function typesInGroup(group) {
  return FORAGE_TYPES.filter((t) => t.group === group)
}

/** Stage descriptors for a type, with its percentage and photo zipped in. */
export function stagesFor(typeId) {
  const type = forageById(typeId)
  if (!type) return []
  const stages = STAGES_BY_GROUP[type.group]
  const photos = STAGE_PHOTOS[type.photoSet]?.photos ?? []
  return stages.map((s, i) => ({
    ...s,
    index: i,
    pct: type.dm[i],
    photo: photos[i] ?? null,
  }))
}

/**
 * Look up one cell. Returns null rather than a number when either id is
 * unknown, so a stale stored selection reads as "nothing chosen" instead of
 * silently resolving to the first stage.
 */
export function dryMatterFor(typeId, stageKey) {
  const type = forageById(typeId)
  if (!type) return null
  const stages = STAGES_BY_GROUP[type.group]
  const index = stages.findIndex((s) => s.key === stageKey)
  if (index < 0) return null
  const pct = type.dm[index]
  return Number.isFinite(pct) ? pct : null
}

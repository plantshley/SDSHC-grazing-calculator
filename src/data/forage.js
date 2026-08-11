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

/**
 * One photographed season per set. Indexes line up with the group's stages.
 * Suggested species are recorded so a later photographer knows what was meant.
 */
export const STAGE_PHOTOS = {
  coolSeason: { species: 'Western wheatgrass', photos: [null, null, null, null, null] },
  warmSeason: { species: 'Big bluestem', photos: [null, null, null, null, null] },
  forb: { species: 'Purple coneflower', photos: [null, null, null, null, null] },
}

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
    photo: null,
  },
  {
    id: 'warmTallGrass',
    group: 'grass',
    photoSet: 'warmSeason',
    label: 'Warm season tall grasses',
    species: ['Big bluestem', 'Indiangrass', 'Switchgrass'],
    dm: [30, 45, 60, 85, 95],
    photo: null,
  },
  {
    id: 'warmMidGrass',
    group: 'grass',
    photoSet: 'warmSeason',
    label: 'Warm season mid grasses',
    species: ['Sideoats grama', 'Little bluestem'],
    dm: [40, 55, 65, 90, 95],
    photo: null,
  },
  {
    id: 'warmShortGrass',
    group: 'grass',
    photoSet: 'warmSeason',
    label: 'Warm season short grasses',
    species: ['Blue grama', 'Buffalograss', 'Three-awn'],
    dm: [45, 60, 80, 90, 95],
    photo: null,
  },
  {
    id: 'succulentForb',
    group: 'forb',
    photoSet: 'forb',
    label: 'Succulent forbs',
    species: ['Onion', 'Cow parsnip', 'Lilies', 'Violets', 'Dandelion'],
    dm: [15, 35, 60, 90, 100],
    photo: null,
  },
  {
    id: 'leafyForb',
    group: 'forb',
    photoSet: 'forb',
    label: 'Leafy forbs',
    species: ['Lupine', 'Purple coneflower', 'Globemallow', 'Vetches', 'Sageworts'],
    dm: [20, 40, 60, 90, 100],
    photo: null,
  },
  {
    id: 'fibrousForb',
    group: 'forb',
    photoSet: 'forb',
    label: 'Fibrous leaves or mat forbs',
    species: ['Phlox', 'Pussytoes'],
    dm: [30, 50, 75, 90, 100],
    photo: null,
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

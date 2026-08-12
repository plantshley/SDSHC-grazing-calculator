import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  FORAGE_TYPES,
  MIXED,
  GRASS_STAGES,
  FORB_STAGES,
  STAGES_BY_GROUP,
  STAGE_PHOTOS,
  forageById,
  typesInGroup,
  stagesFor,
  dryMatterFor,
} from '../src/data/forage.js'

/**
 * Exhibit 4-2 as printed on the worksheet, restated here independently.
 *
 * This is deliberately a second transcription rather than a loop over the
 * source file: a test that reads its expectations out of the thing it is
 * testing proves only that the file can be read. If these two ever disagree,
 * check the PDF before changing either.
 */
const EXHIBIT_4_2 = {
  coolSeasonGrass: [35, 45, 60, 85, 95],
  warmTallGrass: [30, 45, 60, 85, 95],
  warmMidGrass: [40, 55, 65, 90, 95],
  warmShortGrass: [45, 60, 80, 90, 95],
  succulentForb: [15, 35, 60, 90, 100],
  leafyForb: [20, 40, 60, 90, 100],
  fibrousForb: [30, 50, 75, 90, 100],
}

test('every row matches NRPH Exhibit 4-2', () => {
  assert.equal(FORAGE_TYPES.length, 7, 'the table has seven rows')
  for (const [id, expected] of Object.entries(EXHIBIT_4_2)) {
    const type = forageById(id)
    assert.ok(type, `${id} is present`)
    assert.deepEqual(type.dm, expected, `${id} percentages`)
  }
})

test('grasses and forbs have different stage names, not renamed ones', () => {
  assert.equal(GRASS_STAGES.length, 5)
  assert.equal(FORB_STAGES.length, 5)
  const grassKeys = GRASS_STAGES.map((s) => s.key).join()
  const forbKeys = FORB_STAGES.map((s) => s.key).join()
  assert.notEqual(grassKeys, forbKeys, 'forbs are not grasses with the labels swapped')
})

test('every type has one percentage per stage of its own group', () => {
  for (const type of FORAGE_TYPES) {
    const stages = STAGES_BY_GROUP[type.group]
    assert.ok(stages, `${type.id} names a known group`)
    assert.equal(type.dm.length, stages.length, `${type.id} has one value per stage`)
  }
})

test('every percentage is a usable proportion', () => {
  for (const type of FORAGE_TYPES) {
    for (const pct of type.dm) {
      assert.ok(Number.isFinite(pct), `${type.id} has a finite percentage`)
      assert.ok(pct > 0 && pct <= 100, `${type.id}: ${pct} is within 0 to 100`)
    }
  }
})

test('dry matter rises as a stand cures', () => {
  // A plant does not get wetter as it matures. A row that dips is a
  // transcription error, which is exactly the failure this table is prone to.
  for (const type of FORAGE_TYPES) {
    for (let i = 1; i < type.dm.length; i += 1) {
      assert.ok(
        type.dm[i] >= type.dm[i - 1],
        `${type.id} drops from ${type.dm[i - 1]} to ${type.dm[i]} at stage ${i}`
      )
    }
  }
})

test('ids are unique and every type carries the fields the UI reads', () => {
  const ids = new Set()
  for (const type of FORAGE_TYPES) {
    assert.ok(!ids.has(type.id), `${type.id} appears once`)
    ids.add(type.id)
    assert.ok(type.label, `${type.id} has a label`)
    assert.ok(Array.isArray(type.species) && type.species.length, `${type.id} lists species`)
    assert.ok(STAGE_PHOTOS[type.photoSet], `${type.id} names a known photo set`)
    assert.ok(Array.isArray(type.photos), `${type.id} has a photo list`)
  }
})

/**
 * A photo the app renders needs all three fields.
 *
 * `src` is resolved against BASE_URL, so a leading slash would send it to the
 * domain root and 404 on GitHub Pages. `alt` is the only description a screen
 * reader gets. A missing `credit` is allowed: SDSHC's own photography does not
 * need one, and the viewer renders an empty credit as nothing.
 */
test('every filled photo slot carries a usable src and alt', () => {
  const slots = [
    ...FORAGE_TYPES.flatMap((t) => t.photos),
    ...Object.values(STAGE_PHOTOS).flatMap((s) => s.photos),
  ].filter(Boolean)

  assert.ok(slots.length > 0, 'there are photos to check')
  for (const photo of slots) {
    assert.ok(photo.src, 'a photo names a file')
    assert.ok(!photo.src.startsWith('/'), `${photo.src} is relative to the base path`)
    assert.ok(photo.alt && photo.alt.length > 10, `${photo.src} describes itself`)
  }
})

test('every photo set has one slot per stage', () => {
  for (const [key, set] of Object.entries(STAGE_PHOTOS)) {
    assert.equal(set.photos.length, 5, `${key} has five stage slots`)
    assert.ok(set.species, `${key} records which species is pictured`)
    assert.ok(set.note, `${key} says what its photos can be read for`)
  }
})

/**
 * Every card on the setup screen carries a photo, the mixed fallback included.
 * A card drawn as a placeholder beside seven photographed ones reads as the
 * option that ran out rather than as the option for a stand with no single
 * answer, which is most South Dakota rangeland.
 */
test('every row of the chart carries one identification photo', () => {
  for (const type of FORAGE_TYPES) {
    assert.equal(type.photos.length, 1, `${type.id} has exactly one photo`)
  }
  assert.ok(MIXED.photos?.[0]?.src, 'and so does the mixed fallback')
})

/**
 * One plant is photographed and every row borrows it, so the two mappings have
 * to be built for the stages they illustrate rather than shared outright.
 * Forbs have no boot stage: a late boot photo under "Flowering to seed
 * maturity" would not be an approximation, it would be wrong.
 */
test('the forb stage set is not the grass set relabelled', () => {
  const grass = STAGE_PHOTOS.coolSeason.photos.map((p) => p.src)
  const forb = STAGE_PHOTOS.forb.photos.map((p) => p.src)
  assert.notDeepEqual(grass, forb, 'the boot frame is not used under a forb stage')
  assert.ok(
    STAGE_PHOTOS.forb.note.includes('grass'),
    'and the picker says the plant pictured is not a forb'
  )
})

test('groups partition the table', () => {
  const grass = typesInGroup('grass')
  const forb = typesInGroup('forb')
  assert.equal(grass.length, 4)
  assert.equal(forb.length, 3)
  assert.equal(grass.length + forb.length, FORAGE_TYPES.length)
})

test('stagesFor zips labels, percentages and photos together', () => {
  const stages = stagesFor('coolSeasonGrass')
  assert.equal(stages.length, 5)
  assert.equal(stages[0].label, 'Vegetative')
  assert.equal(stages[0].pct, 35)
  assert.equal(stages[4].pct, 95)
  assert.equal(stages[2].index, 2)
  assert.ok('photo' in stages[2])

  const forb = stagesFor('leafyForb')
  assert.equal(forb[1].label, 'Flowering', 'forbs use their own stage names')
  assert.equal(forb[1].pct, 40)
})

test('an unknown type yields no stages rather than throwing', () => {
  assert.deepEqual(stagesFor('nope'), [])
  assert.equal(forageById('nope'), null)
})

test('dryMatterFor reads the right cell', () => {
  assert.equal(dryMatterFor('warmMidGrass', 'headOut'), 55)
  assert.equal(dryMatterFor('succulentForb', 'vegetative'), 15)
  assert.equal(dryMatterFor('warmShortGrass', 'dry'), 95)
})

test('an unknown cell returns null, never a silent first stage', () => {
  // A stale stored selection must read as "nothing chosen" rather than quietly
  // resolving to 35% and producing a plausible wrong answer.
  assert.equal(dryMatterFor('coolSeasonGrass', 'flowering'), null, 'a forb stage on a grass')
  assert.equal(dryMatterFor('nope', 'vegetative'), null)
  assert.equal(dryMatterFor('coolSeasonGrass', ''), null)
})

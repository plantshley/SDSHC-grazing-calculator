/**
 * What a stored record is, independent of who can render it.
 *
 * storage.js has to know enough about a record's shape to migrate it and enough
 * about a file's shape to refuse the wrong one. It must not learn that from the
 * calculator registry: storage.js promises never to throw, and the registry
 * reaches the whole UI. So the two facts storage needs live here, in a leaf
 * module with no imports.
 *
 * `calcType` is the RECORD discriminator and `kind` (in storage.js) is the FILE
 * marker. They answer different questions — "which worksheet is this" versus "is
 * this one calculation or a backup of the whole list" — and must not be
 * conflated.
 */

/**
 * Which worksheet a record came from. Before schemaVersion 2 there was only one,
 * so a record with no `calcType` is a perennial one by definition. Never guess
 * from the shape: an empty record of either type looks the same.
 */
export const DEFAULT_CALC_TYPE = 'perennial'

/** Every type this build can render. A record naming anything else is coerced. */
export const CALC_TYPE_IDS = ['perennial', 'covercrop']

/**
 * The branches each type's record carries, and how to make an empty one.
 *
 * NOT the factory. `newCalculation()` in state.js is where a field's real
 * default lives; duplicating those here would give a stored record two owners
 * and let them drift. This is only enough shape that a read cannot crash.
 *
 * The two top-level scalars are in the list for the same reason as the branches:
 * `forageType` and `season` are each the answer to their worksheet's setup
 * question, and a corrupt or hand-edited record missing one should read as the
 * blank the factory would have made, not as `undefined`.
 */
const BRANCHES = {
  perennial: {
    forageType: () => '',
    samples: () => [],
    frame: () => ({}),
    dm: () => ({}),
    usable: () => ({}),
    demand: () => ({}),
    pasture: () => ({}),
  },
  covercrop: {
    season: () => '',
    stand: () => ({}),
    residual: () => ({}),
    utilization: () => ({}),
    demand: () => ({}),
    pasture: () => ({}),
  },
}

/**
 * Graft on whatever branches a record is missing, for its own type.
 *
 * Deliberately NOT part of the version ladder in migrate(). A record of either
 * type may be missing a branch at any version, and the ladder's `version < 1`
 * step used to graft the PERENNIAL branches onto everything — which is exactly
 * what a second calculator's records must not get.
 */
export function fillRecordDefaults(rec) {
  // Every calculator asks what the user wants worked out, so this one is common.
  rec.goals ??= []
  const branches = BRANCHES[rec.calcType] ?? BRANCHES[DEFAULT_CALC_TYPE]
  for (const [key, empty] of Object.entries(branches)) {
    rec[key] ??= empty()
  }
  return rec
}

/**
 * One of ours, as opposed to arbitrary JSON that happens to parse.
 *
 * A known `calcType`, OR the `samples` array that marks a calculation file
 * exported before `calcType` existed. Never relaxed to "whatever parses":
 * restoring the wrong file over somebody's work is the mistake this format has
 * to make impossible.
 */
export function looksLikeCalculation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return CALC_TYPE_IDS.includes(value.calcType) || Array.isArray(value.samples)
}

/**
 * Persistence — localStorage only.
 *
 * Ported from SDSHC-farm-budget. Two rules carry over and neither is
 * negotiable:
 *
 *  1. Every stored record carries `schemaVersion`. When the shape changes, bump
 *     SCHEMA_VERSION in calc.js and add a step to `migrate()` below. Never drop
 *     a record because it is old.
 *  2. A read that fails must not take the whole list with it. One corrupt
 *     record is skipped, not fatal.
 *
 * One deliberate simplification against farm-budget: that app files budgets
 * into folder records in their own key. Here a saved calculation carries a
 * `tag` colour key directly on the record instead. Grouping a handful of
 * pastures by colour needs a label, not a container, and a label cannot get
 * orphaned when the thing it points at is deleted.
 *
 * The working calculation lives in its OWN key, separate from the saved list,
 * AND in its own key per calculator. Autosave writes it on every keystroke; the
 * saved list is written only when someone presses Save. Sharing a key would let
 * a failing autosave take the saved calculations with it, and sharing one across
 * calculators would let a failure on one worksheet take the other's work too.
 *
 * `sdshc-gc-working` stays the PERENNIAL key and does not move, so a producer
 * with a half-finished worksheet still has it after the upgrade.
 */

import { SCHEMA_VERSION } from './calc.js'
import { CALC_TYPE_IDS, DEFAULT_CALC_TYPE, fillRecordDefaults, looksLikeCalculation } from './schema.js'

const KEY = 'sdshc-gc-calcs'
const KEY_LAST = 'sdshc-gc-last-open'

const WORKING_KEYS = {
  perennial: 'sdshc-gc-working',
  covercrop: 'sdshc-gc-working-covercrop',
}

const workingKey = (type) => WORKING_KEYS[type] ?? WORKING_KEYS[DEFAULT_CALC_TYPE]

/**
 * The `updatedAt` last read or written for each record, so a save can tell
 * whether another tab changed it in the meantime.
 *
 * Saving is a read-modify-write of one key. Within a tab that runs
 * synchronously so the list cannot tear, but the app open in two tabs can still
 * have the second save a stale copy over the first tab's work with nothing on
 * screen to say so. Deliberately module-level and not persisted: a fresh page
 * load has read nothing yet, which is the right starting state.
 */
const lastKnownUpdatedAt = new Map()

/** localStorage throws in Safari private mode and when the quota is full. */
function readKey(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * @param {string} key
 * @param {() => string} serialise  the stringify, called INSIDE the try.
 *
 * A thunk rather than a string, because `writeKey(k, JSON.stringify(x))` runs
 * the stringify as an argument — outside this try — and JSON.stringify throws on
 * a circular reference or a BigInt where structuredClone would not have. That is
 * unlikely with today's plain records, but "never throws" is the whole contract
 * of this module and an argument evaluated before the call is not covered by it.
 */
function writeKey(key, serialise) {
  try {
    localStorage.setItem(key, typeof serialise === 'function' ? serialise() : serialise)
    return { ok: true }
  } catch (err) {
    // QuotaExceededError is the realistic failure. The caller must surface it:
    // a silent failure lets someone keep working on data that is not being kept.
    return { ok: false, error: err?.name || 'StorageError' }
  }
}

function removeKey(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* non-fatal */
  }
}

/**
 * Bring an older stored record up to the current shape.
 * Each version gets its own step; steps run in order and fall through.
 *
 * The LADDER carries version steps only. Filling in missing branches is not a
 * version step and runs after it, because a record of either type may be missing
 * one at any version. The v<1 step used to graft `samples`, `dm`, `usable` and
 * `pasture` onto every record it saw, which is precisely what a second
 * calculator's records must not get — hence fillRecordDefaults(), which asks the
 * record what type it is first.
 */
function migrate(rec) {
  const version = Number(rec?.schemaVersion) || 0

  if (version < 1) {
    rec.schemaVersion = 1
    // Only what is genuinely type-neutral. Without these the list sorts on the
    // string "undefined", which compares above any ISO date, and an ancient
    // record shows up as the newest.
    rec.createdAt ??= new Date(0).toISOString()
    rec.updatedAt ??= rec.createdAt
  }

  if (version < 2) {
    // Before v2 there was one calculator, so a record with no calcType came out
    // of it. Never guess from the shape: an empty record of either type looks
    // exactly the same.
    rec.calcType ??= DEFAULT_CALC_TYPE
    rec.schemaVersion = 2
  }

  // A record naming a type this build does not have — written by a newer build,
  // or hand-edited. Coerce it so it renders as SOMETHING; never drop it.
  if (!CALC_TYPE_IDS.includes(rec.calcType)) rec.calcType = DEFAULT_CALC_TYPE

  return fillRecordDefaults(rec)
}

/**
 * Compare two records for list order.
 *
 * `sortIndex` is set only by an explicit reorder; until then it is absent and
 * the list falls back to newest-first, which is what someone who has never
 * reordered anything expects. Mixed lists put arranged records first, because a
 * deliberate arrangement outranks a timestamp.
 */
function byListOrder(a, b) {
  const ai = Number.isFinite(Number(a.sortIndex)) ? Number(a.sortIndex) : null
  const bi = Number.isFinite(Number(b.sortIndex)) ? Number(b.sortIndex) : null
  if (ai !== null && bi !== null) return ai - bi
  if (ai !== null) return -1
  if (bi !== null) return 1
  return String(b.updatedAt).localeCompare(String(a.updatedAt))
}

/* ───────────────────────── the working calculation ─────────────────────── */

/**
 * Autosave. Overwrites in place and is never versioned against another tab,
 * because there is only ever one working calculation per calculator on a device.
 *
 * The type comes off the RECORD, not off whatever is on screen. printSavedCalc()
 * borrows a record that may belong to the other calculator, and writing that to
 * the active calculator's key would put a cover crop record where the perennial
 * one lives.
 */
export function saveWorking(calc, type = calc?.calcType ?? DEFAULT_CALC_TYPE) {
  let text
  try {
    text = JSON.stringify(calc)
  } catch {
    return { ok: false, error: 'NotSerializable' }
  }
  return writeKey(workingKey(type), text)
}

export function loadWorking(type = DEFAULT_CALC_TYPE) {
  const raw = readKey(workingKey(type))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return migrate(parsed)
  } catch {
    // A working copy that will not parse is one calculation, and the user is
    // about to start a new one anyway. Saved calculations are in another key
    // and are untouched, and so is the other calculator's working copy.
    return null
  }
}

export function clearWorking(type = DEFAULT_CALC_TYPE) {
  removeKey(workingKey(type))
}

/* ───────────────────────── saved calculations ──────────────────────────── */

/** All saved calculations in list order. Unreadable records are skipped. */
export function listCalcs() {
  const raw = readKey(KEY)
  if (!raw) return []

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const out = []
  for (const record of parsed) {
    try {
      if (record && typeof record === 'object' && record.id) out.push(migrate(record))
    } catch {
      /* skip this one, keep the rest */
    }
  }
  return out.sort(byListOrder)
}

export function getCalcById(id) {
  const found = listCalcs().find((c) => c.id === id) || null
  if (found) lastKnownUpdatedAt.set(found.id, found.updatedAt)
  return found
}

/**
 * Insert or replace by id.
 *
 * Returns `{ok: false, error: 'Conflict'}` when the stored copy has moved on
 * since this tab last read it, so the caller can ask before overwriting. Pass
 * `{force: true}` to save anyway. Returns `{ok: false}` on a full or
 * unavailable store, and never throws.
 */
export function saveCalc(calc, { force = false } = {}) {
  if (!calc?.id) return { ok: false, error: 'MissingId' }

  const all = listCalcs()
  const index = all.findIndex((c) => c.id === calc.id)
  const existing = index >= 0 ? all[index] : null
  const seen = lastKnownUpdatedAt.get(calc.id)

  // Another tab wrote this record after we last read it.
  if (!force && existing && seen && String(existing.updatedAt) > String(seen)) {
    return { ok: false, error: 'Conflict', theirs: existing }
  }

  let record
  try {
    record = { ...structuredClone(calc), schemaVersion: SCHEMA_VERSION }
  } catch {
    // structuredClone rejects functions, DOM nodes and other non-cloneables.
    // Reporting beats throwing: this module promises never to throw.
    return { ok: false, error: 'NotSerializable' }
  }
  record.updatedAt = new Date().toISOString()
  record.createdAt = existing?.createdAt ?? record.createdAt ?? record.updatedAt

  if (index >= 0) {
    // Position is owned by the Saved tab alone. The copy in memory has no idea
    // where this was dragged to, so the stored value always wins.
    if (existing.sortIndex != null) record.sortIndex = existing.sortIndex

    // The colour has two owners: the Saved tab's Color button and the save
    // dialog. Whichever ran last is the answer, so the stored value is only a
    // FALLBACK, used when the incoming record says nothing about a colour.
    //
    // `undefined` is "not mentioned" and an empty string is "no colour,
    // deliberately". Collapsing the two would make removing a colour from the
    // save dialog silently put the old one back.
    if (record.tag === undefined && existing.tag != null) record.tag = existing.tag
    if (!record.tag) delete record.tag
    all[index] = record
  } else {
    if (!record.tag) delete record.tag
    // A new calculation belongs at the top, where the newest-first fallback
    // would have put it. Only meaningful once something has been reordered.
    const indices = all.map((c) => Number(c.sortIndex)).filter(Number.isFinite)
    if (indices.length) record.sortIndex = Math.min(...indices) - 1
    all.push(record)
  }

  const result = writeKey(KEY, () => JSON.stringify(all))
  if (result.ok) {
    lastKnownUpdatedAt.set(record.id, record.updatedAt)
    setLastOpened(record.id)
  }
  return result
}

/**
 * Change what a saved calculation is CALLED, without touching its figures.
 *
 * Name, pasture and colour are one dialog in the UI, so they are one write
 * here; three separate functions meant three separate read-modify-writes for
 * what the user did as a single edit.
 *
 * `updatedAt` moves only when the name or the pasture changed. Colouring a card
 * is filing, not editing, and a list that reorders itself because somebody
 * pressed a swatch is surprising.
 */
export function updateCalcMeta(id, { name, pastureName, tag } = {}) {
  const all = listCalcs()
  const found = all.find((c) => c.id === id)
  if (!found) return { ok: false, error: 'NotFound' }

  let renamed = false
  if (name !== undefined && String(name) !== found.name) {
    found.name = String(name)
    renamed = true
  }
  if (pastureName !== undefined && String(pastureName) !== (found.pastureName ?? '')) {
    found.pastureName = String(pastureName)
    renamed = true
  }
  // `undefined` is "not mentioned" and '' is "no colour, deliberately", the
  // same distinction saveCalc() draws.
  if (tag !== undefined) {
    if (tag) found.tag = String(tag)
    else delete found.tag
  }

  if (renamed) found.updatedAt = new Date().toISOString()
  const result = writeKey(KEY, () => JSON.stringify(all))
  if (result.ok && renamed) lastKnownUpdatedAt.set(id, found.updatedAt)
  return result
}

export function deleteCalc(id) {
  const remaining = listCalcs().filter((c) => c.id !== id)
  const result = writeKey(KEY, () => JSON.stringify(remaining))
  if (result.ok) lastKnownUpdatedAt.delete(id)
  return result
}

/**
 * Persist an explicit arrangement.
 *
 * Ids not present in `idsInOrder` keep whatever order they had and are appended
 * after the arranged ones. A reorder must never make a calculation disappear,
 * including one saved by another tab a moment ago.
 */
export function reorderCalcs(idsInOrder) {
  const all = listCalcs()
  const rank = new Map(idsInOrder.map((id, i) => [id, i]))
  const arranged = [
    ...all.filter((c) => rank.has(c.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id)),
    ...all.filter((c) => !rank.has(c.id)),
  ]
  arranged.forEach((c, i) => {
    c.sortIndex = i
  })
  return writeKey(KEY, () => JSON.stringify(arranged))
}

export function setLastOpened(id) {
  writeKey(KEY_LAST, id)
}

export function getLastOpened() {
  return readKey(KEY_LAST)
}

/** True when the browser will actually retain anything. */
export function storageAvailable() {
  try {
    const probe = '__sdshc_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/* ───────────────────── import / export (device transfer) ───────────────── */

/**
 * `tag` and `sortIndex` are stripped on the way out and on the way back in.
 *
 * Both describe one device's list rather than the calculation itself. A sort
 * position means nothing in another list, and a colour that happened to match
 * a scheme in use on the destination machine would file someone else's work
 * under it.
 *
 * `calcType` is NOT stripped. It describes the calculation — which worksheet it
 * came out of — rather than the device, and without it the file cannot be filed
 * under the right calculator on the way back in.
 */
export function exportCalcJSON(calc) {
  const { tag, sortIndex, ...rest } = calc
  try {
    return JSON.stringify({ ...rest, schemaVersion: SCHEMA_VERSION }, null, 2)
  } catch {
    // This module promises never to throw, and that has to hold here too.
    return null
  }
}

/**
 * Parse a calculation file. Returns {ok, calc} or {ok: false, error}, never
 * throws, because this input comes from a file the user picked.
 */
export function importCalcJSON(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not a saved calculation.' }
  }
  // The near miss in one direction: a backup handed to the single-file control.
  // Both files are .json and both came out of this app, so this says which
  // control the file belongs to rather than refusing it as unreadable.
  if (parsed?.kind === BACKUP_KIND) {
    return {
      ok: false,
      error:
        'That file is a backup of your whole saved list, not one calculation. Use "Restore backup" to bring it in.',
    }
  }
  // A known calcType, or the `samples` array that marks a file exported before
  // calcType existed. Never "whatever parses" — see looksLikeCalculation().
  if (!looksLikeCalculation(parsed)) {
    return { ok: false, error: 'That file is not a saved calculation.' }
  }
  delete parsed.tag
  delete parsed.sortIndex
  return { ok: true, calc: migrate(parsed) }
}

/* ─────────────────────────── backup / restore ──────────────────────────── */

/**
 * A backup is the whole saved list in one file, and it is a DIFFERENT kind of
 * thing from a calculation file.
 *
 * A calculation file is one calculation, handed to somebody else or carried to
 * another device, which is why exportCalcJSON() strips `tag` and `sortIndex`.
 *
 * A backup restores a list onto ITSELF, so the colours and the arrangement
 * travel with it. Stripping them would throw away most of what someone keeps a
 * backup for.
 *
 * `kind` is checked on the way back in. Both files are .json and both came out
 * of this app, so nothing about the extension tells them apart, and restoring
 * one calculation over a list of twelve is the one mistake this file format has
 * to make impossible.
 */
const BACKUP_KIND = 'sdshc-grazing-calculator-backup'

export function exportBackupJSON() {
  try {
    return JSON.stringify(
      {
        kind: BACKUP_KIND,
        backupVersion: 1,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        calculations: listCalcs(),
      },
      null,
      2
    )
  } catch {
    // This module promises never to throw, and that has to hold here too.
    return null
  }
}

/**
 * Parse a backup file. Returns `{ok, calcs}` or `{ok: false, error}`.
 *
 * A single-calculation file gets its own message rather than the generic
 * refusal. It is the near miss somebody will actually hit, and "that is not a
 * backup" leaves them with no idea that the control they wanted is sitting one
 * link away on the same row.
 *
 * An empty backup is refused. Restoring one would be a way to delete every
 * calculation on the device by answering a confirm dialog about a file that
 * turned out to hold nothing.
 */
export function importBackupJSON(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not a backup of your saved calculations.' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'That file is not a backup of your saved calculations.' }
  }
  if (parsed.kind !== BACKUP_KIND) {
    return {
      ok: false,
      error: looksLikeCalculation(parsed)
        ? 'That file holds one calculation, not a backup. Use "Upload a calculation" to add it alongside what you already have.'
        : 'That file is not a backup of your saved calculations.',
    }
  }
  if (!Array.isArray(parsed.calculations)) {
    return { ok: false, error: 'That backup file is damaged and cannot be read.' }
  }

  // Same rule as listCalcs(): one unreadable record is skipped, never fatal to
  // the rest of the file.
  const calcs = []
  for (const record of parsed.calculations) {
    try {
      if (record && typeof record === 'object' && record.id) calcs.push(migrate(record))
    } catch {
      /* skip this one, keep the rest */
    }
  }

  if (!calcs.length) {
    return { ok: false, error: 'That backup file has no calculations in it.' }
  }
  return { ok: true, calcs }
}

/**
 * Replace the whole saved list. The one destructive write in this module.
 *
 * `lastKnownUpdatedAt` is cleared because every entry in it now describes a
 * record this tab has not read. Left standing, a restored record older than the
 * timestamp remembered for its id reads as "nobody has touched this since I
 * last looked", and the next save overwrites it without asking.
 *
 * The working calculation is in another key and is not touched. It is not part
 * of the saved list, so a restore has no business replacing what somebody has
 * on screen.
 */
export function replaceAll(calcs) {
  const result = writeKey(KEY, () => JSON.stringify(calcs))
  if (result.ok) lastKnownUpdatedAt.clear()
  return result
}

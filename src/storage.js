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
 * The working calculation lives in its OWN key, separate from the saved list.
 * Autosave writes it on every keystroke; the saved list is written only when
 * someone presses Save. Sharing a key would let a failing autosave take the
 * saved calculations with it.
 */

import { SCHEMA_VERSION } from './calc.js'

const KEY = 'sdshc-gc-calcs'
const KEY_WORKING = 'sdshc-gc-working'
const KEY_LAST = 'sdshc-gc-last-open'

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

function writeKey(key, value) {
  try {
    localStorage.setItem(key, value)
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
 */
function migrate(rec) {
  const version = Number(rec?.schemaVersion) || 0

  if (version < 1) {
    rec.schemaVersion = 1
    rec.goals ??= []
    rec.samples ??= []
    rec.sample ??= {}
    rec.dm ??= {}
    rec.usable ??= {}
    rec.demand ??= {}
    rec.pasture ??= {}
    // Without this the list sorts on the string "undefined", which compares
    // above any ISO date, and an ancient record shows up as the newest.
    rec.createdAt ??= new Date(0).toISOString()
    rec.updatedAt ??= rec.createdAt
  }

  return rec
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
 * because there is only ever one working calculation on a device.
 */
export function saveWorking(calc) {
  let text
  try {
    text = JSON.stringify(calc)
  } catch {
    return { ok: false, error: 'NotSerializable' }
  }
  return writeKey(KEY_WORKING, text)
}

export function loadWorking() {
  const raw = readKey(KEY_WORKING)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return migrate(parsed)
  } catch {
    // A working copy that will not parse is one calculation, and the user is
    // about to start a new one anyway. Saved calculations are in another key
    // and are untouched.
    return null
  }
}

export function clearWorking() {
  removeKey(KEY_WORKING)
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
    // The copy in memory has no idea where this was dragged to or what colour
    // it was given; the stored record does. Both are owned by the Saved tab, in
    // both directions, so the stored value always wins, including when it is
    // absent.
    //
    // Without the tag half: colour a calculation from the Saved tab while it is
    // still the open working copy, edit something, save again, and the colour
    // is gone with nothing on screen to say so. The working copy was read
    // before the colour was applied and still carries no tag.
    if (existing.sortIndex != null) record.sortIndex = existing.sortIndex
    if (existing.tag != null) record.tag = existing.tag
    else delete record.tag
    all[index] = record
  } else {
    // A new calculation belongs at the top, where the newest-first fallback
    // would have put it. Only meaningful once something has been reordered.
    const indices = all.map((c) => Number(c.sortIndex)).filter(Number.isFinite)
    if (indices.length) record.sortIndex = Math.min(...indices) - 1
    all.push(record)
  }

  const result = writeKey(KEY, JSON.stringify(all))
  if (result.ok) {
    lastKnownUpdatedAt.set(record.id, record.updatedAt)
    setLastOpened(record.id)
  }
  return result
}

export function renameCalc(id, name) {
  const all = listCalcs()
  const found = all.find((c) => c.id === id)
  if (!found) return { ok: false, error: 'NotFound' }
  found.name = String(name)
  found.updatedAt = new Date().toISOString()
  const result = writeKey(KEY, JSON.stringify(all))
  if (result.ok) lastKnownUpdatedAt.set(id, found.updatedAt)
  return result
}

/**
 * Set the colour label on a saved calculation.
 *
 * Deliberately does NOT bump `updatedAt`: tagging is filing, not editing, and
 * a reordered list jumping because someone coloured a card is surprising.
 */
export function tagCalc(id, tag) {
  const all = listCalcs()
  const found = all.find((c) => c.id === id)
  if (!found) return { ok: false, error: 'NotFound' }
  if (tag) found.tag = String(tag)
  else delete found.tag
  return writeKey(KEY, JSON.stringify(all))
}

export function deleteCalc(id) {
  const remaining = listCalcs().filter((c) => c.id !== id)
  const result = writeKey(KEY, JSON.stringify(remaining))
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
  return writeKey(KEY, JSON.stringify(arranged))
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
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.samples)) {
    return { ok: false, error: 'That file is not a saved calculation.' }
  }
  delete parsed.tag
  delete parsed.sortIndex
  return { ok: true, calc: migrate(parsed) }
}

/**
 * Record ids.
 *
 * A leaf module with no imports, which is the whole reason it exists. The
 * factory for each calculator needs to mint an id, and those factories live in
 * separate modules that state.js pulls together — putting makeId() in any one of
 * them makes the other one import it and closes a cycle.
 *
 * state.js re-exports it, so every existing caller imports it from where it
 * always did.
 */

let idCounter = 0

export function makeId(prefix) {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

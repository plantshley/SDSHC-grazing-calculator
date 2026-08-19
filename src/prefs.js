/**
 * Device preferences: theme, font, and where the user is in the wizard.
 *
 * These live apart from the calculation on purpose. Which step is open and
 * whether stage photos are showing are facts about this browser, not about the
 * pasture, so they must not travel in an exported file or mark a calculation
 * as changed.
 *
 * Every read falls back to a default and every write is allowed to fail.
 * localStorage throws in Safari private mode, and losing a theme preference is
 * not a reason to take the page down.
 */

import { CALC_TYPE_IDS, DEFAULT_CALC_TYPE } from './schema.js'

const KEY = 'sdshc-gc-prefs'

/**
 * Where one calculator's wizard has got to.
 *
 * Per calculator, not global: a PLACE IN A WORKSHEET belongs to that worksheet,
 * so switching tabs must not move the other one. A WAY OF WORKING does not —
 * `showAll`, the theme and the font are the same choice whichever worksheet is
 * on screen, and they stay at the top level.
 */
const WIZARD_DEFAULT = { step: 0, maxStep: 0, openSteps: [] }

const wizardDefaults = () =>
  Object.fromEntries(CALC_TYPE_IDS.map((id) => [id, { ...WIZARD_DEFAULT }]))

const DEFAULTS = {
  theme: null, // null means "follow the system"
  font: 'browser',
  tab: 'perennial',
  showAll: false,
  // Off. There is one photographed species and it stands in for four rows of
  // the chart, so the photos are an aid someone asks for rather than the first
  // thing the stage picker puts in front of them.
  showStagePhotos: false,
  checkedNeeds: [],
  wizard: {},
}

/**
 * v1 stored `step`, `maxStep` and `openSteps` flat, and they described the only
 * calculator there was. They belong to perennial.
 *
 * Kept rather than dropped as dead code: somebody who has not opened the app
 * since the second calculator landed still has the flat keys, and losing them
 * puts them back on step 1 of a worksheet they were halfway through.
 */
function migratePrefs(stored) {
  const flat = ['step', 'maxStep', 'openSteps']
  if (!flat.some((k) => stored[k] !== undefined)) return false

  stored.wizard = {
    ...stored.wizard,
    [DEFAULT_CALC_TYPE]: {
      step: stored.step ?? 0,
      maxStep: stored.maxStep ?? 0,
      openSteps: Array.isArray(stored.openSteps) ? stored.openSteps : [],
      // A block already written by this build wins over the v1 keys.
      ...(stored.wizard?.[DEFAULT_CALC_TYPE] ?? {}),
    },
  }
  for (const k of flat) delete stored[k]
  return true
}

let cache = null

function read() {
  if (cache) return cache
  let stored = {}
  try {
    stored = JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    stored = {}
  }
  if (!stored || typeof stored !== 'object') stored = {}

  const migrated = migratePrefs(stored)

  // `wizard` is the one key the shallow spread is not good enough for: a stored
  // block holding only perennial would otherwise leave every other calculator
  // undefined, and getWizard() would hand back nothing.
  cache = {
    ...DEFAULTS,
    ...stored,
    wizard: { ...wizardDefaults(), ...(stored.wizard ?? {}) },
  }
  // Normalise on disk too, so a session that changes nothing still drops the
  // v1 keys rather than migrating them again on every load.
  if (migrated) write()
  return cache
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* a lost preference is not worth an error */
  }
}

export function getPref(key) {
  return read()[key]
}

export function setPref(key, value) {
  read()
  cache[key] = value
  write()
}

/* ─────────────────────────── theme and font ────────────────────────────── */

/**
 * The two icons, inline rather than from a sprite or a font.
 *
 * The icon shows what tapping will GIVE you, which is how farm-budget and the
 * tracker both read: a sun while dark, a moon while light. Ported verbatim so
 * the three tools' chrome stays identical.
 */
const SUN = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="5" />
  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
</svg>`

const MOON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
</svg>`

/**
 * Apply the stored theme, or the system setting when nothing is stored.
 *
 * `data-theme` is on <html> and is set in index.html to "light" so the first
 * paint has a definite value rather than flashing.
 */
/**
 * What the phone paints its browser bar with, per theme.
 *
 * Kept in step with <meta name="theme-color"> in index.html (the light value)
 * and with `theme_color` in vite.config.js's manifest. All three have to agree:
 * the meta is what a browser tab reads, the manifest is what an installed copy
 * reads, and this is what keeps either of them tracking the in-app toggle.
 *
 * A `media="(prefers-color-scheme: dark)"` meta would NOT do this job. The theme
 * here is a stored choice that can disagree with the system setting, so a
 * producer on a dark phone who picked light would get a dark bar over a light
 * page.
 */
const BAR_COLOR = { light: '#afbf42', dark: 'rgb(72, 104, 51)' }

/** Same rule as FONTS below, and for the same reason: anything else is ignored. */
const THEMES = new Set(['light', 'dark'])

export function applyTheme() {
  const stored = getPref('theme')
  const prefersDark =
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  const theme = THEMES.has(stored) ? stored : prefersDark ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme)

  const bar = document.querySelector('meta[name="theme-color"]')
  if (bar) bar.setAttribute('content', BAR_COLOR[theme] ?? BAR_COLOR.light)

  const toggle = document.querySelector('#themeToggle')
  if (toggle) {
    const dark = theme === 'dark'
    toggle.innerHTML = `<span class="theme-toggle-icon">${dark ? SUN : MOON}</span>`
    toggle.setAttribute('aria-pressed', String(dark))
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode')
    toggle.title = dark ? 'Light mode' : 'Dark mode'
  }
  return theme
}

export function toggleTheme() {
  const now = document.documentElement.getAttribute('data-theme')
  setPref('theme', now === 'dark' ? 'light' : 'dark')
  return applyTheme()
}

/**
 * The three faces the topbar offers. Anything else stored — a value from an
 * older build, or a hand-edited key — falls back to `browser`, so the page can
 * never end up with no --font at all.
 */
const FONTS = new Set(['browser', 'classic', 'mono'])

export function applyFont() {
  const font = FONTS.has(getPref('font')) ? getPref('font') : 'browser'
  document.documentElement.setAttribute('data-font', font)
  for (const btn of document.querySelectorAll('[data-font-choice]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.fontChoice === font))
  }
  return font
}

export function setFont(choice) {
  setPref('font', FONTS.has(choice) ? choice : 'browser')
  return applyFont()
}

/* ─────────────────────── where each wizard has got to ──────────────────── */

/** Never undefined, whatever is stored — a caller reads `.step` off this. */
export function getWizard(type) {
  return { ...WIZARD_DEFAULT, ...(read().wizard?.[type] ?? {}) }
}

export function setWizard(type, patch) {
  read()
  cache.wizard = { ...cache.wizard, [type]: { ...getWizard(type), ...patch } }
  write()
}

/* ──────────────────────── collapsible panel state ──────────────────────── */

/**
 * Which step sections are expanded under "Show all steps".
 *
 * Stored rather than derived so a producer who opens step 2 to check a figure
 * still finds it open after typing into step 4, which re-renders the page.
 */
export function isStepOpen(type, index) {
  return getWizard(type).openSteps.includes(index)
}

export function setStepOpen(type, index, open) {
  const list = new Set(getWizard(type).openSteps)
  if (open) list.add(index)
  else list.delete(index)
  setWizard(type, { openSteps: [...list] })
}

export function setOpenSteps(type, indexes) {
  setWizard(type, { openSteps: [...indexes] })
}

/* ───────────────────── the "what you will need" ticks ──────────────────── */

/**
 * A device fact, not a fact about the pasture. Ticking "gram scale" says
 * nothing about the forage, so it must not enter the calculation, an export, or
 * a saved record.
 */
export function isNeedChecked(id) {
  return (getPref('checkedNeeds') ?? []).includes(id)
}

export function setNeedChecked(id, checked) {
  const list = new Set(getPref('checkedNeeds') ?? [])
  if (checked) list.add(id)
  else list.delete(id)
  setPref('checkedNeeds', [...list])
}

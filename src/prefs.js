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

const KEY = 'sdshc-gc-prefs'

const DEFAULTS = {
  theme: null, // null means "follow the system"
  font: 'browser',
  tab: 'perennial',
  step: 0,
  maxStep: 0,
  showAll: false,
  // Off. There is one photographed species and it stands in for four rows of
  // the chart, so the photos are an aid someone asks for rather than the first
  // thing the stage picker puts in front of them.
  showStagePhotos: false,
  openSteps: [],
  checkedNeeds: [],
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
  cache = { ...DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {}) }
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

/* ──────────────────────── collapsible panel state ──────────────────────── */

/**
 * Which step sections are expanded under "Show all steps".
 *
 * Stored rather than derived so a producer who opens step 2 to check a figure
 * still finds it open after typing into step 4, which re-renders the page.
 */
export function isStepOpen(index) {
  return (getPref('openSteps') ?? []).includes(index)
}

export function setStepOpen(index, open) {
  const list = new Set(getPref('openSteps') ?? [])
  if (open) list.add(index)
  else list.delete(index)
  setPref('openSteps', [...list])
}

export function setOpenSteps(indexes) {
  setPref('openSteps', [...indexes])
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

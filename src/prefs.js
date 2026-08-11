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
  showStagePhotos: false,
  openPanels: [],
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
 * Apply the stored theme, or the system setting when nothing is stored.
 *
 * `data-theme` is on <html> and is set in index.html to "light" so the first
 * paint has a definite value rather than flashing.
 */
export function applyTheme() {
  const stored = getPref('theme')
  const prefersDark =
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  const theme = stored ?? (prefersDark ? 'dark' : 'light')
  document.documentElement.setAttribute('data-theme', theme)

  const toggle = document.querySelector('#themeToggle')
  if (toggle) {
    const dark = theme === 'dark'
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

export function applyFont() {
  const font = getPref('font') === 'classic' ? 'classic' : 'browser'
  document.documentElement.setAttribute('data-font', font)
  for (const btn of document.querySelectorAll('[data-font-choice]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.fontChoice === font))
  }
  return font
}

export function setFont(choice) {
  setPref('font', choice === 'classic' ? 'classic' : 'browser')
  return applyFont()
}

/* ──────────────────────── collapsible panel state ──────────────────────── */

export function isPanelOpen(id) {
  return (getPref('openPanels') ?? []).includes(id)
}

export function setPanelOpen(id, open) {
  const list = new Set(getPref('openPanels') ?? [])
  if (open) list.add(id)
  else list.delete(id)
  setPref('openPanels', [...list])
}

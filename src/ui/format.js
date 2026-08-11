/**
 * Display formatting.
 *
 * The farm budget formats money. This tool formats forage, land and stock, so
 * the unit set is different but the rule is the same: the model works in raw
 * numbers and nothing reaches the screen without passing through here.
 *
 * Precision is chosen per unit rather than globally. Pounds per acre are whole
 * numbers because a sample-based estimate is not accurate to the pound.
 * Acres and days carry one decimal, because the difference between 2.9 and 3.0
 * acres a day is a real difference to a producer laying out a paddock.
 */

const nf = (min, max) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max })

const whole = nf(0, 0)
const oneDp = nf(0, 1)
const twoDp = nf(0, 2)

const finite = (n) => (Number.isFinite(n) ? n : 0)

/** Whole numbers, thousands separated. Pounds, square feet, total forage. */
export function number(n) {
  return whole.format(finite(n))
}

/** One decimal. Acres, days, animal weight per day. */
export function decimal(n) {
  return oneDp.format(finite(n))
}

/** Two decimals. Small acreages, where one decimal rounds a paddock away. */
export function precise(n) {
  return twoDp.format(finite(n))
}

export const lbs = (n) => `${number(n)} lbs`
export const lbsPerAcre = (n) => `${number(n)} lbs/ac`
export const lbsPerDay = (n) => `${decimal(n)} lbs/day`
export const grams = (n) => `${decimal(n)} g`
export const sqft = (n) => `${number(n)} sq ft`
export const feet = (n) => `${number(n)} ft`
export const days = (n) => `${decimal(n)} ${decimal(n) === '1' ? 'day' : 'days'}`

/** Acres switch precision at 10, where the second decimal stops being useful. */
export function acres(n) {
  const v = finite(n)
  return `${Math.abs(v) < 10 ? precise(v) : decimal(v)} ac`
}

/**
 * Head count, rounded DOWN.
 *
 * This is the one figure where rounding to nearest is wrong. "84.9 animals
 * allowed" shown as 85 is a stocking rate the pasture cannot carry for the
 * number of days asked for. The fraction of an animal that does not fit is
 * always overstocking, so it is always dropped.
 */
export function head(n) {
  const v = Math.floor(finite(n))
  return `${whole.format(v)} ${v === 1 ? 'head' : 'head'}`
}

/** A percentage stored as a fraction (0.45) or as a percent (45). See toPct. */
export function pct(n) {
  return `${decimal(finite(n))}%`
}

/** Escape text before it goes into innerHTML. */
export function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

/**
 * The formatters reachable by name from a `[data-out]` placeholder.
 *
 * updateOutputs() reads `data-fmt` off the element and looks it up here, which
 * is what lets a step's markup declare its own formatting and never be
 * re-rendered just to refresh a number.
 */
export const FORMATTERS = {
  number,
  decimal,
  precise,
  lbs,
  lbsPerAcre,
  lbsPerDay,
  grams,
  sqft,
  feet,
  days,
  acres,
  head,
  pct,
}

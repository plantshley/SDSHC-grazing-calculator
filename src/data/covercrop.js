/**
 * The Grazing Cover Crops worksheet's two lookup tables.
 *
 * The ONLY copy of either. Same rule as Exhibit 4-2 in forage.js: a figure from
 * one of these must never be written into markup or into a stored record. It is
 * looked up at compute time by resolvedCoverCrop() in state-covercrop.js, so a
 * correction here reaches every record ever saved rather than only new ones.
 *
 * Source: SDSHC "Grazing Cover Crops" worksheet,
 * https://www.sdsoilhealthcoalition.org/wp-content/uploads/2021/03/Grazing-cover-crops-worksheet.pdf
 *
 * No imports, deliberately, so calc-covercrop.js can stay a pure model that is
 * handed plain numbers.
 */

/**
 * Cool-season's "first 4 inches" figure.
 *
 * ─── READ THIS BEFORE CHANGING IT ────────────────────────────────────────────
 * Older printed copies of the worksheet give this as 140 lbs/ac. That was a
 * typo, since corrected by SDSHC, and the evidence is kept here so nobody
 * "fixes" this line back from an out-of-date copy:
 *
 *     140 + 250 × (18 − 4) = 3,640,   but the sheet's example writes 4,640
 *     140 + 250 × ( 4 − 4) =   140,   but its residual line writes 1,140
 *     and 4,640 − 1,140 = 3,500, which is the available forage it goes on to use
 *
 * Both printed constants were exactly 1,000 low while the subtraction between
 * them stayed consistent, which is a dropped leading "1,". 140 is also
 * implausible against warm-season's 1,275 for the same four inches.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const COOL_SEASON_BASE = 1140

/**
 * Air-dry production from average height, per dominant season.
 *
 * `base` is what the first `anchor` inches are worth and `perInch` is every inch
 * above that. The mix estimate is a flat rate over the WHOLE height with no base
 * at all — it is a different shape of formula, not the same one with different
 * numbers, which is why `anchor` is 0 there rather than 4.
 */
export const SEASONS = [
  {
    id: 'warm',
    label: 'Warm-season dominant',
    sub: 'Sorghum-sudan, pearl millet, sunn hemp, cowpeas',
    base: 1275,
    anchor: 4,
    perInch: 200,
    photos: [
      {
        src: 'covercrop-images/warm-sorghum.webp',
        alt: 'A tall sorghum-sudan stand seen from the side, wide leaves standing well above the bare residue at its base',
      },
    ],
  },
  {
    id: 'cool',
    label: 'Cool-season dominant',
    sub: 'Cereal rye, oats, barley, peas, clover, turnips, radish',
    base: COOL_SEASON_BASE,
    anchor: 4,
    perInch: 250,
    photos: [
      {
        src: 'covercrop-images/cool-rye-clover.webp',
        alt: 'Cereal rye standing above a dense mat of crimson clover in red bloom, wet with dew',
      },
    ],
  },
  {
    id: 'mix',
    label: 'Mix of warm and cool',
    sub: 'Roughly even, or you are not sure which dominates',
    base: 0,
    anchor: 0,
    perInch: 215,
    photos: [
      {
        src: 'covercrop-images/mix-multispecies.webp',
        alt: 'A cover crop mix in flower to the horizon: field peas in white bloom among purple phacelia, buckwheat, and brassicas',
      },
    ],
  },
]

export function seasonById(id) {
  return SEASONS.find((s) => s.id === id) ?? null
}

/**
 * Utilization from how long the animals are on the piece.
 *
 * Shorter occupation wastes less, so the percentage is higher. Fencing off a
 * smaller area is how the occupation period gets shortened, which is the whole
 * reason the paddock figures on the last step are worth having.
 *
 * 3 days really is 75%, the same as 2 days. That is what the worksheet prints
 * and what the JotForm repeats, so it is the table and not a transcription slip.
 */
export const UTILIZATION_PERIODS = [
  { key: 'half', label: '1/2 to 1 day', pct: 80 },
  { key: 'two', label: '2 days', pct: 75 },
  { key: 'three', label: '3 days', pct: 75 },
  { key: 'four', label: '4 days', pct: 70 },
  { key: 'five', label: '5 days', pct: 65 },
  { key: 'long', label: '6 to 30 days', pct: 60 },
]

/** The percentage for an occupation period, or null. Never a silent fallback. */
export function utilizationForPeriod(key) {
  return UTILIZATION_PERIODS.find((p) => p.key === key)?.pct ?? null
}

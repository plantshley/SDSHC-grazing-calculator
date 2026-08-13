/**
 * Exports: CSV, print, and a PNG share image.
 *
 * No dependencies. CSV rather than xlsx because SheetJS is about 400KB and
 * Excel opens a BOM-prefixed CSV correctly. PNG drawn on a canvas rather than
 * html2canvas because the results have a known shape, the drawn version is
 * cleaner than a screenshot, and neither has to be precached for offline use.
 *
 * The CSV escaper is carried over from SDSHC-farm-budget unchanged, formula
 * neutralisation included. A pasture called "=cmd" is unlikely, but a leading
 * minus on a figure is not, and Excel executes both.
 */

import { FORMATTERS } from './ui/format.js'
import { GOALS } from './calc.js'
import { exportCalcJSON, exportBackupJSON } from './storage.js'
import { forageById, MIXED, stagesFor } from './data/forage.js'

/* ────────────────────────────── plumbing ───────────────────────────────── */

function csvCell(value) {
  const isText = typeof value !== 'number'
  let s = String(value ?? '')
  // Excel and Sheets execute a cell beginning with any of these.
  if (isText && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const csvRows = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n')

function safeFilename(name, ext) {
  const base =
    String(name || 'grazing-calculation')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'grazing-calculation'
  return `${base}.${ext}`
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ──────────────────────────────── CSV ──────────────────────────────────── */

/** Everything entered and everything computed, in worksheet order. */
export function toCSV(calc, res) {
  const rows = [
    ['SDSHC Grazing Calculator'],
    ['Calculation', calc.name || ''],
    ['Pasture', calc.pastureName || ''],
    ['Date', new Date().toLocaleDateString()],
    ['Working out', calc.goals.map((g) => GOALS.find((x) => x.key === g)?.short ?? g).join(', ')],
    ['Forage type', forageLabel(calc)],
    [],

    ['Step 1: clip and weigh'],
    ['Sample', 'Weight (g)'],
    ...calc.samples
      .map((s, i) => [i + 1, s === '' || s == null ? '' : Number(s)])
      .filter((r) => r[1] !== ''),
    ['Samples used', res.sampleCount],
    ['Average weight (g)', round(res.avgGrams)],
    [],

    ['Step 2: forage available'],
    ['Frame', frameLabel(calc)],
    ['Grams to lbs/ac multiplier', round(res.frameMultiplier)],
    ['Total production (lbs/ac)', round(res.totalProduction)],
    ['Dry matter source', dryMatterLabel(calc)],
    ['Dry matter (%)', round(res.dryMatterPct)],
    ['Available forage (lbs/ac)', round(res.availableForage)],
    [],

    ['Step 3: usable forage'],
    ['Forage left behind (lbs/ac)', round(res.amountLeaving)],
    ['Harvest (%)', round(res.harvestPctEquivalent)],
    ['Usable forage (lbs/ac)', round(res.usableForage)],
    [],

    ['Step 4: daily demand'],
    ['Animal weight (lbs)', round(Number(calc.demand?.animalWeight) || 0)],
    ['Percent of body weight', round(Number(calc.demand?.bodyWeightPct) || 0)],
    ['Demand per animal (lbs/day)', round(res.perAnimalDemand)],
    ['Number of animals', res.numAnimals || ''],
    ['Demand for the herd (lbs/day)', round(res.herdDemand)],
    [],

    ['Step 5: results'],
  ]

  if (res.totalAcres) {
    rows.push(
      ['Total acres', round(res.totalAcres)],
      ['Ungrazeable acres', round(res.ungrazeableAcres)],
      ['Grazeable acres', round(res.acresAvailable)],
      ['Total usable forage (lbs)', round(res.totalUsableForage)]
    )
  }
  if (res.desiredDays) rows.push(['Planned grazing days', round(res.desiredDays)])

  if (calc.goals.includes('days')) {
    rows.push([], ['GRAZING DAYS', round(res.grazingDays)], ['Animal-days', round(res.animalDays)])
  }
  if (calc.goals.includes('acres')) {
    rows.push(
      [],
      ['ACRES NEEDED PER DAY', round(res.acresPerDay)],
      ['Square feet per day', round(res.sqFtPerDay)],
      ['Paddock (ft x ft)', `${round(res.paddockWidth)} x ${round(res.paddockLength)}`],
      ['Acres for planned days', round(res.acresForDesiredDays)]
    )
  }
  if (calc.goals.includes('animals')) {
    rows.push([], ['ANIMALS ALLOWED', Math.floor(res.animalsAllowed)])
  }

  if (res.warnings?.length) {
    rows.push([], ['Check these'], ...res.warnings.map((w) => [w]))
  }

  rows.push(
    [],
    ['Based on the SDSHC Graziers Math Worksheet.'],
    ['Dry matter from NRPH Exhibit 4-2, NRCS, September 1997.']
  )

  return csvRows(rows)
}

export function downloadCSV(calc, res) {
  // The BOM makes Excel open UTF-8 correctly on Windows.
  const blob = new Blob(['﻿' + toCSV(calc, res)], { type: 'text/csv;charset=utf-8' })
  download(safeFilename(calc.name, 'csv'), blob)
}

export function printResults() {
  window.print()
}

/* ─────────────────────────────── JSON files ────────────────────────────── */

/**
 * One calculation as a file, to carry to another device or hand to somebody
 * else who uses this calculator. It comes back in through "Upload a
 * calculation" on the Saved tab.
 */
export function downloadCalcJSON(calc) {
  const text = exportCalcJSON(calc)
  if (!text) {
    alert('That calculation could not be written to a file.')
    return
  }
  download(safeFilename(calc.name, 'json'), new Blob([text], { type: 'application/json' }))
}

/**
 * The whole saved list as one file.
 *
 * Dated rather than named, so backups taken on different days sit beside each
 * other in the downloads folder instead of overwriting one another.
 */
export function downloadBackup() {
  const text = exportBackupJSON()
  if (!text) {
    alert('The backup could not be written.')
    return
  }
  const day = new Date().toISOString().slice(0, 10)
  download(
    `sdshc-grazing-calculations-${day}.json`,
    new Blob([text], { type: 'application/json' })
  )
}

/* ────────────────────────────── PNG image ──────────────────────────────── */

const W = 1080
const PAD = 56

/**
 * A share image of the results.
 *
 * Drawn rather than screenshotted, so it carries only what matters: the
 * headline answers, the figures they were built from, and enough provenance
 * that the image still means something a season later.
 */
/** The KPI band: every answer in ONE row, equal width, equal height. */
const CARD_H = 132
const CARD_GAP = 20

export function downloadPNG(calc, res) {
  const lines = imageLines(calc, res)
  const height = PAD * 2 + 150 + (lines.headlines.length ? CARD_H + 26 : 0) + lines.rows.length * 42 + 70

  const canvas = document.createElement('canvas')
  const dpr = 2
  canvas.width = W * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')
  // Refused by the browser under some privacy settings, and on a device that
  // has run out of GPU memory. Saying so beats a button that does nothing.
  if (!ctx) {
    alert('This browser would not let the image be drawn. Try Print instead.')
    return
  }
  ctx.scale(dpr, dpr)

  // Always the light palette. The image leaves the app and lands in a text
  // message or a printout, where the reader's theme is not ours to guess.
  const ink = '#222222'
  const muted = '#5a625a'
  const brand = '#4e413a'
  const sky = '#0fb2e2'
  const green = '#2e7d32'

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, height)

  let y = PAD

  ctx.fillStyle = brand
  ctx.font = 'bold 34px system-ui, sans-serif'
  ctx.fillText('SDSHC Grazing Calculator', PAD, y + 30)
  y += 52

  ctx.fillStyle = muted
  ctx.font = '20px system-ui, sans-serif'
  fitText(ctx, lines.subtitle, PAD, y + 18, W - PAD * 2)
  y += 48

  ctx.strokeStyle = '#afbf42'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(W - PAD, y)
  ctx.stroke()
  y += 42

  // Side by side, equal shares of the same row, whichever answers were asked
  // for. Stacked full width, two answers read as a list of steps rather than as
  // two answers to compare, which is the whole reason both were selected.
  const n = lines.headlines.length
  if (n) {
    const cardW = (W - PAD * 2 - CARD_GAP * (n - 1)) / n
    // Three cards is a third of the width each, so the figure has to come down
    // with them or fitText spends its budget on an ellipsis.
    const valueSize = n === 1 ? 46 : n === 2 ? 38 : 32

    lines.headlines.forEach((h, i) => {
      const x = PAD + i * (cardW + CARD_GAP)
      ctx.fillStyle = '#e6f7fd'
      roundRect(ctx, x, y, cardW, CARD_H, 10)
      ctx.fill()
      ctx.fillStyle = sky
      ctx.fillRect(x, y, cardW, 4)

      ctx.fillStyle = muted
      ctx.font = '19px system-ui, sans-serif'
      fitText(ctx, h.label, x + 22, y + 40, cardW - 44)

      ctx.fillStyle = green
      ctx.font = `bold ${valueSize}px system-ui, sans-serif`
      fitText(ctx, h.value, x + 22, y + 92, cardW - 44)

      if (h.note) {
        ctx.fillStyle = muted
        ctx.font = '16px system-ui, sans-serif'
        fitText(ctx, h.note, x + 22, y + 116, cardW - 44)
      }
    })
    y += CARD_H + 26
  }
  ctx.font = '20px system-ui, sans-serif'
  for (const [label, value] of lines.rows) {
    // The value is drawn first and its width reserved, so a long label is the
    // one that gets shortened. The figure is the point of the image.
    ctx.fillStyle = ink
    ctx.textAlign = 'right'
    const valueWidth = ctx.measureText(value).width
    ctx.fillText(value, W - PAD, y + 20)
    ctx.textAlign = 'left'
    ctx.fillStyle = muted
    fitText(ctx, label, PAD, y + 20, W - PAD * 2 - valueWidth - 20)
    y += 42
  }

  y += 22
  ctx.fillStyle = muted
  ctx.font = '16px system-ui, sans-serif'
  ctx.fillText('Based on the SDSHC Graziers Math Worksheet. NRPH Exhibit 4-2, NRCS 1997.', PAD, y)

  canvas.toBlob((blob) => {
    if (blob) download(safeFilename(calc.name, 'png'), blob)
    else alert('The image could not be created. Try Print instead.')
  }, 'image/png')
}

/**
 * Draw text, shortened with an ellipsis if it will not fit.
 *
 * A pasture called "South of the creek, east half, rented from the Andersons"
 * would otherwise run off the fixed-width canvas and be cut mid-word with
 * nothing to show it had been. Canvas has no overflow.
 */
function fitText(ctx, text, x, y, maxWidth) {
  let s = String(text ?? '')
  if (ctx.measureText(s).width <= maxWidth) {
    ctx.fillText(s, x, y)
    return
  }
  while (s.length > 1 && ctx.measureText(`${s}...`).width > maxWidth) {
    s = s.slice(0, -1)
  }
  ctx.fillText(`${s}...`, x, y)
}

function imageLines(calc, res) {
  const headlines = []
  if (calc.goals.includes('days')) {
    headlines.push({ label: 'Grazing days', value: FORMATTERS.days(res.grazingDays) })
  }
  if (calc.goals.includes('acres')) {
    // The paddock is a NOTE under the figure rather than part of it. Inside the
    // value it doubled the string's length, and a card sharing a row with two
    // others has no width to spend on that.
    headlines.push({
      label: 'Acres needed per day',
      value: FORMATTERS.acres(res.acresPerDay),
      note: `${FORMATTERS.number(res.paddockWidth)} x ${FORMATTERS.number(res.paddockLength)} ft`,
    })
  }
  if (calc.goals.includes('animals')) {
    headlines.push({ label: 'Animals allowed', value: FORMATTERS.head(res.animalsAllowed) })
  }

  const rows = [
    ['Average sample weight', FORMATTERS.grams(res.avgGrams)],
    ['Total production', FORMATTERS.lbsPerAcre(res.totalProduction)],
    ['Dry matter', FORMATTERS.pct(res.dryMatterPct)],
    ['Available forage', FORMATTERS.lbsPerAcre(res.availableForage)],
    ['Left behind', FORMATTERS.lbsPerAcre(res.amountLeaving)],
    ['Usable forage', FORMATTERS.lbsPerAcre(res.usableForage)],
    ['Demand per animal', FORMATTERS.lbsPerDay(res.perAnimalDemand)],
  ]
  if (res.numAnimals) rows.push(['Herd demand', FORMATTERS.lbsPerDay(res.herdDemand)])
  if (res.acresAvailable) rows.push(['Grazeable acres', FORMATTERS.acres(res.acresAvailable)])

  const parts = [calc.pastureName, forageLabel(calc), new Date().toLocaleDateString()].filter(
    Boolean
  )

  return { headlines, rows, subtitle: parts.join('  ·  ') }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/* ────────────────────────────── labels ─────────────────────────────────── */

const round = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0)

function forageLabel(calc) {
  if (calc.forageType === MIXED.id) return MIXED.label
  return forageById(calc.forageType)?.label ?? ''
}

function frameLabel(calc) {
  const key = calc.frame?.key
  if (key === 'small') return 'Small hoop, 0.96 sq ft'
  if (key === 'large') return 'Large hoop, 1.92 sq ft'
  return `Custom, ${calc.frame?.customArea || '?'} sq ft`
}

function dryMatterLabel(calc) {
  const mode = calc.dm?.mode
  if (mode === 'own') return 'Air-dried own sample'
  if (mode === 'mix') return 'Weighted mix of types'
  const typeId = calc.forageType === MIXED.id ? calc.dm?.stageTypeId : calc.forageType
  const stage = stagesFor(typeId).find((s) => s.key === calc.dm?.stageKey)
  return stage ? `Chart: ${forageById(typeId)?.label}, ${stage.label}` : 'Chart'
}

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
 *
 * This module is the PLUMBING and nothing else. What a calculation actually says
 * is per worksheet, so it comes off the calculator's descriptor as data —
 * `csv(calc, res)` gives rows and `image(calc, res)` gives lines — and everything
 * here works the same whichever one it came from.
 */

import { exportCalcJSON, exportBackupJSON } from './storage.js'
import { calculatorFor } from './calculators.js'

/* ────────────────────────────── plumbing ───────────────────────────────── */

function csvCell(value) {
  const isText = typeof value !== 'number'
  let s = String(value ?? '')
  // Excel and Sheets execute a cell beginning with any of these.
  if (isText && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const csvRows = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n')

/**
 * The calculation's name, or its worksheet's own stem if it has none.
 *
 * The fallback is per worksheet rather than one shared word, so an unnamed file
 * in a downloads folder still says which of the two it came off.
 */
function safeFilename(calc, ext) {
  const stem = calculatorFor(calc).fileStem
  const base =
    String(calc?.name || stem)
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || stem
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

/**
 * Everything entered and everything computed, in worksheet order.
 *
 * The rows come off the calculation's own descriptor. A record with no
 * `calcType` — one written before there was a second worksheet — resolves to the
 * perennial descriptor, which is what keeps every stored record and every
 * existing test reading correctly.
 */
export function toCSV(calc, res) {
  return csvRows(calculatorFor(calc).csv(calc, res))
}

export function downloadCSV(calc, res) {
  // The BOM makes Excel open UTF-8 correctly on Windows.
  const blob = new Blob(['﻿' + toCSV(calc, res)], { type: 'text/csv;charset=utf-8' })
  download(safeFilename(calc, 'csv'), blob)
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
  download(safeFilename(calc, 'json'), new Blob([text], { type: 'application/json' }))
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
  const lines = calculatorFor(calc).image(calc, res)
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
  // Which worksheet this came out of, in the image's own words. A picture
  // landing in a text message has to say what it is a picture OF.
  ctx.fillText(lines.footnote, PAD, y)

  canvas.toBlob((blob) => {
    if (blob) download(safeFilename(calc, 'png'), blob)
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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

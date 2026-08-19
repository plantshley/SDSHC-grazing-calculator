# SDSHC Grazing Calculator

Two South Dakota Soil Health Coalition worksheets, as calculators you can use in
the pasture: the *Graziers Math Worksheet* and *Grazing Cover Crops*.

Both work out any combination of:

- **How many grazing days?** How long the piece will feed your herd.
- **How many acres do I need?** Paddock size for a day, or for a rotation.
- **How many animals can I run?** Herd size for the days you plan to graze.

They show every sub-result along the way, so you can see where a number came from
and catch a bad entry before it reaches the answer. Each keeps its own work, so
you can leave one part way through and come back to it, and both save into one
list.

## How it works

Five steps each, numbered to match the paper worksheets so you can follow along
with a printed copy.

**Perennial grazing** — native range and tame pasture, from clipped samples:

1. **Clip and weigh.** Sample weights in grams, averaged.
2. **Forage available.** Scaled from your hoop to an acre, then dried down using
   either your own air-dried sample or the NRPH growth stage chart.
3. **Usable forage.** Minus what you plan to leave behind for the soil.
4. **Daily demand.** Animal weight times percent of body weight, times head.
5. **Results.** Your answers, with the arithmetic written out in words.

**Cover crops** — annuals, from the average height of the stand. No scale needed:

1. **Measure height.** Average stand height in inches, against the dominant
   season's production rate.
2. **Residual.** The same estimate at the height you plan to leave, subtracted.
3. **Usable forage.** Utilization, set by how long the animals are on the
   piece. The longer they stay, the more is trampled and fouled.
4. **Daily demand.** Animal weight times percent of body weight, times head.
5. **Results.** Your answers, with the arithmetic written out in words.

The dry matter chart is NRPH Exhibit 4-2. Definitions come from the National
Range and Pasture Handbook glossary, NRCS, September 1997. The cover crop
production and utilization tables come from the SDSHC
[Grazing Cover Crops worksheet](https://www.sdsoilhealthcoalition.org/wp-content/uploads/2021/03/Grazing-cover-crops-worksheet.pdf).

## Using it

Runs in any modern browser and installs to a phone home screen as an app. Once
loaded the whole thing works with no signal, which is the point: the measuring
happens in the field.

- Your entries save on the device as you type, for both calculators.
- **Save calculation** keeps a named copy, one per pasture per season. Saved
  cards say which worksheet they came off, and the list can be shown one kind at
  a time.
- **Clear**, on a step, empties that step. **New calculation** starts the
  worksheet you are in over again. Neither touches saved copies or the other
  worksheet.
- Print, export to CSV, or save the results as an image. **Export backup** writes
  everything saved on the device to one file.

Nothing is uploaded anywhere. Everything stays in the browser, which also means
clearing your browser data removes it.

## Development

```
npm install
npm run dev       # http://localhost:5174
npm test          # Node >= 21
npm run build
npm run preview   # serve the build, to check the service worker
```

Vanilla ES modules, Vite, and vite-plugin-pwa. No runtime dependencies. The
design system in `src/styles.css` is shared with
[SDSHC-farm-budget](https://github.com/SDSoilHealthCoalition/SDSHC-farm-budget);
app-specific styles live in `src/app.css`.

See [CLAUDE.md](CLAUDE.md) for the contracts worth knowing before changing the
model, the storage layer, or the design tokens, and
[DESIGN-NOTES.md](DESIGN-NOTES.md) for the reasoning behind each one.



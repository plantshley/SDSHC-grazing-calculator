# SDSHC Grazing Calculator

The South Dakota Soil Health Coalition's *Graziers Math Worksheet*, as a
calculator you can use in the pasture.

Clip and weigh a few forage samples, and it works out any combination of:

- **How many grazing days?** How long a pasture will feed your herd.
- **How many acres do I need?** Paddock size for a day, or for a rotation.
- **How many animals can I run?** Herd size for the days you plan to graze.

It shows every sub-result along the way, so you can see where a number came from
and catch a bad entry before it reaches the answer.

## How it works

Five steps, numbered to match the paper worksheet so you can follow along with a
printed copy.

1. **Clip and weigh.** Sample weights in grams, averaged.
2. **Forage available.** Scaled from your hoop to an acre, then dried down using
   either your own air-dried sample or the NRPH growth stage chart.
3. **Usable forage.** Minus what you plan to leave behind for the soil.
4. **Daily demand.** Animal weight times percent of body weight, times head.
5. **Results.** Your answers, with the arithmetic written out in words.

The dry matter chart is NRPH Exhibit 4-2. Definitions come from the National
Range and Pasture Handbook glossary, NRCS, September 1997.

## Using it

Runs in any modern browser and installs to a phone home screen as an app. Once
loaded it works with no signal, which is the point: the sampling happens in the
pasture.

- Your entries save on the device as you type.
- **Save calculation** keeps a named copy, one per pasture per season.
- **Clear all** resets the form you are working on and leaves saved copies alone.
- Print, export to CSV, or save the results as an image.

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

## Photography still wanted

The forage type picker and the growth stage picker have photo slots that
currently render labelled placeholders. Filling them is a data-file edit with no
code change. See the table in
[DESIGN-NOTES.md](DESIGN-NOTES.md#still-wanted) for exactly which images are
needed.

## Not yet built

The Grazing Cover Crops tab currently embeds the existing JotForm. A native
version sharing this calculator's engine is planned. That tab needs an internet
connection; the perennial calculator does not.

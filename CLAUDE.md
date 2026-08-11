# SDSHC Grazing Calculator

The SDSHC *Graziers Math Worksheet* as a calculator. Clipped forage samples in,
grazing days / acres needed / animals allowed out. Vanilla ES modules, Vite,
vite-plugin-pwa, zero runtime dependencies. Deployed to GitHub Pages.

```
npm run dev       vite, port 5174
npm test          node --test "test/**/*.test.js"   (Node >= 21, CI pins 22)
npm run build     -> dist/
npm run preview   serve the build, for checking the service worker
```

## Critical contracts

### `src/calc.js` is pure

No DOM, no imports, no side effects, no I/O. It is the only place the worksheet
math lives, and its purity is the only reason it can be tested against the paper
worksheet independently of the UI. **Do not add an import here**, however
convenient. The dry matter lookup lives in `state.js` for exactly this reason.

Every rule below is carried over from SDSHC-farm-budget, where each one came
from a bug that put a wrong figure in front of a producer.

- **Every arithmetic result passes through `num()`, `finite()` or `safeDiv()`.**
  Two finite inputs can multiply past `Number.MAX_VALUE`, and the `Infinity`
  spreads until it meets a `x 0` and renders as "NaN" on screen. An overflow
  collapses to 0.
- **`num()` rejects `Infinity` as well as `NaN`.** `Number(x) || 0` lets it
  through.
- **`safeDiv()` guards a divisor of exactly zero only.** Negative divisors pass
  straight through, which is why acreage clamps before it divides.
- **Every quantity goes through `nonNegative(value, label, warnings)`.** A
  finite number is not a correct one: a `-600` typed for forage left behind is
  subtracted from a subtraction, which ADDS to usable forage and overstocks the
  pasture.

The invariant the tests assert is *not* "an answer can never rise". Treating a
typo as 0 does remove a real constraint, so it can. It is that **a negative
figure is worth the same as zero and is never handed back as a bonus.**

### Blank is not zero, and an unanswered goal has no answer

`Number('') === 0`, which erases the difference between "you have not told me
the herd size yet" and "the herd size is zero". Left alone, leaving planned days
blank divides by zero, `safeDiv` returns 0, and the screen reads **"0 head
allowed"** — a wrong answer wearing the clothes of a right one.

So `compute()` returns `null`, not `0`, for any goal whose inputs are not all
answered, and reports which ones are outstanding in `missing`. `updateOutputs()`
renders `null` as a dash, and the result card says what is still needed. An
explicit `0` counts as answered: someone who types 0 meant 0.

`answered()` in `calc.js` is the only place that decides this. Adding a required
input means adding it to `GOAL_INPUTS` **and** to `answered()`, or the goal will
happily produce an answer without it.

### The worksheet's constants are not "corrected"

`43,560 / 453.592 / 0.96` is 100.03 and the worksheet prints **100**. The two
hoop presets use the worksheet's round numbers. Someone working a paper copy
alongside the screen must not find them disagreeing in the third digit, and a
sample-based estimate is nowhere near accurate enough for 0.03% to mean
anything. Only a custom frame area uses the exact conversion.

### Exhibit 4-2 lives in one file

`src/data/forage.js` is the only copy of the NRPH dry matter table. It feeds the
stage picker, the chart modal, the forage picker and the mix builder. **A
percentage must never be written into markup or into a stored record.** Storing
a resolved percentage would scatter copies of the table through saved
calculations, and a correction to the table would not reach records already
written. `state.js` `resolved()` looks it up at compute time.

`test/forage.test.js` transcribes the table a second time, independently, rather
than looping over the source. A test that reads its expectations out of the
thing it is testing proves only that the file can be read.

### Adding an input means touching three places

Markup in `src/ui/*` -> the factory in `src/state.js` -> `src/calc.js`. Inputs
declare `data-path="demand.animalWeight"` and one delegated listener in
`main.js` writes by path, so a new field needs no handler, but it does need to
exist in the factory and be consumed by the model.

### Computed figures are `[data-out]` placeholders, never template literals

Every step section stays in the DOM with `[hidden]` on the ones not open. That
one mechanism serves the wizard, the "Show all steps" toggle, and printing.
Because hidden steps are still in the DOM, a number baked into markup goes stale
the moment an earlier step is edited. `updateOutputs()` writes into
`[data-out]`, reading the formatter name off `data-fmt`.

The same rule is why `renderResults()` is called on a full render only and
`updateOutputs()` on every keystroke: re-rendering the cards to refresh a figure
would tear the focus out of the paddock width box on every character typed.

### `?` explains and never changes a value

A round `?` opens a definition. Anything that writes a field is styled as a text
link. `openInfo()` and `openGuide()` are read-only by construction.

### `storage.js` never throws

`localStorage` throws in Safari private mode and when the quota is full. Every
read falls back and every write returns `{ok, error}`. One corrupt record is
skipped, not fatal. Every stored record carries `schemaVersion`; when the shape
changes, bump `SCHEMA_VERSION` in `calc.js` and add a step to `migrate()`. Never
drop a record because it is old.

The working calculation is in its own key from the saved list. Autosave writes
on every keystroke; the saved list is written only on Save. Sharing a key would
let a failing autosave take the saved calculations with it.

### The shared design system does not drift

`src/styles.css` is shared with SDSHC-farm-budget and the Virtual Fence ROI
tool. Colour values are deliberately identical. A change there belongs in every
tool or in none of them. **App-specific rules go in `src/app.css`.**

Rules that outlive any one app: `--green` means a positive number, not an
action. `--sky` is the one loud button per screen and the KPI card edge. Colour
is never the only signal.

## Photo and media slots

Every photo in `src/data/forage.js` and every media slot in
`src/data/instructions.js` is `null` until SDSHC has photography. The UI renders
a labelled placeholder with the same shape, the same tap target and the same
viewer, so filling them in is a data-file edit and no code change.

What is wanted, 22 images plus 3 instructional items:

| Set | Count | What |
|---|---|---|
| A | 7 | One identification photo per forage type |
| B | 5 | Cool-season grass through five growth stages (western wheatgrass) |
| C | 5 | Warm-season grass through five growth stages (big bluestem) |
| D | 5 | A forb through its five stages (purple coneflower) |
| M | 3 | How to clip, how to dry, how to weigh |

Forbs use different stage names from grasses, so set D cannot reuse B or C.

A filled slot is `{ src, alt, credit }`, where `src` resolves against
`import.meta.env.BASE_URL`. Credits render under the photo in the viewer.

## Deployment

`vite.config.js` sets `base: '/SDSHC-grazing-calculator/'`. `index.html` uses
`%BASE_URL%` for public assets: a `./`-relative URL resolves against the current
page instead, which is wrong the moment the app is opened on any path but the
site root.

`.github/workflows/deploy.yml` runs `npm test` before `npm run build`, so a
broken model blocks the deploy. Keep it that way.

## Known limits

- The cover crops tab embeds the JotForm, which is cross-origin and therefore
  cannot be cached by the service worker. It does not work offline and says so.
  The native replacement is specced in the plan: steps 3 to 5 of the perennial
  worksheet are the same arithmetic as steps 2 to last of the cover crop
  worksheet, which is why `demand()`, `daysFrom()`, `acresFrom()` and
  `animalsFrom()` are exported separately from `calc.js`.
- jsdom loads no CSS, so `el.hidden` in `test/app.test.js` reflects the
  attribute rather than what a browser paints. Anything depending on the
  stylesheet has to be checked in a real browser.

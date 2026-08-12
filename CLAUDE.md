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

This is why pressing "Small hoop" sets `frame.key`, and why filling the area box
with 0.96 is a *display* of what the preset is rather than the thing the model
reads. Routing the preset through `customArea` would silently switch it to
100.03 and break paper parity.

The form defaults to **Other frame with an empty box**, not to the small hoop. A
default preset is a figure nobody entered and nobody checked, and it multiplies
every sample weight by 100. Blank means the frame is an outstanding question,
which is what `answered()` now reports. Typing over a preset's figure moves the
pill to Other frame, in place, without a re-render: `syncFramePill()` in
`main.js` updates `aria-pressed` directly, because rendering would take the
caret out of the box mid-number.

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

Under "Show all steps" every section is on the page and each one is collapsible,
with only the step being left open. Five expanded sections is a very long page,
and the reason to turn the toggle on is usually to reach one earlier figure. The
collapse hides `.step-body`, not the section, so the same rule holds: a shut
body is still refreshed, and print forces `.step-body[hidden]` back open
alongside `.step[hidden]`.

A **shut** step opens from anywhere in its box. An **open** one closes from the
caret only. The asymmetry is the point: an open step is full of inputs, and a
stray click on the padding between two fields must not fold away what is being
read. The handler in `main.js` returns early when the body is not hidden, and
skips anything inside a `button`, so the `?` still explains the step rather than
expanding it.

The same rule is why `renderResults()` is called on a full render only and
`updateOutputs()` on every keystroke: re-rendering the cards to refresh a figure
would tear the focus out of the paddock width box on every character typed.

### `openModal()` hands back a NEW body element every time

Callers wire their own controls by adding a listener to the element `openModal`
returns. Reusing that node keeps every one of those listeners alive for the life
of the page: the save dialog's colour swatches were also being handled by the
colour dialog opened ten minutes earlier, so clicking one re-tagged whichever
card that dialog had been about and closed the modal out from under the save.

So `openModal()` builds a fresh `.modal-body` and replaces the old one, which
drops the listeners with it. **Do not "optimise" this back to `innerHTML` on the
existing node.**

### `?` explains and never changes a value

A round `?` opens a definition. Anything that writes a field is styled as a text
link. `openInfo()` and `openGuide()` are read-only by construction.

It comes in two sizes and the boundary is what it explains. Beside a **field
label, a readout caption or a hint** it is 17px and centred on the line: it is
an aside on 13.5px type, not a control in its own right. Heading a **section** (a
step title, a sub-title, the tab strip) it keeps the shared 22px. Both live in
`app.css`; `styles.css` owns the 22px base and must not be changed for this.

It also does not MOVE. In a collapsible step head the caret leads the row and
`.step-toggle` is `flex: 0 1 auto`, so the `?` stays immediately right of the
step title whether "Show all steps" is on or off. A toggle that fills the row
pushes it out to the far right, where it reads as belonging to the caret rather
than to the title it explains. The `?` is a sibling of the toggle, never inside
it: a button may not nest a button, and opening a definition must not collapse
the step being explained.

### One dialog owns a saved calculation's identity

Name, pasture and colour are edited in one place, `openSaveDialog()`, reached
three ways: Save, "Edit saved" in the sticky bar, and Edit on a card. There is no
separate rename dialog and no separate colour dialog; there were, and there was
then no way to change two of the three without opening two modals, and no way to
change the pasture at all.

"Edit saved" still SAVES. It writes the figures as they stand. A button that only
renamed the record would quietly leave the numbers behind.

`updateCalcMeta()` is the storage-side counterpart and moves `updatedAt` only
when the name or the pasture changed. Colouring a card is filing, not editing,
and a list that reorders itself because somebody pressed a swatch is surprising.

Grey is not one of the eleven swatches. Grey is already what an untagged card
looks like (`.saved-card--untagged`), and offering it gives two ways to say the
same thing with no way to see which was meant.

### Clear and New calculation are different things

**Clear** (sticky bar) empties the boxes in the steps and KEEPS the goals and the
forage type. What is wanted after finishing a pasture is an empty worksheet for
the next one, not two questions to re-answer that nobody asked to change.

**+ New calculation** (chip row, and the Saved tab header) drops the whole
record, including those two answers, and lands back on the setup screen with a
new id. It is the only way to a genuinely blank start.

Both leave saved records alone, and both say so in their confirm. They are
deliberately at opposite ends of the screen: side by side, they are one slip
apart.

### `storage.js` never throws

`localStorage` throws in Safari private mode and when the quota is full. Every
read falls back and every write returns `{ok, error}`. One corrupt record is
skipped, not fatal. Every stored record carries `schemaVersion`; when the shape
changes, bump `SCHEMA_VERSION` in `calc.js` and add a step to `migrate()`. Never
drop a record because it is old.

The working calculation is in its own key from the saved list. Autosave writes
on every keystroke; the saved list is written only on Save. Sharing a key would
let a failing autosave take the saved calculations with it.

Two fields on a record are owned differently. `sortIndex` belongs to the Saved
tab alone, so the stored value always wins over the copy in memory, which has no
idea where a card was dragged to. `tag` has two owners, the Saved tab's Edit
dialog and the sticky bar's, so the stored value is only a **fallback**, used
when the incoming record's `tag` is `undefined`. `undefined` is "not mentioned"
and `''` is "no colour, deliberately"; collapsing the two puts a removed colour
straight back.

### The shared design system does not drift

`src/styles.css` is shared with SDSHC-farm-budget and the Virtual Fence ROI
tool. Colour values are deliberately identical. A change there belongs in every
tool or in none of them. **App-specific rules go in `src/app.css`.**

One deliberate divergence, and it lives in `app.css` rather than in the shared
file: farm-budget lets the topbar wrap on a narrow phone, with the logo on a
full-width row and the controls centred underneath. Here it stays on one line at
every width, because the row below it is already the tab bar and two stacked
full-width strips push the first question off a 320px screen.

The tool's name is in the page twice, `.topbar-title` in `index.html` and
`.app-title` from `header()`, and exactly one of them is displayed at any width:
the topbar one from 900px up, the header one below it. `display: none` takes the
other out of the accessibility tree, so the page still has one `h1`. **Adding a
third copy, or dropping either breakpoint, gives it two.** The topbar one is
absolutely centred rather than made a third flex child, because the logo and the
controls are nowhere near the same width.

Rules that outlive any one app: `--green` means a positive number, not an
action. `--sky` is the one loud button per screen and the KPI card edge. Colour
is never the only signal.

## Photo and media slots

A filled slot is `{ src, alt, credit }`, where `src` resolves against
`import.meta.env.BASE_URL` and must not start with `/`. Credits render under the
photo in the viewer, and an absent one renders as nothing. A `null` slot renders
a labelled placeholder with the same shape, the same tap target and the same
viewer, so filling one in is a data-file edit and no code change.

### `photos` is a list, and a card's index is not its position

A forage type carries `photos: []`, not one image, because several rows of
Exhibit 4-2 name four or five species and a row may one day carry one photo per
species. Today every row carries exactly one.

`registerForageSet()` FLATTENS those lists into one viewer set and hands back
`{ setId, indexOf }`. **Do not "simplify" this to the card's grid position.**
The moment any row carries two, card 3 stops being item 3 and the viewer opens
on somebody else's plant, which is the one thing these photos exist to prevent.

`MIXED` is registered LAST, in the same set, and carries a photo of a grazed
mixed stand. It is one of the eight cards on the screen, so it is drawn like
the other seven; a placeholder beside seven photographs reads as the option
where the photos ran out rather than as the answer for a stand with no single
row, which is most South Dakota rangeland.

### One plant stands in for every row, and the page says so

There is one photographed season in the app: bottlebrush squirreltail, from OSU
Extension EM-9276, held in `FRAME` in `forage.js`. Every set in `STAGE_PHOTOS` is
built out of those frames.

`STAGE_PHOTOS.coolSeason` and `.warmSeason` are the SAME object. All four grass
rows use the same five stage definitions, so one species shows what a boot or a
shattered seed head looks like for any of them. What it does not show is timing:
a warm season grass reaches these stages weeks later.

The forb set is the same plant mapped onto the forb stages, which is a further
stretch. It is **not** the grass list reordered: a forb has no boot stage, so it
reaches for the flowering frame where the grass mapping uses late boot. A test
asserts the two lists differ, because making them equal is the shortcut that
puts a boot photo under "Flowering to seed maturity".

Each set carries its own `note`, rendered above the grid, saying what its photos
may be read for. The species is also named in every stage's sublabel, on every
stage, because the viewer can be entered on any of the five. **Do not drop
either, and do not collapse the two notes into one:** what a grass photo can be
read for under a grass row is not what it can be read for under a forb row.

Stage photos default to HIDDEN (`showStagePhotos: false`) for the same reason.

### Still wanted

| Set | Count | What | State |
|---|---|---|---|
| A | 8 | One identification photo per forage type, plus the mixed stand | done |
| B/C | 5 | Grass growth stages | done, borrowed from one cool season species |
| D | 5 | A forb through its five stages (purple coneflower) | **borrowing the grass photos, and saying so** |
| M | 3 | How to clip, how to dry, how to weigh | empty |

Dead weight to clear when SDSHC has decided: `a1`–`a4-PLANTS.webp` and
`stages_boot-early.webp` are no longer referenced, and everything in `public/`
is precached whether or not it is used. That is about 750 KB of the app's
offline install size.

Source files live in `public/forage-images/`. They are precached by the service
worker, so the folder is the app's offline install size: **keep every file under
about 500 KB and the long side at 1400px**, in webp. Workbox refuses anything
over 2 MB outright and fails the build, which fails the deploy.

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

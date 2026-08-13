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

**This file is the rules. [DESIGN-NOTES.md](DESIGN-NOTES.md) is the reasoning** —
the failure each rule came from and the alternative that was tried, under
headings matching the ones below. Read the matching section before changing what
a rule covers.

## Critical contracts

### `src/calc.js` is pure

No DOM, no imports, no side effects, no I/O. **Do not add an import here.** The
dry matter lookup lives in `state.js` for this reason.

- Every arithmetic result passes through `num()`, `finite()` or `safeDiv()`. An
  overflow collapses to 0.
- `num()` rejects `Infinity` as well as `NaN`.
- `safeDiv()` guards a divisor of exactly zero only — acreage clamps before it
  divides.
- Every quantity goes through `nonNegative(value, label, warnings)`.

The invariant the tests assert is not "an answer can never rise", it is that **a
negative figure is worth the same as zero and is never handed back as a bonus.**

### Blank is not zero, and an unanswered goal has no answer

`compute()` returns `null`, not `0`, for any goal whose inputs are not all
answered, and lists the outstanding ones in `missing`. `updateOutputs()` renders
`null` as a dash. An explicit `0` counts as answered.

`answered()` is the only place that decides this. A new required input goes in
`GOAL_INPUTS` **and** in `answered()`.

`missing` is per goal and drives the dash and the result card note.
`missingByStep` sorts the same keys by `STEP_INPUTS` and drives the step note.
Both count selected goals only. `STEP_INPUTS[4]` is deliberately empty.
`STEP_INPUTS` and `STEP_FIELDS` (in `main.js`) answer different questions and are
not merged.

A step note renders only for a step already left with something outstanding
(`warnedSteps`, session state, not a preference). `mayLeaveStep()` is one speed
bump: the second press goes through, and going back is never blocked. The note is
a `[data-step-missing]` placeholder refreshed by `updateOutputs()`, not markup
built at render time.

### The worksheet's constants are not "corrected"

The two hoop presets use the worksheet's round numbers (100, not the exact
100.03) so a paper copy and the screen agree. Only a custom frame area uses the
exact conversion.

"Small hoop" sets `frame.key`; the figure in the area box is a *display* of the
preset, not what the model reads. **Do not route a preset through `customArea`.**

The form defaults to **Other frame with an empty box** — blank means the frame is
still an outstanding question. Typing over a preset moves the pill to Other
frame in place via `syncFramePill()`, without a re-render, to keep the caret.

### Exhibit 4-2 lives in one file

`src/data/forage.js` is the only copy of the NRPH dry matter table. **A
percentage must never be written into markup or into a stored record** —
`state.js` `resolved()` looks it up at compute time.

`test/forage.test.js` transcribes the table independently rather than looping
over the source.

### Adding an input means touching three places

Markup in `src/ui/*` -> the factory in `src/state.js` -> `src/calc.js`. Inputs
declare `data-path="demand.animalWeight"` and one delegated listener in `main.js`
writes by path, so a new field needs no handler — but it must exist in the
factory and be consumed by the model.

### Computed figures are `[data-out]` placeholders, never template literals

Every step section stays in the DOM with `[hidden]` on the ones not open; that
one mechanism serves the wizard, "Show all steps" and printing. A number baked
into markup goes stale the moment an earlier step is edited. `updateOutputs()`
writes into `[data-out]`, reading the formatter name off `data-fmt`.

Under "Show all steps" each section is collapsible. The collapse hides
`.step-body`, not the section, so a shut body is still refreshed, and print
forces `.step-body[hidden]` open alongside `.step[hidden]`.

A **shut** step opens from anywhere in its box; an **open** one closes from the
caret only. The handler returns early when the body is not hidden and skips
anything inside a `button`.

`renderResults()` runs on a full render only, `updateOutputs()` on every
keystroke — re-rendering cards to refresh a figure tears out focus.

### `openModal()` hands back a NEW body element every time

It builds a fresh `.modal-body` and replaces the old one, dropping every listener
callers attached with it. **Do not "optimise" this back to `innerHTML` on the
existing node** — stale listeners from an earlier dialog fire on the current one.

### `?` explains and never changes a value

A round `?` opens a definition; anything that writes a field is styled as a text
link. `openInfo()` and `openGuide()` are read-only by construction.

Two sizes: 17px beside a field label, readout caption or hint; the shared 22px
heading a section (step title, sub-title, tab strip). Both live in `app.css`;
`styles.css` owns the 22px base and must not be changed for this.

In a step head the caret leads the row and `.step-toggle` is `flex: 0 1 auto`, so
the `?` stays immediately right of the title. The `?` is a sibling of the toggle,
never inside it.

### One dialog owns a saved calculation's identity

Name, pasture and colour are edited in `openSaveDialog()` only, reached from
Save, "Edit saved" in the sticky bar, and Edit on a card. No separate rename or
colour dialog.

"Edit saved" still SAVES — it writes the figures as they stand.

`updateCalcMeta()` moves `updatedAt` only when the name or the pasture changed;
colouring a card is filing, not editing. Grey is not one of the eleven swatches —
it is already what an untagged card looks like.

The filter splits on commas and **any** term matching is enough (`filterTerms()`
in `saved.js`). Typing already narrows, so an AND would be a second way to do
what every keystroke does; the comma is for listing two pastures side by side.
`filtering` is `terms.length > 0`, **not** `filter.trim()` — a lone comma is not
a filter, and treating it as one would hide nothing while switching reordering
off, which reads as the drag handle having broken. The date is matched as
**displayed**, not as stored.

### Clearing is per step, and it names its own scope

Each step head carries a **Clear** that empties that step and nothing else, from
`STEP_FIELDS` in `main.js`, whose values come from `newCalculation()`. There is
no Clear in the sticky bar and there must not be one.

**+ New calculation** drops the whole record, goals and forage type included, and
lands on the setup screen with a new id. It is the only genuinely blank start.

### "Unsaved" means "not in the list", not "not saved recently"

`confirmLeavingUnsaved()` asks one question: is this calculation's id in
`listCalcs()`? An untouched form is not asked about either. **Do not "improve"
this into a dirty-flag check** — it would warn about the autosave, which is the
thing that cannot be lost.

`go-saved` (the To Saved button on step 5) writes the record first if there is
not one.

### `storage.js` never throws

Every read falls back and every write returns `{ok, error}`. One corrupt record
is skipped, not fatal. Every stored record carries `schemaVersion`; when the
shape changes, bump `SCHEMA_VERSION` in `calc.js` and add a step to `migrate()`.
**Never drop a record because it is old.**

The working calculation is in its own key from the saved list — a failing
autosave must not take the saved calculations with it.

`sortIndex` is owned by the Saved tab, so the stored value always wins. `tag` has
two owners, so the stored value is only a **fallback**, used when the incoming
`tag` is `undefined`. `undefined` is "not mentioned", `''` is "no colour,
deliberately" — collapsing the two puts a removed colour back.

### A calculation file and a backup are different kinds of file

Both are `.json` and both came out of this app, so nothing about the extension
tells them apart. `kind: 'sdshc-grazing-calculator-backup'` does, and it is
checked on the way in by **both** readers: `importCalcJSON()` refuses a backup by
name and `importBackupJSON()` refuses a single calculation by name. Restoring one
calculation over a list of twelve is the mistake this format has to make
impossible, so **do not relax either check to "whatever parses"**.

`tag` and `sortIndex` describe one device's list. `exportCalcJSON()` strips them;
`exportBackupJSON()` keeps them, because a backup restores a list onto itself and
the arrangement is most of what people back up for.

`replaceAll()` is the only destructive write in the module and it clears
`lastKnownUpdatedAt` — every entry there now describes a record this tab has not
read, and a stale one lets the next save overwrite a restored record silently.

Restore never touches the working calculation. It is in another key and is not
part of the saved list.

An uploaded calculation lands in the **list**, under a fresh id and a name
nothing else is using — not on screen. A fresh id is what stops a file exported
from this device overwriting the record it came out of.

`Save as` on a card offers image, spreadsheet, print, and calculation file. The
first, second, and fourth read the record directly. **Print has to put it on
screen**: printing prints the page, and the page shows the working calculation,
so from the Saved tab it would print the list.

`printSavedCalc()` **borrows** the record and gives it back — it does not go
through `openSavedCalc()`, asks nothing, and restores the working calculation,
the tab and `setupOpen`. Cancelling the print dialog otherwise left the user
standing in a calculation they never opened. The swap back runs on `afterprint`,
**not** off `print()` returning: on a phone `print()` can hand back before the
sheet appears, and the page would be swapped out from under it. `step` and
`maxStep` are left alone, since print forces every step visible anyway.

Figures for an exported image or spreadsheet are **recomputed** with
`compute(resolved(record))`, never read from the record's stored `results`. Same
rule as reopening one.

### The shared design system does not drift

`src/styles.css` is shared with SDSHC-farm-budget and the Virtual Fence ROI tool.
A change there belongs in every tool or in none of them. **App-specific rules go
in `src/app.css`.** One deliberate divergence, in `app.css`: the topbar never
wraps here.

The tool's name is in the page twice, `.topbar-title` (900px up) and `.app-title`
(below), with `display: none` on the other so the page has one `h1`. **Adding a
third copy, or dropping either breakpoint, gives it two.**

`--green` means a positive number, not an action. `--sky` is the one loud button
per screen and the KPI card edge. Colour is never the only signal. `--cost` /
`--cost-bg` is for something to go and fix (`.result-missing`, `.step-missing`,
`.start-warn`, `.warn-list`); `--info-bg` is for something to read. A dash where
a figure should be is the first kind.

Four traps in `styles.css` — `min-height: 44px` on `input, select`, the label
margins that centre `.help-btn`, `align-content` vs `align-items` in
`.field-label`, and `grid-auto-flow: column` on `.result-row` — are written up in
*[DESIGN-NOTES.md](DESIGN-NOTES.md)*. Read them before fighting the symptom.

## Photo and media slots

A filled slot is `{ src, alt, credit }`; `src` resolves against
`import.meta.env.BASE_URL` and must not start with `/`. A `null` slot renders a
labelled placeholder with the same shape and viewer, so filling one in is a
data-file edit and no code change.

Source files live in `public/forage-images/` and are precached, so they are the
app's offline install size: **keep every file under about 500 KB and the long
side at 1400px**, in webp. Workbox refuses anything over 2 MB and fails the
build.

- A forage type carries `photos: []`, a list. `registerForageSet()` flattens
  those into one viewer set and hands back `{ setId, indexOf }`. **Do not
  "simplify" this to the card's grid position** — the moment any row carries two
  photos, the viewer opens on the wrong plant.
- `MIXED` is registered LAST, in the same set, with a photo of its own.
- Every stage photo is one species (bottlebrush squirreltail, OSU Extension
  EM-9276) standing in for all of them. `STAGE_PHOTOS.coolSeason` and
  `.warmSeason` are the SAME object; the forb set is a further stretch and is
  **not** the grass list reordered. Each set's `note` and the species named in
  every sublabel say so — **do not drop either or collapse the two notes.**
- Stage photos default to HIDDEN (`showStagePhotos: false`).

Still wanted, and the dead files to clear: see *[DESIGN-NOTES.md](DESIGN-NOTES.md)*.

## Deployment

`vite.config.js` sets `base: '/SDSHC-grazing-calculator/'`. `index.html` uses
`%BASE_URL%` for public assets — a `./`-relative URL resolves against the current
page, which breaks on any path but the site root.

`.github/workflows/deploy.yml` runs `npm test` before `npm run build`, so a
broken model blocks the deploy. Keep it that way.

## Known limits

- The cover crops tab embeds a cross-origin JotForm, so it cannot be cached and
  does not work offline; it says so. `demand()`, `daysFrom()`, `acresFrom()` and
  `animalsFrom()` are exported separately from `calc.js` for the native
  replacement.
- jsdom loads no CSS, so `el.hidden` in `test/app.test.js` reflects the attribute
  rather than what a browser paints.

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

A step says what it still owes only once the user has **gone past it**
(`warnedSteps`, session state, not a preference). Every way forward says that, in
both modes: **Next**, **a circle further along the stepper**, **turning Show all
steps on** (every step behind you, on the page at once), **unfolding a later
step**, **folding away the step you are in** (that step included — the head it
just folded is the only place left to say what the step owes), and **working in a
later step**, which is what carries a step already open when the toggle went on.

`markPassed(upto)` is all of them; `markStepsBefore(el)` is the typing one, off
the input's own section, and it bails out unless `showAll` — the wizard has Next
for that and only one step on screen to type in. Going **back** never marks, on
any route. Unfolding step *i* marks what is above it and **not `i` itself** —
opening a step is arriving on it. Folding it marks `i` too.

`mayLeaveStep()` marks the one step being left, because it also decides whether
to stay on it: one speed bump, the second press goes through, and going back is
never blocked.

Both the note and the count are placeholders refreshed by `updateOutputs()`, not
markup built at render time: `[data-step-missing]` in the body, and
`[data-step-pill]` on a collapsible head. The gate is `data-warned` on the
`.step` section, **read from the DOM** rather than passed in, because
`markStepsBefore()` runs on a keystroke and sets the attribute without a render.
The count shows for a **shut** body only — with the step open the note is two
lines below the head, and one shortfall said twice in one box reads as two
problems. Print hides it: the body prints open, so the note itself prints.

The count sits **after the `?`**, never inside the toggle, under the same rule as
the `?` itself. Below 640px it drops to its own line, indented to where the title
starts, and gets smaller. Three rules do that and none is optional: `flex: 1 1 0`
on the toggle (see the `?` section), `flex-wrap: wrap` on the head, and a
full-width `::after` break ordered between Clear and the count. The last two are
inside `:has(.step-pill:not([hidden]))`, so a head with nothing to say does not
pay a row of `gap` for an empty line. The indent is a **measured constant** —
chevron, gap, badge, gap — because CSS cannot ask the badge how wide it came out.

### The worksheet's constants are not "corrected"

The two hoop presets use the worksheet's round numbers (100, not the exact
100.03) so a paper copy and the screen agree. Only a custom frame area uses the
exact conversion.

"Small hoop" sets `frame.key`; the figure in the area box is a *display* of the
preset, not what the model reads. **Do not route a preset through `customArea`.**

The form defaults to **Other frame with an empty box** — blank means the frame is
still an outstanding question. Typing over a preset moves the pill to Other
frame in place via `syncFramePill()`, without a re-render, to keep the caret.

Leaving a preset for Other frame **empties the box**, and only then: pressing
Other frame while already on it must not wipe a measurement that was typed in.
The state that leaves behind is the app's own starting state, so every answer
goes back to a dash until a real measurement arrives.

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

The autosave's state in the sticky bar is a `[data-autosave]` placeholder under
the same rule, painted by `paintAutosave()` from `refresh()`. It is **not**
`aria-live`: it changes on every keystroke, and announcing "Saving, Saved" over
the field being filled in is not reassurance. Its resting state before anything
is typed is empty, because a bar claiming "Saved" over a blank form is telling
somebody their work is safe before there is any.

The element is **always** in the page and `paintAutosave()` decides what it says,
off `data-listed`. The reassuring states are for a calculation already in the
saved list, because beside a button offering to "Save calculation" a line reading
"Saved" contradicts it. **The failed state shows either way** — a browser that
refuses to store anything hits brand new work hardest, and that is exactly the
work nobody has saved yet. **Do not gate the element itself on `saved`.**

The debounce is flushed on `pagehide` and `visibilitychange`, not `beforeunload`:
iOS does not fire that reliably, and mobile Safari suspends timers on
backgrounding, so a pending save can otherwise never run. It is flushed on
`set-tab` and `go-saved` too — the Saved tab is about to draw the record that
write updates, and 400ms is long enough to switch tabs inside.

**The sample spread note is the one thing on the page that does not refresh as
you type.** It is a judgement of the entry rather than a figure worked out from it,
and mid-number it describes a spread that exists only because the digits are not
all in — 1 and 100 read as a wide spread while the 100 is still "1".

So it is settled once per **entry**: `updateOutputs(res, root, {spreadNote: false})`
**leaves the paragraph exactly as it is** and does not hide it. `editingSamples` in
`main.js` is set by the `input` listener and cleared by `focusout`/`focusin` on
`app`, so leaving a weight box — **including for the next weight box** — is what
makes it appear, update or stand down.

Both halves came from a correction. Gating it on "the caret is in step 1" made
somebody tap the page to see it at all; hiding it on the first keystroke of the
next weight was the same flicker from the other side. **Do not turn the frozen
state back into a hidden one.**

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
never inside it. **Below 640px that flips to `flex: 1 1 0`** on collapsible heads
only: the title wraps to two lines there whatever happens, so filling the row is
what pins the `?` beside Clear instead of letting it follow the last word of the
title about — and it is also what keeps the `?` on the title's row once the row
is allowed to wrap for the shortfall count.

### One dialog owns a saved calculation's identity

Name, pasture and colour are edited in `openSaveDialog()` only, reached from
Save, "Edit saved" in the sticky bar, and Edit on a card. No separate rename or
colour dialog.

"Edit saved" still SAVES — it writes the figures as they stand.

A card's figures come from the record's stored `results`, so an unanswered goal
must render a dash there too: `figure()` in `saved.js` guards `null` before the
formatter, because every formatter treats a non-finite number as 0 and
"Grazing days: 0 days" is an answer, and a wrong one. Same rule as
`updateOutputs()`, one file further out.

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

The filter box and its hint are rendered **inside** `.saved-head`, not under it,
so they are siblings of `.head-tools` and CSS `order` can put the file controls
below the hint on a phone and beside "+ New calculation" on a desktop. `order`
only works between siblings; splitting them back out breaks the phone layout
with nothing failing.

A card's meta line is pasture, forage and date. It does **not** list the goals:
every goal is a labelled figure two lines below it. `.saved-figs` is indented by
`--grip` on `.saved-card`, the width the drag handle takes out of the row above,
so the figures start on the name's left edge.

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

It is the browser's `confirm()`, and it stays that way. A modal of our own could
label its buttons "Continue" and "Go back" instead of OK and Cancel; it was tried
and reverted, because a modal cannot block and the callback it forces on this
function and on `openSavedCalc()` costs more than the two words are worth.

`go-saved` (the To Saved button on step 5) writes the record first if there is
not one.

### "Saved" means one thing: the record matches the screen

The autosave writes the working copy **and**, if this calculation is already in
the saved list, that record — `writeEverywhere()` and `syncSavedRecord()` in
`main.js`. A calculation saved half way through and then finished used to sit in
the Saved tab showing the figures it had when it was saved, under a bar reading
"Saved". Both were true of different things, which is not something a user can be
asked to hold in their head.

Nothing there **creates** a record. The Save button still decides what is kept, so
a calculation nobody has named stays out of the list.

`syncSavedRecord()` compares `fingerprint()` before writing, and that guard is
load-bearing: opening a record notifies, so without it an open would rewrite the
record, move its date and jump it to the top of a list nobody had reordered.
`fingerprint()` leaves out what the store owns — `updatedAt`, `createdAt`,
`sortIndex`, `schemaVersion`, `tag` and `results`.

A `Conflict` (another tab wrote it) is **left alone** rather than asked about: the
question belongs to a button somebody pressed, and `persist()` still asks it.

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

### Where the data lives is stated, not only linked

`footer()` in `main.js` renders on every tab and states it in one sentence
(`.footer-privacy`), with a `privacy` definition behind *Read more* and the same
fact at the end of the how-to's *Saving your work*. The sentence survives
printing and the link does not — the print block hides `.footer button`.

`footer()` takes the tab for one reason: the **cover crops tab says something
different**, because that tab is a cross-origin JotForm and submitting it sends
the entries to JotForm. **Do not simplify that back to one sentence** — the
blanket line is a promise the app cannot keep on one of its three tabs.

The footer carries the how-to link and the privacy line and **no exports**,
unlike farm-budget's copy. Step 5 and a card's *Save as* already carry those, and
a set at the foot of the page would act on the working calculation while the
Saved tab shows records that are not it.

### The shared design system does not drift

`src/styles.css` is shared with SDSHC-farm-budget and the Virtual Fence ROI tool.
A change there belongs in every tool or in none of them. **App-specific rules go
in `src/app.css`.** One deliberate divergence, in `app.css`: the topbar never
wraps here.

The tool's name is in the page twice, `.topbar-title` (900px up) and `.app-title`
(below), with `display: none` on the other so the page has one `h1`. **Adding a
third copy, or dropping either breakpoint, gives it two.** The logo is in the
page twice for the same reason and under the same rule: `.toplogo-wide` and,
below 440px where three font choices have to fit on a row that cannot wrap,
`.toplogo-mark`.

Three font choices, `browser` / `classic` / `mono`, and `FONTS` in `prefs.js` is
the list. Anything else stored falls back to `browser`, so a page can never end
up with no `--font`. Mono brings the small **prose** down a step and leaves every
**figure** alone — the columns are what somebody picks that face for. The rules
are split across both sheets under the same heading, shared classes in
`styles.css` and this app's in `app.css`, and **both blocks sit last in their
file**: they are one selector deep, so any `.something .hint { font-size }` added
later beats them. Match the depth of whatever is winning.

`--green` means a positive number, not an action. `--sky` is the one loud button
per screen and the KPI card edge. Colour is never the only signal. `--cost` /
`--cost-bg` is for something to go and fix (`.result-missing`, `.step-missing`,
`.start-warn`, `.warn-list`); `--info-bg` is for something to read. A dash where
a figure should be is the first kind.

Four traps in `styles.css` — `min-height: 44px` on `input, select`, the label
margins that centre `.help-btn`, `align-content` vs `align-items` in
`.field-label`, and `grid-auto-flow: column` on `.result-row` — are written up in
*[DESIGN-NOTES.md](DESIGN-NOTES.md)*. Read them before fighting the symptom.

### The theme lab is an author tool, not a feature

`src/themelab.js` is a hidden palette editor: **Ctrl+Alt+T**, or five taps on the
SDSHC logo inside two seconds; Escape closes it. Nothing on any screen links to
it. It is loaded from `index.html` **before** `main.js`, so a saved override is
on `<html>` before the first render, and it is kept out of `main.js` so the entry
module the tests import stays what it was.

Shared with SDSHC-farm-budget under the same rule as `styles.css`, because it
edits `styles.css`'s tokens: **a change belongs in both copies or in neither.**
The deliberate differences are the store key, the group names and the token
descriptions. Farm-budget declares `--placeholder` and this app does not — that
is the one real divergence between the two stylesheets, and it is a colour this
app has not chosen rather than one the lab is hiding.

- It writes **inline** custom properties on `<html>`, never a stylesheet, so
  removing one restores the shipped colour exactly and one mechanism covers both
  themes.
- Its own colours are `--tl-*` names declared on `.tl-panel`, and **no `--tl-*`
  name is in `ALL_TOKENS`**. Wiring the panel to `--card` and `--text` would mean
  setting `--text` near `--card` leaves you unable to see the control that puts
  it back.
- `GROUPS` is hand-written and `styles.css` is where the colours live, so
  `test/themelab.test.js` asserts the two lists agree in both directions. A token
  added to `:root` with no row here is one the lab silently leaves out of "reset"
  and "copy full palette".
- The mirror's correctness property — a light token left at its shipped value
  reproduces the exact dark hex — is asserted against `styles.css` **parsed**,
  not against a copy of it.
- Overrides and the shelf of saved palettes live under one localStorage key of
  their own (`sdshc-gc-themelab`). They are **not** preferences and are not
  carried by an export or a backup.

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

The phone's browser bar colour is in **three** places and they must agree:
`<meta name="theme-color">` (what a browser tab reads), `theme_color` in
`vite.config.js`'s manifest (what an installed copy reads), and `BAR_COLOR` in
`prefs.js`, which rewrites the meta so the bar follows the in-app theme toggle.
A `media="(prefers-color-scheme: dark)"` meta would not do that job — the theme
is a stored choice that is allowed to disagree with the system setting.

Changing it does not show up on the next refresh. `index.html` is precached, so
the reload that fetches the new service worker is still served the old document;
it takes a second reload. On Android the manifest colour is baked into the
WebAPK at install time, so an installed copy keeps the old one until Chrome
refreshes the APK or the user reinstalls.

## Known limits

- The cover crops tab embeds a cross-origin JotForm, so it cannot be cached and
  does not work offline; it says so. `demand()`, `daysFrom()`, `acresFrom()` and
  `animalsFrom()` are exported separately from `calc.js` for the native
  replacement.
- jsdom loads no CSS, so `el.hidden` in `test/app.test.js` reflects the attribute
  rather than what a browser paints.

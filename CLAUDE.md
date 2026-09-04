# SDSHC Grazing Calculator

Two SDSHC worksheets as calculators, on tabs of their own. **Perennial grazing**
is the *Graziers Math Worksheet* — clipped forage samples in. **Cover crops** is
the *Grazing Cover Crops* worksheet — average stand height in. Both give grazing
days / acres needed / animals allowed out, and both save into one list. Vanilla
ES modules, Vite, vite-plugin-pwa, zero runtime dependencies. Deployed to GitHub
Pages.

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

### One registry, parallel calculators

A worksheet is a **descriptor** in `src/calculators.js`, and `main.js`'s machinery
— the stepper, `warnedSteps`, `markPassed`, `mayLeaveStep`, the autosave, the
Saved tab, the drag, the print block — stays generic and reads whichever
descriptor is active. **Adding a calculator is adding a row there and the modules
it names.** It is not editing the machinery.

```js
{ id, slug, tabLabel, shortName, newCalcBlurb,
  newCalculation, resolved, compute,
  stepLabels, stepFields, stepInputs, inputLabels, goals,
  started(calc), setupAnswered(calc),
  renderSetup(calc, returning), renderChips(calc),
  renderSteps(...), renderResults(calc),
  handleAction(action, btn, ctx) -> handled:boolean, handleChange, handleInput,
  afterClearStep(calc, i),
  csv(calc, res) -> rows[][], image(calc, res) -> {headlines, rows, subtitle},
  savedMeta(calc) -> string[] }
```

Three lookups and one helper, and between them they are how everything else
avoids knowing there are two:

- `calculatorFor(calc)` — the descriptor for a **record**, from its `calcType`.
  **The `?? DEFAULT_CALC_TYPE` fallback is load-bearing**: every record written
  before `calcType` existed has none, and they are all perennial.
- `calculatorById(id)` — falls back rather than returning nothing, because a
  caller renders off it.
- `activeCalculator()` — the one on screen.
- `computeRecord(calc)` — `desc.compute(desc.resolved(calc))`. It replaces every
  `compute(resolved(x))`: `refresh`, `mayLeaveStep`, `syncSavedRecord`, `persist`,
  the exports.

`ctx = { render, closeModal, root }`. **`main.js` owns `render()`**, so a
descriptor asks for one rather than importing it — that is what keeps
`calculators.js` out of `main.js`'s import cycle. `calculators.js` reaches the
whole UI, so `storage.js` and `export.js` stay out of it; what storage needs to
know about a record's shape is in `schema.js` instead.

**The anti-rule: do not parameterise `compute()` into one model with branches.**
That was the alternative and it is what this shape was chosen over. The two
worksheets share their last three steps and share *nothing* in their first two, so
a merged model is a function whose every line sits behind an `if`. What they
really share is the arithmetic, and that is already shared — `demand()`,
`daysFrom()`, `acresFrom()` and `animalsFrom()` are exported on their own from
`calc.js` for exactly this.

`state.js` holds a **map** of working calculations, one per type, created lazily —
a user who never opens the cover crop tab never gets a cover crop record written
anywhere. `setCalculation(calc, type)` makes the written slot **active**, because
every caller wants both and splitting them opens the hole where `notify()` fires
about record X while `writeEverywhere()` reads the active slot.

### Every tab has an address

`/perennial`, `/cover-crop` and `/saved`, under the deployed base. The worksheet
slugs come off the descriptors, and `saved` is named in `main.js` because it is
not a calculator and has no descriptor to carry one.

**`slug` and `id` are different things and must not be collapsed.** `id` is a
storage key written into every record ever saved; `slug` is read by people.
`covercrop` is the key, `/cover-crop` is the link. Changing a slug breaks a
bookmark; changing an id breaks every saved calculation.

**The URL is replaced, never pushed.** Back has always left this app and still
does, which matters most in the installed copy on a phone, where Back is the way
out and a stack of tab switches would be a stack of presses to get through. A
link's job is to name a tab, and `replaceState` does that: share it, bookmark it,
reload it, the same tab comes back. There is no `popstate` handler because
nothing pushes an entry for one to answer.

`syncURL()` is called from **`render()`**, the one funnel every tab change goes
through: eight places set the `tab` pref and all eight render afterwards. That
includes `printSavedCalc()`'s borrow and restore, which is the other reason this
replaces — a print must not leave a history entry pointing at a record nobody
opened. It carries the **query string** over, because `?noga=1` is the analytics
opt-out and is read on every load.

At boot **a route beats the stored `tab` pref**, and a bare base URL does not:
somebody who opened `/cover-crop` asked for that worksheet, and somebody who
opened the plain address is coming back to where they were. An unknown path is a
bare URL for this purpose, which is what `404.html` serves.

A slug is matched **case-insensitively** and the address is then rewritten to the
canonical spelling, because these get typed off a handout and read out at
workshops and neither carries the case.

`routeCopies()` in `vite.config.js` writes `index.html` again at each slug and at
`404.html`. GitHub Pages is a static file server, so `/cover-crop` is a missing
file and answers 404 on a **first** visit; the service worker's
`navigateFallback` only covers a visit after one that already worked.
`cover-crop.html` answers the extensionless request with a 200, and `404.html` is
the backstop for a host that will not do that and for any path no longer routed.
The plugin runs **last, after VitePWA**, so the copies stay out of the precache
manifest — they are byte-identical to `index.html`, which is precached already
and is what `navigateFallback` serves offline.

The slug list is in **two** files, so `test/router.test.js` asserts they agree in
both directions. A slug in `calculators.js` with no row in `vite.config.js` is a
link that names the right tab and 404s for whoever it was sent to. **Nothing may
type that list out a third time**: `test/router-build-output.test.js` parses it
out of the config, so a route added to the config gets checked without anybody
remembering to.

`main.js` is a module singleton and reads the URL once, in its boot block, so a
starting URL is **one per test file**. That is why `test/router-*.test.js` is
seven small files rather than one big one. `test/helpers/boot-app.js` is the shared jsdom
boot. `app.test.js` and `covercrop.test.js` predate it and still carry their own.

### Preferences are global; a place in a worksheet is not

`theme`, `font`, `tab`, `showAll` and `showStagePhotos` stay at the top level of
`prefs.js`. `step`, `maxStep` and `openSteps` live under `wizard[type]`, one block
per calculator, reached through `getWizard(type)` / `setWizard(type, patch)` /
`isStepOpen(type, i)` / `setStepOpen(type, i, open)` / `setOpenSteps(type, ids)`.

The line between them: **a place in a worksheet belongs to that worksheet, a way
of working does not.** Switching tabs must not move where the other worksheet had
got to; switching tabs also must not turn "Show all steps" off, because that is
how this person reads a worksheet and not a fact about one of them.

`wizard` needs a **deep** merge over `DEFAULTS` in `read()` — a stored block
holding only `perennial` would otherwise leave every other calculator `undefined`
and `getWizard()` would hand back nothing.

`migratePrefs()` moves v1's flat `step` / `maxStep` / `openSteps` under
`wizard.perennial` and deletes them, and a block already written by this build
wins over them. **It is not dead code**: somebody who has not opened the app since
the second calculator landed still has the flat keys, and dropping them puts them
back on step 1 of a worksheet they were halfway through.

`checkedNeeds` ids are `${scope}:${key}` and both worksheets ask for
`animalWeight`, `numAnimals` and `totalAcres`, so the ids would collide. The cover
crop setup renderer prefixes its scope `cc:` — the tick is "I have packed a
yardstick" or "I have packed a gram scale", which are different jobs on different
days, so they are different ticks. **The pref shape was not changed for this.**

### `src/calc.js` is pure

No DOM, no imports, no side effects, no I/O. **Do not add an import here.** The
dry matter lookup lives in `state.js` for this reason.

`src/calc-covercrop.js` is the second model and obeys the same rule one step out:
it imports the **primitives** from `calc.js` — `num()`, `finite()`, `safeDiv()`,
`nonNegative()`, `demand()`, `daysFrom()`, `acresFrom()`, `animalsFrom()`,
`paddockSides()`, `SQ_FT_PER_ACRE` — **and nothing else**. `calc.js` still
imports nothing at all. The lookup rule extends with it: the occupation-period
and season tables are resolved in `state-covercrop.js`, never in the model.

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

Each model has exactly one `answered()`, and it is the only place that decides
this **for that model**. It reads the **resolved** value, never the stored key: a
season or an occupation period this build cannot look up resolves to rates of 0,
and the arithmetic then runs to completion and prints "0 grazing days". A key
nothing matches is **unanswered** — a dash, plus a warning naming it, the same
shape `frameMultiplier()` uses on the other model. A new required input goes in that model's `GOAL_INPUTS`
**and** in its `answered()`. `GOAL_INPUTS`, `STEP_INPUTS`, `INPUT_LABELS` and
`STEP_FIELDS` are per calculator and reached through the descriptor —
`STEP_FIELDS` lives on it rather than in `main.js`.

`updateOutputs(res, root, { spreadNote, labels })` takes the label map, because
its `labels()` helper would otherwise read perennial's `INPUT_LABELS` and print
raw keys in the other worksheet's shortfall note.

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

**A warning goes on the step that raised it.** `compute()` returns the flat
`warnings` list *and* `warningsByStep`, sliced at the step boundaries — the models
run in worksheet order, so where a warning was raised is which step it belongs to,
and slicing beats making every `push` name its own step, which would be wrong
silently. `step-frame.js` gives every step a `[data-warnings]` box and
`updateOutputs()` fills each from `warningsByStep[i]`, the box finding its own
index off the enclosing `.step` exactly as `[data-step-missing]` does. **The flat
list stays** and is what the CSV and the share image carry, as one block.

A folded head carries **`[data-step-warn-pill]`** beside `[data-step-pill]`, same
`.step-pill` class and same shut-body-only rule. Two differences from the missing
count, both deliberate: it is on the **last step too**, which asks for the acres
and so can raise a warning though it can never owe an answer; and it is **not
gated on `data-warned`**, because that gate exists for a step you have not
reached yet and a warning is about something already typed. The toggle's
`aria-describedby` names both pills.

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

The three how-to panels — clip, dry, weigh — are **one dialog that pages**,
`openHowTo()` in `steps.js`. They are three parts of one job done in order, so
the arrows and the left/right keys move between them and **wrap**, and
`setModalTitle()` moves the modal head with the panel. A heading left behind is
page two read under page one's title. The key hook is registered through
`addModalKeyHook()`, so it lives and dies with the dialog, and `releaseHowTo()`
hangs off the same overlay watcher as the photo viewer.

### A step change lands on the work, not on the top of the page

`scrollToWork(sel)` in `main.js` is what **Next**, **Back**, a **stepper circle**,
**Start / Return** and the **Show all steps** toggle scroll with. Below 900px it
puts the target at the top of the screen; at 900px up everything above the
worksheet is one compact row, so the page top already is the top of the work and
it stays `scrollToTop()`. Call it **after `render()`** — it queries the markup
that render just wrote.

`workTarget()` is the target, and it is per mode, not per button: `.stepper` in
the wizard, and under Show all steps, which has no stepper, the **expanded** step.
**Not `step`** — nothing in that mode moves the wizard's current step, so it names
wherever the user was when the toggle went on and may be folded shut by now. The
topmost open one when several are open, and that stale step's head only when every
one of them is folded. It reads `.step-body[hidden]` off the DOM, the same answer
`isStepOpen()` gave `renderSteps()`, and it returns the **element**. Three of the
five call sites can be in either mode, so **do not inline a target at one of
them.**

The breakpoint is `.topbar-title`'s, deliberately: this is that layout, not a
fourth number. The air above the landing is `scroll-margin-top` on
`.stepper, .step` in `app.css` and not an offset worked out in the JS.

`workTarget()` reads `.stepper` and `.step-body[hidden]` **off the DOM**, so a
worksheet that renders different class names gets no scroll at all on a phone and
**nothing fails** — no error, no test, just a landing at the top of the page. That
is why the class and attribute contract in the next paragraph is a hard
requirement rather than a house style.

Every calculator's step renderer emits the same contract:
`.box.step[data-step][data-warned]`, `.step--collapsible`, `.step-head`,
`.step-body[hidden]`, `.step-nav`, `[data-out][data-fmt]`, `[data-step-missing]`,
`[data-step-pill]`, `.stepper`. `updateOutputs()`, `stepOutstanding()`,
`workTarget()`, `scrollToWork()`, the collapse handler and the whole
`@media print` block key off those.

**Start / Return** is in the list because the position it leaves belongs to the
setup screen — pressed from the foot of an eight-row forage chart, and returning
to a worksheet of a different length. A **tab** change is not: `+ New calculation`
and `To Saved` are arrivals rather than moves within the worksheet, and what is
above them is not chrome to skip past.

### The worksheet's constants are not "corrected"

The two hoop presets use the worksheet's round numbers (100, not the exact
100.03) so a paper copy and the screen agree. Only a custom frame area uses the
exact conversion.

`IMPLAUSIBLE_HEIGHT_IN` (144, twelve feet) is a **plausibility query, not a
limit**: it warns and still works the answer out, the same as `demand()`'s
`rate > 10`. It catches the one-keystroke slip — 18 typed as 180 — that nothing
else on the sheet can question, since 180 is positive, finite and above the
anchor. It is set well above a real stand deliberately: **a warning that fires on
real work is worse than no warning**, because the people most likely to measure a
ten-foot sorghum-sudan stand are the ones who would learn to dismiss the line.

**Both worksheets default to 2.6% of body weight**, `DEFAULT_BODY_WEIGHT_PCT` and
`COVER_CROP_BODY_WEIGHT_PCT`. The printed cover crop worksheet fixes its rate at
3%; 2.6% is SDSHC's working figure, it sits inside the NRCS range of 2.5% to 3%,
and the field is editable, so a 3% worksheet is reproduced by typing 3. This is a
**default**, not a constant the model depends on — that is the difference from the
rule above. `test/covercrop.test.js` types 3 into it before checking the paper's
worked example, which is what keeps that test about the worksheet rather than
about the default.

`COOL_SEASON_BASE` in `src/data/covercrop.js` is **1,140**, and older printed
copies of the cover crop worksheet give it as 140. That was a typo in the PDF,
since corrected, and the arithmetic proving it is kept in a comment above the
constant. **Do not "correct" it back from an out-of-date copy.** The rule the
case sets: a round number the paper rounds is kept, because paper parity is the
point; an arithmetic error the paper's own worked example contradicts is not.

"Small hoop" sets `frame.key`; the figure in the area box is a *display* of the
preset, not what the model reads. **Do not route a preset through `customArea`.**

The form defaults to **Other frame with an empty box** — blank means the frame is
still an outstanding question. Typing over a preset moves the pill to Other
frame in place via `syncFramePill()`, without a re-render, to keep the caret.

Leaving a preset for Other frame **empties the box**, and only then: pressing
Other frame while already on it must not wipe a measurement that was typed in.
The state that leaves behind is the app's own starting state, so every answer
goes back to a dash until a real measurement arrives.

`frame.areaUnit` is what the **box** is in, `sqft` or `sqin` from `AREA_UNITS`,
and the model divides by `perSqFt`. A tape reads inches, so a homemade frame is
"36 by 36" long before it is 9 sq ft. Four rules, and the case for each is that
the alternative is silent:

- **The suffix IS the control.** `field()` takes a `suffixSelect` and renders the
  unit as a `<select>` where the `sq ft` label used to sit, against the number it
  applies to. It carries no `data-path`, deliberately: `main.js` writes a select
  to its path **before** the descriptor sees the change, and a unit already
  overwritten cannot be converted from. It is handled by `data-action` in
  `handleChange()`, the same as the growth stage select, and it says its own
  `mode_select` because `TRACKED_ACTIONS` is a **click** allowlist.
- Switching units **converts** the figure, it does not reinterpret it.
  `convertArea()` rounds at four decimals so a round trip lands back on what was
  typed. Reading "2" as 2 sq in the moment the unit changes moves the answer by a
  factor of 144 with nothing on screen saying so.
- Choosing a **preset puts the box back into square feet**. The presets are
  stated in sq ft on the pill, in the hint, and on the paper worksheet, and 0.96
  shown as 138.24 sq in agrees with no copy of it. Paper parity again.
- `syncFramePill()` compares against the preset **as shown**, converted into the
  live unit. Against the raw 0.96 it reads the app's own figure as a number of
  the user's own and moves the pill to Other frame on the next keystroke.

A unit key nothing matches is **unanswered**: warn and work nothing out, the
same shape as an unknown `frame.key` one branch up. A missing one is `sqft` —
every record written before the option existed carries none.

`MIN_PLAUSIBLE_FRAME_SQ_FT` (0.05) and `MAX_PLAUSIBLE_FRAME_SQ_FT` (100) are the
unit option's own `IMPLAUSIBLE_HEIGHT_IN`, and the same **query, not a limit**: it
warns and works the answer out. The slip it catches is "2" typed while the box
reads sq in — a frame an inch and a half across, a multiplier of nearly 7,000
lbs/ac per gram, and the only figure on this sheet nothing else can question,
since 2 is positive, finite, and an ordinary number of square feet. Both bounds
sit far outside every real frame (the two hoops, a square metre quadrat at 10.76,
a thousandth-acre plot at 43.56) under the same rule as the twelve-foot stand: **a
warning that fires on real work is worse than no warning.** A blank box returns
before the check, so an unanswered question is never queried as an implausible one.

### Exhibit 4-2 lives in one file

`src/data/forage.js` is the only copy of the NRPH dry matter table. **A
percentage must never be written into markup or into a stored record** —
`state.js` `resolved()` looks it up at compute time.

`src/data/covercrop.js` is the same rule for the other worksheet: the season
production rates and the occupation-period utilization table are the only copy of
either, and `resolvedCoverCrop()` in `state-covercrop.js` looks them up at compute
time. `COOL_SEASON_BASE` carries a comment recording that the printed PDF says 140
where its own worked example needs 1,140; correcting it is that one line, and it
reaches every record ever saved **because** no record holds a copy.

`test/forage.test.js` transcribes the table independently rather than looping
over the source.

### Adding an input means touching three places

Markup in `src/ui/*` -> **that calculator's** factory -> **that calculator's**
model. Perennial: `src/state.js` -> `src/calc.js`. Cover crop:
`src/state-covercrop.js` -> `src/calc-covercrop.js`. Inputs declare
`data-path="demand.animalWeight"` and one delegated listener in `main.js` writes
by path, so a new field needs no handler — but it must exist in the factory and
be consumed by the model.

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

**`+ New calculation` on the Saved tab asks which worksheet** (`openNewCalcDialog()`),
because that is the one place the answer is not already on screen. The copy of the
button in a worksheet's chip row does not ask: it is the worksheet you are
standing in. **Upload a calculation needs no chooser at all** — the file declares
its own `calcType`.

A **backup covers both kinds** and stays one file. "Back up my work" splitting into
a two-step job is how it stops being done consistently. The restore `confirm()`
states counts per type on both sides, arriving and going.

`updateCalcMeta()` moves `updatedAt` only when the name or the pasture changed;
colouring a card is filing, not editing. Grey is not one of the eleven swatches —
it is already what an untagged card looks like.

The filter splits on commas and **any** term matching is enough (`filterTerms()`
in `saved.js`). Typing already narrows, so an AND would be a second way to do
what every keystroke does; the comma is for listing two pastures side by side.
`filtering` is `terms.length > 0`, **not** `filter.trim()` — a lone comma is not
a filter, and treating it as one would hide nothing while switching reordering
off, which reads as the drag handle having broken. **`narrowed()` in `main.js`
gates the drag HANDLER and must ask `filterTerms()` the same question**: when the
two disagreed, the page said draggable and every drag silently did nothing. The date is matched as
**displayed**, not as stored.

`filtering` is **either** narrowing: the text terms **or** the calculator pills.
Both hide cards, so both switch reordering off, and one Clear undoes both — a
Clear beside two narrowings that only undid one leaves a list still hiding cards
with nothing on screen saying why.

The pill row (`.saved-kinds`, `set-saved-kind`) sits at the right-hand end of the
filter row, not on a row of its own: it does the same job as the box beside it.
Its three segments are equal width, sized to the widest label by
`grid-auto-columns: 1fr` over `width: max-content` — a flex row would leave "All"
a third the width of "Cover crop". The box beside it is **`flex: 1 1 0`, not
`1 1 auto`**: `styles.css` gives every input `width: 100%`, which an `auto` basis
reads as "I want the whole row", and the segments wrapped to a second line no
matter how they were sized. Below 640px they take a row each and the segments
centre on theirs. It only renders once the list actually
**holds** more than one kind, or while a pill is on. `matches()` searches
the descriptor's `shortName` too, so typing "cover crop" narrows the same way the
pill does — the pill is the one-tap version, the box is for somebody already
typing.

The filter box and its hint are rendered **inside** `.saved-head`, not under it,
so they are siblings of `.head-tools` and CSS `order` can put the file controls
below the hint on a phone and beside "+ New calculation" on a desktop. `order`
only works between siblings; splitting them back out breaks the phone layout
with nothing failing.

**One list holds both kinds**, with one drag order and one `sortIndex` space. Two
lists were the alternative: each would need its own head, its own "+ New", and its
own order, which is a second set of furniture on a phone solving a problem the
list only has once somebody has more than a handful of each.

The **calculator badge** (`.saved-kind`) is in the card's top-right corner, on the
name's row and out of the meta line. It is a label on the whole card rather than
one more field about the pasture, and it is the same word on every card of a
kind — down the right-hand edge that reads as a column to skim, where in front of
the pasture name it was a prefix to read past on every row. It is the one thing on
a card that is not optional: nothing else says whether "Grazing days: 25" came off
clipped samples or off a yardstick, and the two are not comparable.

A card's meta line is pasture, then whatever that worksheet's `savedMeta(calc)`
adds — forage for one, season for the other — then the date. It does **not** list
the goals: every goal is a labelled figure two lines below it. `.saved-figs` is indented by
`--grip` on `.saved-card`, the width the drag handle takes out of the row above,
so the figures start on the name's left edge.

### Clearing is per step, and it names its own scope

Each step head carries a **Clear** that empties that step and nothing else, from
`stepFields` **on the descriptor**, whose values come from that calculator's own
`newCalculation()`. There is no Clear in the sticky bar and there must not be one.
`afterClearStep(calc, i)` is the optional hook for whatever a worksheet cannot
leave blank — perennial's mix rows take back the forage type the setup screen
already named.

**+ New calculation** drops the whole record, goals and forage type included, and
lands on the setup screen with a new id. It is the only genuinely blank start.

Its scope is **one calculator**: it drops the record for the worksheet you are in
and leaves the other one exactly as it was. From the Saved tab, where neither
worksheet is on screen, `openNewCalcDialog()` asks which — and the answer names
the record dropped, the tab landed on, and the wizard reset. From a worksheet's
chip row there is no question to ask, so `data-kind` is absent and the active
calculator is meant. Written down because it reads as a bug either way if it is
not: silently clearing both is destructive, and silently clearing neither looks
broken.

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
`sortIndex`, `schemaVersion`, `tag` and `results`. `calcType` is in it, and
correctly so: a record cannot change type, so it can only ever agree.

A `Conflict` (another tab wrote it) is **left alone** rather than asked about: the
question belongs to a button somebody pressed, and `persist()` still asks it.

### `storage.js` never throws

Every read falls back and every write returns `{ok, error}`. One corrupt record
is skipped, not fatal. Every stored record carries `schemaVersion`; when the
shape changes, bump `SCHEMA_VERSION` in `calc.js` and add a step to `migrate()`.
**Never drop a record because it is old.**

The working calculation is in its own key from the saved list — a failing
autosave must not take the saved calculations with it — **and its own key per
calculator**, in `WORKING_KEYS`. `sdshc-gc-working` is **perennial's and does not
move**, so a worksheet somebody was halfway through survives the upgrade. The key
is chosen off the **record's** `calcType`, not off what is on screen:
`printSavedCalc()` borrows a record that may be of the other type.

`migrate()` carries **version steps only**. The per-type shape defaults run after
the ladder, in `fillRecordDefaults()` from `schema.js`. The old `version < 1` step
grafted `samples`, `dm`, `usable` and `pasture` onto every record unconditionally,
which is precisely what a cover crop record must not get — so a shape graft in the
ladder is the bug this restructure had to undo. **Never guess a record's type from
its shape**: an empty record of either type looks the same. An unknown `calcType`
from a future build is coerced to the default, never dropped.

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

**`kind` is the FILE marker and `calcType` is the RECORD discriminator. Do not
conflate them.** `kind` answers "is this one calculation or a whole list", and it
is checked **first**, before anything is read out. `calcType` answers "which
worksheet made this calculation", and it is what makes an upload need no chooser:
the file says so itself. `importCalcJSON()`'s gate is `looksLikeCalculation()` — a
known `calcType`, **or** the legacy `samples` array for a file exported before
`calcType` existed. Still never "whatever parses".

`tag` and `sortIndex` describe one device's list. `exportCalcJSON()` strips them
and **keeps `calcType`**, which describes the calculation rather than the device;
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
through `openSavedCalc()`, asks nothing, and restores the working calculation, the
**active calculator type**, the tab and `setupOpen`. Two traps, both easy and both
silent: capture `getCalculation(borrowedType)` and **not** `getCalculation()`, or
printing a cover crop record while perennial is on screen clobbers the wrong
working slot; and restore `setActiveType()` **after** `setCalculation()`, which
sets it. Cancelling the print dialog otherwise left the user
standing in a calculation they never opened. The swap back runs on `afterprint`,
**not** off `print()` returning: on a phone `print()` can hand back before the
sheet appears, and the page would be swapped out from under it. `step` and
`maxStep` are left alone, since print forces every step visible anyway.

Figures for an exported image or spreadsheet are **recomputed** with
`computeRecord(record)` — the record's own descriptor resolving and computing it —
never read from the record's stored `results`. Same rule as reopening one.

### Where the data lives is stated, not only linked

`footer()` in `main.js` renders on every tab and states it in one sentence
(`.footer-privacy`), with a `privacy` definition behind *Read more* and the same
fact at the end of the how-to's *Saving your work*. **None of it prints** —
the print block hides `.footer`, not just the buttons in it. The footer is site
furniture, and on paper the sentence reads as a caption to the figures above it
rather than as a note about the app. The three places the promise is made are all
on screen, which is where it is being made.

**`footer()` takes no arguments, and one sentence covers every tab.** It used to
take the tab, because the cover crops tab was a cross-origin JotForm and
submitting it sent the entries to JotForm — the blanket line was a promise the app
could not keep there. The native cover crop calculator removed the exception, and
the parameter went with it.

That is a rule and not just a tidy-up: **a second sentence must not come back
unless a tab genuinely sends data somewhere.** The one thing that still leaves the
device is the *link* to SDSHC's older JotForm at the foot of the cover crop setup
screen, and that link carries its own warning where it sits, in `.cc-jotform`.
Warning about another site in the footer of every screen would say "your data is
safe here, except" on tabs where there is no except.

Three places carry the promise and they move together: `.footer-privacy`, the
`privacy` definition's last paragraph, and the end of the how-to's *Saving your
work*.

The footer carries the how-to link and the privacy line and **no exports**,
unlike farm-budget's copy. Step 5 and a card's *Save as* already carry those, and
a set at the foot of the page would act on the working calculation while the
Saved tab shows records that are not it.

### The shared design system does not drift

`src/styles.css` is shared with SDSHC-farm-budget and the Virtual Fence ROI tool.
A change there belongs in every tool or in none of them. **App-specific rules go
in `src/app.css`.** One deliberate divergence, in `app.css`: the topbar never
wraps here.

Every cover crop style is in `app.css` — `.saved-kind`, `.saved-kinds`,
`.cc-jotform` and the rest — and **no token was added to `styles.css` for it**.
`test/themelab.test.js` asserts that `GROUPS` in `themelab.js` and `:root` in
`styles.css` agree in both directions, so a new token there fails the suite in a
file that has nothing to do with the feature. The badge tints are `color-mix()`
over tokens that already exist.

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

Source files live in `public/forage-images/`, and cover crop photography will
live in `public/covercrop-images/`. They are precached, so they are the app's
offline install size: **keep every file under about 500 KB and the long side at
1400px**, in webp. Workbox refuses anything over 2 MB and fails the build.

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
- A cover crop season carries `photos: []` under the same rule, flattened by
  `registerSeasonSet()` in `setup-covercrop.js`. **All three are filled** — one
  stand per season, in `public/covercrop-images/`. The cool one is portrait and
  the other two are landscape, which is fine: the card thumbnail is a 4/3
  `object-fit: cover` crop either way, and the viewer is `contain`. The season
  cards are the cover crop worksheet's only photo slots; its steps carry no media
  panel, unlike perennial's.

Still wanted, and the dead files to clear: see *[DESIGN-NOTES.md](DESIGN-NOTES.md)*.

## Deployment

`vite.config.js` sets `base: '/SDSHC-grazing-calculator/'`. `index.html` uses
`%BASE_URL%` for public assets — a `./`-relative URL resolves against the current
page, which breaks on any path but the site root.

`routeCopies()` in the same file writes `index.html` again at `/perennial`,
`/cover-crop`, `/saved` and `404.html`, because Pages serves files and not
routes. It must stay **last** in `plugins`, after VitePWA, so the copies are not
precached. See *Every tab has an address*.

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

- `demand()`, `daysFrom()`, `acresFrom()` and `animalsFrom()` are exported
  separately from `calc.js` because both models use them. The two worksheets
  share their arithmetic from step 3 on and share nothing at all before it.
- `public/covercrop-images/` holds the three season photos and nothing else. The
  cover crop steps have no media panel at all, so the photography wanted for them
  in [DESIGN-NOTES.md](DESIGN-NOTES.md) needs a slot before it needs a file.
- jsdom loads no CSS, so `el.hidden` in `test/app.test.js` reflects the attribute
  rather than what a browser paints.

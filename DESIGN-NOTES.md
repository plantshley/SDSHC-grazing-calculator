# Design notes

The long-form reasoning behind the rules in CLAUDE.md.

CLAUDE.md keeps the rule and the name of the thing it applies to, because it is
loaded into context on every session and length there is a running cost. This
file keeps the *why*: the failure each rule came from, the alternative that was
tried, and the detail you need before changing one. Headings here match the
headings in CLAUDE.md.

Read the matching section here before changing anything the CLAUDE.md rule
covers. A rule with its reason removed is a rule someone will "simplify" away.

---

## `src/calc.js` is pure

No DOM, no imports, no side effects, no I/O. It is the only place the worksheet
math lives, and its purity is the only reason it can be tested against the paper
worksheet independently of the UI. The dry matter lookup lives in `state.js` for
exactly this reason.

Every guard is carried over from SDSHC-farm-budget, where each one came from a
bug that put a wrong figure in front of a producer.

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

---

## Blank is not zero, and an unanswered goal has no answer

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

The same shortfall is said twice, in two places, from one source. `missing` is
per goal and drives the dash and the note on each result card. `missingByStep`
sorts the same keys by the step that ASKS for them, via `STEP_INPUTS`, and
drives the note on each step. Both count only the goals actually selected, so
nobody is warned about a herd size for an answer they did not ask for.

`STEP_INPUTS[4]` is deliberately empty: step 5's inputs are already named by the
result cards sitting on it, and a second note above them saying the same thing
in different words reads as two separate problems. `STEP_INPUTS` (which step
COLLECTS an input) and `STEP_FIELDS` in `main.js` (which branches a step's Clear
empties) are different questions and are deliberately not merged.

The step note is rendered **only for a step the user has already tried to
leave** with something outstanding — `warnedSteps` in `main.js`, session state,
not a preference. A step is blank when you arrive on it, so a note on arrival
tells you what you can already see, on every step, every time. That is the kind
of warning people learn to read past, which is worse than none.

`mayLeaveStep()` is one speed bump, not a wall: the first press stays put and
shows the note, a second press goes through. A partly filled worksheet still
shows every sub-result it can, and refusing to move would stop someone reading
ahead to see what a later step is going to ask for. Going BACK is never
blocked — that is what the stepper is for.

Once rendered, the note is a `[data-step-missing]` placeholder refreshed by
`updateOutputs()`, not markup built at render time, for the usual reason: it has
to clear itself on the keystroke that fills the box, not the next time the page
is rebuilt.

---

## The worksheet's constants are not "corrected"

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

Going the other way, from a preset back to Other frame, empties the box. The
first build left the figure there, on the reasoning that starting from something
beats starting from blank. That was wrong for a reason the frame question makes
specific: 0.96 sq ft is a perfectly plausible size for somebody's own frame, so
a producer who pressed "Other frame" because they do not own either hoop was
shown a number that looked like an answer, with nothing on screen to say it was
the small hoop's. Blank is this app's way of saying a question is outstanding,
and that is exactly what the question now is.

Only when LEAVING a preset, though. Pressing "Other frame" while already on it
is not a change of mind about the frame, and wiping a measurement somebody
typed would be the worse failure of the two — which is why the handler reads the
old key before overwriting it rather than testing the new one alone.

---

## Exhibit 4-2 lives in one file

`src/data/forage.js` is the only copy of the NRPH dry matter table. It feeds the
stage picker, the chart modal, the forage picker and the mix builder. **A
percentage must never be written into markup or into a stored record.** Storing
a resolved percentage would scatter copies of the table through saved
calculations, and a correction to the table would not reach records already
written. `state.js` `resolved()` looks it up at compute time.

`test/forage.test.js` transcribes the table a second time, independently, rather
than looping over the source. A test that reads its expectations out of the
thing it is testing proves only that the file can be read.

---

## Adding an input means touching three places

Markup in `src/ui/*` -> the factory in `src/state.js` -> `src/calc.js`. Inputs
declare `data-path="demand.animalWeight"` and one delegated listener in
`main.js` writes by path, so a new field needs no handler, but it does need to
exist in the factory and be consumed by the model.

---

## Computed figures are `[data-out]` placeholders, never template literals

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

### The autosave says so

The working calculation has always been written on every keystroke, and until
now the only evidence of it was that a reload did not lose anything. That is
evidence you get by risking the thing you are worried about. `[data-autosave]`
in the sticky bar says "Saving…" while the 400ms debounce is pending and
"✓ Saved" once `saveWorking()` has returned, painted by `paintAutosave()` from
`refresh()` for the same reason the figures beside it are placeholders.

Four decisions in it are not obvious.

It renders only when the calculation is already in the saved list, off the same
`saved` flag the button beside it reads. The first build showed it always, which
put "✓ Saved" immediately next to a button reading "Save calculation" — two
statements about saving, disagreeing, six pixels apart. Of the two the button is
the one that matters, because it is the difference between work that survives
this browser being cleared and work that does not. Once the record is in the
list the button reads "Edit saved" and there is nothing left to contradict.

It is **not** an `aria-live` region. Polite live text is the reflex for a status
that changes, and here it would announce "Saving, Saved" after every character
typed, over the top of the field being filled in. A screen reader user gets a
plain readable label instead, in a bar they can reach whenever they want it.

Its resting state before anything is typed is **empty**, not "Saved". A bar
claiming the work is safe over a form nobody has touched is reassurance about
nothing, and it spends the credibility that makes the real "Saved" worth
reading.

And the failure state is the reason the whole thing earns its place. `storage.js`
never throws and the autosave is silent by design, so a full quota or a
locked-down Safari lost every keystroke with nothing anywhere to say so. "✕ Not
saved" in `--cost` is the first thing in the app that reports it. The bar has
room for two words, so the sentence behind them is a `title`; nothing that
matters is only said there, because an explicit save that cannot be written
still raises its own alert.

---

## `openModal()` hands back a NEW body element every time

Callers wire their own controls by adding a listener to the element `openModal`
returns. Reusing that node keeps every one of those listeners alive for the life
of the page: the save dialog's colour swatches were also being handled by the
colour dialog opened ten minutes earlier, so clicking one re-tagged whichever
card that dialog had been about and closed the modal out from under the save.

So `openModal()` builds a fresh `.modal-body` and replaces the old one, which
drops the listeners with it. **Do not "optimise" this back to `innerHTML` on the
existing node.**

---

## `?` explains and never changes a value

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

---

## One dialog owns a saved calculation's identity

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

### The head is one flex container, and the card lost a line

The file controls belong beside "+ New calculation" on a desktop and below the
filter's hint on a phone. `order` is the only mechanism that moves a box between
those two places without rendering it twice, and `order` works between siblings
only — so the filter box and its hint are rendered inside `.saved-head` rather
than under it, taking a full row of it each. Splitting them back out into the
box is the change that would break the phone layout with nothing failing.

The card itself carried the goals twice: once as a comma list on the meta line
("Grazing days, Acres needed, Animals allowed") and again immediately underneath
as the labelled figures for those same three goals. The list went. It was the
line that cost the most height and said the least, on a card that is one per row
on a phone and therefore the whole reason the Saved tab scrolls.

The sizes came down at every width, not only on a phone. A saved list is
somebody looking for one pasture among eight, so the cards are built to be
scanned rather than read, and the desktop grid puts three or four of them across
a row where the height of each one decides how much of the list is on screen at
once. Only the name holds its weight: everything under it answers "is this the
one", and a list stops being skimmable the moment every line on a card is as
loud as every other. So the name comes down least and the meta line comes down
most, and the phone takes one further step from there rather than being a
separate set of sizes.

This is also the one place mono reduces a FIGURE, against the rule in the block
above it. The saved-card figures are three short labelled lines on a card that is
already the tightest thing in the app, not a column anybody reads down. The
figures the face was chosen for are the readouts and the chart, and those keep
their sizes.

That left `.saved-figs` starting at the card's padding while the name and meta
above it start past the drag handle, which read as two blocks rather than one
card. `--grip` on `.saved-card` is the handle's width less its negative margin
plus the gap after it, and it indents the figures by the same amount. A variable
rather than a repeated 26px, because three rules have to agree about it and the
handle keeps its size on a phone while everything around it comes down.

---

## Clearing is per step, and it names its own scope

Each step head carries a **Clear**, right-aligned, in the wizard and under "Show
all steps" alike. It empties that step and nothing else, from `STEP_FIELDS` in
`main.js`, whose values come from `newCalculation()` — so blanking a new field
correctly means adding it to the factory and nothing else.

There is no Clear in the sticky bar and there must not be one. A single button
that empties whatever happens to be on screen has to be read carefully every
time; sitting on a step's own head is how this one says which step it means,
which is also why it needs no confirm.

**+ New calculation** (chip row, and the Saved tab header) drops the whole
record, including the goals and the forage type, and lands back on the setup
screen with a new id. It is the only way to a genuinely blank start.

---

## "Unsaved" means "not in the list", not "not saved recently"

The working calculation autosaves on every keystroke, so nothing is lost by
closing the page. It IS lost by REPLACING the working calculation, which
`+ New calculation` and `open-calc` both do.

So `confirmLeavingUnsaved()` asks one question: is this calculation's id in
`listCalcs()`? If it is, the figures on screen are a copy of a record that
survives, and the user is not asked. An untouched form is not work and is not
asked about either. **Do not "improve" this into a dirty-flag check** — it would
warn about the autosave, which is the thing that cannot be lost.

`go-saved`, behind the To Saved button on step 5, is the other half of the same
idea: a button that says "to saved" must not land on a list this calculation is
missing from, so it writes the record first if there is not one.

---

## `storage.js` never throws

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

---

## The shared design system does not drift

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

That divergence is what makes the third font choice a layout question. At 320px
the row is a logo, three pills and a theme toggle inside 288px, and it does not
fit: the wordmark alone is 168px at its natural height. Four things were on the
table. Letting the topbar wrap below 420px was rejected because it undoes the
divergence above for the one width it was written for. Shortening the labels to
"Br / Cl / Mo" was rejected because a font control nobody can read is worse than
no font control. Squeezing the wordmark to 80px was tried and is an illegible
smudge, which is the same objection. What ships instead is a second image: the
square mark, already in `public/` as the PWA icon so it costs nothing in the
precache, swapped in below 440px with `display: none` on the wordmark. Same
rule as the two titles — exactly one is in the page at any width.

Mono is the third face, and it is the one that changes sizes. A monospaced stack
sets every glyph on the same advance, so at a given px size it reads bigger than
the proportional stack. On the figures that is the point: a column of sample
weights and a row of dry matter percentages line up without asking for
`tabular-nums`. On the prose it is not. The hints, notices and card sub-labels
are deliberately quieter than the thing they are about, and in mono they stopped
being quieter, so the small prose comes down one step and nothing else moves.

Two ways to do that were considered. A scale factor on a container is one rule
instead of thirty, and it was rejected because `font-size` on an ancestor takes
the inputs and the readouts with it — including the 16px on `input, select`,
which exists to stop iOS Safari zooming the page on focus and not zooming back
out. So the reduction is written per selector. The box sizes themselves come
down only under `@media (hover: hover)`, which is the media feature that names
desktop; iOS Safari reports `hover: none` and keeps its 16px. Placeholders use
`1em` rather than a px figure so one rule scales every box proportionally
without knowing which boxes are narrow.

Both mono blocks sit last in their file, and that is load-bearing rather than
tidy: the rules are one selector deep, so any `.something .hint { font-size }`
added later anywhere in either sheet beats them. Where something already is two
deep — `.forage-card .pick-sub`, `.sticky-links .tip` — it is matched at that
depth rather than written short and left silently not working.

Rules that outlive any one app: `--green` means a positive number, not an
action. `--sky` is the one loud button per screen and the KPI card edge. Colour
is never the only signal.

`--cost` / `--cost-bg` is for something to go and fix: `.result-missing`,
`.step-missing`, `.start-warn`, `.warn-list`. `--info-bg` is for something to
read. A dash where a figure should be is the first kind, not the second.

### Traps in `styles.css`

- **`input, select` carries `min-height: 44px`**, for a thumb. `min-height`
  beats `height`, so shrinking a checkbox with `height: 17px` gives a 17px-wide
  control that is still 44px tall. `.needs-list input` has to say
  `min-height: 0`, and any other small control will too. The 44px target is not
  lost where a `<label for>` sits beside it on a full-width row.
- **`.field-label > label` carries `margin-top: 9px; margin-bottom: 1px`**, and
  `align-items: center` centres each item's MARGIN box. So a sibling with no
  margins sits 4px above the label's text. `.field-label > .help-btn` takes the
  same two margins; that, not `align-self`, is what centres it. `vertical-align`
  does nothing at all to a flex item.
- `.field-label` is a **wrapping** flex container. To move its text down inside
  reserved height, use `align-content`, not `align-items`: `align-items` sets
  the text on the floor of the box while the `?` stays centred in it.
- `.result-row` forces one row above 640px with `grid-auto-flow: column`, not
  `auto-fit`. `auto-fit` off a 260px minimum breaks three answers onto two lines
  in a half-screen window, and the one left underneath reads as an afterthought.

---

## Photo and media slots

A filled slot is `{ src, alt, credit }`, where `src` resolves against
`import.meta.env.BASE_URL` and must not start with `/`. Credits render under the
photo in the viewer, and an absent one renders as nothing. A `null` slot renders
a labelled placeholder with the same shape, the same tap target and the same
viewer, so filling one in is a data-file edit and no code change.

Source files live in `public/forage-images/`. They are precached by the service
worker, so the folder is the app's offline install size: **keep every file under
about 500 KB and the long side at 1400px**, in webp. Workbox refuses anything
over 2 MB outright and fails the build, which fails the deploy.

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

---

## Deployment

`vite.config.js` sets `base: '/SDSHC-grazing-calculator/'`. `index.html` uses
`%BASE_URL%` for public assets: a `./`-relative URL resolves against the current
page instead, which is wrong the moment the app is opened on any path but the
site root.

`.github/workflows/deploy.yml` runs `npm test` before `npm run build`, so a
broken model blocks the deploy. Keep it that way.

### The browser bar colour is in three places

Changing `<meta name="theme-color">` on its own looks like it does nothing, and
there are two separate reasons for that, either of which is enough on its own.

The manifest carries its own `theme_color`, and it was left at the old value
while the meta was changed. An installed copy reads the manifest, not the meta,
so on a phone that had added the app to its home screen the old colour was still
the correct answer. On Android it is worse than stale: the colour is baked into
the generated WebAPK when the app is installed, so it survives a manifest change
until Chrome refreshes the APK on its own schedule or the user reinstalls.

And `index.html` is precached. The reload that fetches the new service worker is
still served the old document out of the cache, because the navigation is
answered before the new worker takes over. The second reload gets the new one.
Every "I changed it and deployed and nothing happened" in this app has this
shape; it is not specific to the meta tag.

A third copy exists on purpose. `BAR_COLOR` in `prefs.js` rewrites the meta from
`applyTheme()`, so the bar follows the in-app light/dark toggle. The obvious
alternative, two metas with `media="(prefers-color-scheme: dark)"`, was rejected
because the theme here is a stored choice that is allowed to disagree with the
system setting: a producer on a dark phone who picked light would get a dark bar
over a light page, and the media query has no way to know.

---

## Known limits

The cover crops tab embeds the JotForm, which is cross-origin and therefore
cannot be cached by the service worker. It does not work offline and says so.
The native replacement is specced in the plan: steps 3 to 5 of the perennial
worksheet are the same arithmetic as steps 2 to last of the cover crop
worksheet, which is why `demand()`, `daysFrom()`, `acresFrom()` and
`animalsFrom()` are exported separately from `calc.js`.

jsdom loads no CSS, so `el.hidden` in `test/app.test.js` reflects the attribute
rather than what a browser paints. Anything depending on the stylesheet has to
be checked in a real browser.

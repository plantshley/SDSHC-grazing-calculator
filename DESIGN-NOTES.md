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

The step note is shown **only for a step the user has already gone past** with
something outstanding — `warnedSteps` in `main.js`, session state, not a
preference. A step is blank when you arrive on it, so a note on arrival tells you
what you can already see, on every step, every time. That is the kind of warning
people learn to read past, which is worse than none.

`mayLeaveStep()` is one speed bump, not a wall: the first press stays put and
shows the note, a second press goes through. A partly filled worksheet still
shows every sub-result it can, and refusing to move would stop someone reading
ahead to see what a later step is going to ask for. Going BACK is never
blocked — that is what the stepper is for.

The note is a `[data-step-missing]` placeholder refreshed by `updateOutputs()`,
not markup built at render time, for the usual reason: it has to clear itself on
the keystroke that fills the box, not the next time the page is rebuilt.

### "Gone past" is every way forward, and only one of them is Next

`mayLeaveStep()` marks the one step being left, because it also has to decide
whether to stay on it. That is not the same question as "which steps are behind
me", and answering only the first left two holes.

The first: **a step filled in correctly on the way through is never bumped.** The
bump only fires on a step with something outstanding, so somebody who walks
1→2→3→4→5 answering everything ends on step 5 with `warnedSteps` empty. Take a
figure back out of step 3 later — a Clear, a box emptied to try another number —
and nothing anywhere says so, because as far as the set is concerned they have
never been past it.

The second: **the stepper can jump.** Pressing circle 4 from step 2 goes past
step 3 without ever standing on it.

So `markPassed(upto)` marks everything behind wherever the user has got to, and
it is called from every way forward there is. In the wizard: Next, and a circle
further along the stepper. Under **Show all steps**, where the wizard's two do not
exist:

- **turning the toggle on**, which is a statement in itself — it puts every step
  behind you on the page at once;
- **unfolding a later step**, the caret saying what Next says;
- **folding away the step you are in**, which goes past that step as well. This
  is the one that marks the step itself rather than only the ones above it, and
  it earns that by what it does to the screen: folding a step is what makes its
  head the only place left to say what it owes. Putting an unfinished step away
  and being told so as it closes is the whole gesture working;
- **working in a later step**, which is what carries a step that was already open
  when the toggle went on — you never opened it, so no caret spoke for it.

Going back never marks, on any route: arriving on step 2 to check a figure means
the opposite. Nor does unfolding a step mark that step itself — opening it is
arriving on it, and a step is blank when you arrive.

The typing route is the one that could not lean on Next at all. The gate above
was originally written at render time — `stepMissing()` returned an empty string
unless the step was in `warnedSteps` — and that was safe while the only way into
the set was pressing a button, because pressing a button renders. Under **Show
all steps** there is no Next. Every step is on the page at once, so the only
statement a producer makes about being done with step 2 is that they are now
typing in step 4, and a keystroke must not re-render the field being typed into.

So the gate moved off the markup and onto the section: `data-warned` on `.step`,
set by `markStepsBefore()` straight from the input listener, alongside the entry
in `warnedSteps` that the next full render will re-emit. An attribute is not
structure — nothing is replaced, nothing loses focus — and `updateOutputs()` is
already reading the DOM on that same `notify()`. `stepOutstanding()` in
`results.js` reads the attribute rather than taking the set as an argument, so
every caller of `updateOutputs()` gets the same answer without having to know the
rule.

`markStepsBefore()` bails out unless `showAll` is on. It would otherwise be a
second, silent route into `warnedSteps` for a mode that already has an explicit
one, and the two would disagree the moment the wizard's speed bump was tuned.

### A folded step cannot show its own note

Which is the hole the count on the head fills. Under Show all steps the note is
in the page and correct, and folded out of sight: the one step that has something
to say is the one whose body is shut. `[data-step-pill]` is that note reduced to
`2 missing`, sitting on the head where the fold cannot hide it.

Three things had to be settled:

- **Only while the body is shut.** Open, the note is two lines under the head
  saying the same thing at length, and one shortfall said twice in one box reads
  as two problems.
- **After the `?`, not inside the toggle.** Inside, it lands between the title and
  the `?` and pushes the `?` along — the same drift `.step-toggle { flex: 0 1
  auto }` exists to prevent. The toggle points at it with `aria-describedby`
  instead, so the count reaches a screen reader with the button rather than only
  as text alongside it. A hidden target is ignored, so the wiring needs no
  undoing when the count stands down.
- **It says "missing".** `--cost` carries it, but colour is never the only
  signal, and a bare red dot on a step head is a fault light rather than a count.

Below 640px it moves to its own line under the title and drops a size. The head
row is already the step badge, the title, the `?` and Clear on a row that is not
allowed to wrap, and the title is the item that gives way — so on a phone the
count would be taking width off the one thing on the row that says which step
this is. On its own line it has nothing to compete with, which is also why it can
afford to be smaller there than it is on a desktop.

The first attempt was `flex-wrap: wrap` and the break alone, and it moved the
wrong thing: the `?` dropped to a line of its own, above the count, on every head
that had one. A wrapping flex container does not shrink an item to make room for
the next one, it starts a new line — and the toggle's hypothetical width is the
whole unwrapped title. So the toggle takes `flex: 1 1 0` at this width, which
lays the title out from a basis of zero, lets it fill the row and wrap inside
itself, and leaves the `?` and Clear where they were.

That inverts the desktop rule two sections up, deliberately. There, a toggle that
fills the row pushes the `?` away from a title that had room beside it. Here
there is no room: the title wraps to two lines either way, so filling the row is
what gives the `?` **one** position — immediately left of Clear, the same on
every head, whether or not that head has a count. Otherwise it sits wherever the
last word of the title happens to end, which is a different place on each of the
five steps and a different place again once a box is filled in.

The line break itself is a full-width `::after` on the head, ordered between
Clear and the count, so the line above keeps its arrangement exactly rather than
being re-flowed. It is inside `:has(.step-pill:not([hidden]))` because an
unconditional empty flex line still costs the row `gap` on every head, in the
mode whose whole point is fitting five of them on a screen. Where `:has()` is
missing the count stays on the row, which is the desktop layout and was the only
layout before this.

The indent that puts the count under the title rather than under the chevron is a
measured constant: chevron, gap, badge, gap. CSS has no way to ask the badge how
wide it turned out — it is inside the toggle, so it is not a track of anything
the count belongs to — and the alternatives were worse. Six characters of 11px
bold caps land within about three pixels across the three font choices, and three
pixels out under a title still reads as aligned.

Print hides it. The print block forces every `.step-body[hidden]` open, so the
note itself prints — the count would be the same sentence again, in fewer words,
two lines above it.

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

### The one thing that does not refresh as you type

The sample spread note. Everything else `updateOutputs()` touches is a figure: it
sits in one place and its value changes, and refreshing it on every keystroke is
exactly right. The spread note is a three-line paragraph that appears, rewrites
itself and vanishes, and it is a **judgement of the entry** rather than a figure
worked out from it.

Refreshed as you type it was wrong twice over. It moved the boxes below it around
under the thumb, and worse, mid-number it was judging a figure that was not all
there: 1 in the first box and 100 in the second is a wide spread while the 100 is
still "1", so the note appeared telling somebody to go back out and clip more
spots on the strength of a digit they were in the middle of typing.

So it is settled once per ENTRY rather than per keystroke, and "settled" is the
word rather than "hidden". `updateOutputs(res, root, {spreadNote})` takes the
decision from `editingSamples` in `main.js`, which the `input` listener sets when
the field being typed into is a weight box and which `focusout` and `focusin` on
`app` clear. When the flag is up, the function **does not touch the paragraph at
all**: it holds whatever it last said.

Both halves of that took a correction, in opposite directions.

The first version was gated on "the caret is in step 1", which meant entering five
weights in a row showed nothing until the user tapped somewhere else on the page.
Tapping the next box is exactly the moment the previous weight is finished, so
leaving a weight box for another one now settles the note rather than suppressing
it. Both events are wired because `focusout` fires before focus lands anywhere, so
it is the one that catches the move, while `focusin` covers focus arriving from
outside the app with no `focusout` seen here. `render()` clears the flag too,
because replacing the markup drops focus to the body.

The second version then hid the note on the first keystroke into the next box,
which is the same flicker approached from the other side: the note appears when you
tap box 3, disappears as you type in box 3, and comes back when you leave it. A
paragraph that behaves like that reads as a fault in the page. Freezing it instead
means it can be **stale by one part-typed weight**, and that is the right trade:
it is advice about whether to clip more spots, not a figure anybody reads off.

Nothing else on the page changed. A figure that sits still while its value changes
is not the same kind of thing as a sentence that comes and goes.

### The autosave says so

The working calculation has always been written on every keystroke, and until
now the only evidence of it was that a reload did not lose anything. That is
evidence you get by risking the thing you are worried about. `[data-autosave]`
in the sticky bar says "Saving…" while the 400ms debounce is pending and
"✓ Saved" once `saveWorking()` has returned, painted by `paintAutosave()` from
`refresh()` for the same reason the figures beside it are placeholders.

Four decisions in it are not obvious.

The reassuring states appear only for a calculation already in the saved list.
The first build showed them always, which put "✓ Saved" immediately next to a
button reading "Save calculation" — two statements about saving, disagreeing, six
pixels apart. Of the two the button is the one that matters, because it is the
difference between work that survives this browser being cleared and work that
does not. Once the record is in the list the button reads "Edit saved" and there
is nothing left to contradict.

The second build fixed that by gating the ELEMENT on the same flag, and that was
worse in a way that took a review to see. The failure state was then unreachable
in the only situation it was written for: a browser refusing to store anything
loses every keystroke, and the work most likely to be lost that way is work
nobody has saved yet. `paintAutosave()` no-ops on a missing element, so the one
message that must never be silent was silent exactly where it mattered. The
element is now unconditional, `data-listed` carries the flag, and the decision is
in one function — the reassuring states obey it, the failure ignores it.

The write is also flushed on `pagehide` and `visibilitychange`. 400ms is a small
window, and closing a tab is the moment somebody is most likely to be inside it.
Mobile Safari widens it: it suspends timers when a tab is backgrounded, so a
pending save can simply never run. Not `beforeunload` — iOS does not fire it
reliably, and it is the wrong tool anyway, since this asks nothing and blocks
nothing, it only stops waiting.

And on `set-tab` and `go-saved`, which is a different reason for the same call.
The write now updates the saved record as well as the working copy, and the Saved
tab is about to draw that record. 400ms is easily long enough to type a figure and
tap a tab, and a list drawn from the store a moment before the store is written is
one edit behind with nothing to redraw it.

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

### A card obeys "blank is not zero" too, and did not

The card reads the record's stored `results` and formats them itself, which put it
outside `updateOutputs()` and therefore outside the rule that renders `null` as a
dash. Every formatter in `format.js` passes its argument through `finite()`, whose
job is to stop an overflow reaching the screen, so `days(null)` is "0 days".

A calculation saved half way through has `grazingDays: null`, which is the model
saying it will not guess. The card said **Grazing days: 0 days** — not a blank, an
answer, and the worst available one: zero days is what a pasture with nothing
growing on it would carry. `figure()` in `saved.js` guards `null` and `undefined`
before the formatter, so the card shows the same dash the results block does.

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

### It stays a `confirm()`, and a modal was tried

The browser's dialog reads *"…will lose it. Save it first, or continue?"* and then
offers **OK** and **Cancel**, because those are the only words a browser will put
on those buttons and no page can change them. OK is the word for agreeing with a
statement rather than for choosing between two outcomes, so a version was built on
`openModal()` with **Continue** and **Go back** on it, focus resting on the answer
that keeps the work.

It was reverted. A modal cannot block, so `confirmLeavingUnsaved()` had to take a
callback instead of returning a boolean, `openSavedCalc()` had to take an `after`,
and `new-calc` had to wrap its whole body in a closure — three call sites turned
inside out so that one button could read "Continue". The words were not worth the
shape of the code, and the same trade would come up again for Delete and Restore,
where OK is the right word anyway: those are statements of consequence with a
plain yes on the end.

Worth knowing before anybody tries it a second time: the two-button version is
about twenty lines and works fine. The cost is entirely in what it does to the
callers.

---

## "Saved" means one thing: the record matches the screen

Save a calculation half way through, which is the normal way to use this — one
pasture, entered in the pasture, before the herd figures are known. Then finish it.
The Saved tab went on showing the figures the record held at the moment it was
saved, while the sticky bar over the top of the same calculation said "✓ Saved".

Both statements were true, of different things. The bar meant the working copy had
been written to its own key. The card meant the record had been written when Save
was pressed. Nobody can be asked to hold that distinction in their head, and the
Saved tab is the place people go precisely to see what they have.

So the autosave writes both. `writeEverywhere()` calls `saveWorking()` as before
and then `syncSavedRecord()`, which writes the record **only if this calculation is
already in the list**. Nothing there creates a record: the Save button still
decides what is kept, and a calculation nobody has named stays out of the tab.

Two guards make that safe to run on a 400ms debounce.

`syncSavedRecord()` compares a `fingerprint()` of the record with one of the
working copy and returns early when they match. This is load-bearing rather than an
optimisation: opening a saved calculation replaces the working copy, which
notifies, which lands here — so without the check, **opening** a record would
rewrite it, move the date on its card, and jump it to the top of a list nobody had
reordered. Looking is not editing. The fingerprint leaves out everything the store
owns (`updatedAt`, `createdAt`, `sortIndex`, `schemaVersion`, `tag`) and `results`,
which are worked out from the rest.

A `Conflict` — another tab wrote this record after this tab last read it — is left
alone rather than asked about. A question belongs to a button somebody pressed, not
to a keystroke, and `persist()` behind the Save button still asks it. The working
copy is written either way, so nothing typed is at risk while that stands.

What this gives up is worth stating. `openSavedCalc()` used to be able to say the
record was opened as a scratch copy, so poking at a saved calculation could not
damage it. That protection was mostly imaginary: the bar invited "Edit saved" two
inches away, there has never been a discard, and the autosave had already made the
change permanent in the working key. What it bought in exchange was a Saved tab
that could be three steps behind the screen with nothing anywhere to say so.

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

## Where the data lives is stated, not only linked

Somebody is asked to type their sample weights, their herd size and their acres
into a web page, at a workshop, often on a borrowed device. The honest answer to
"who can see this?" is one tap away rather than something they have to ask a
person about, and it is in three places on purpose:

- **A sentence in the footer, on every tab** (`.footer-privacy`): *Everything you
  enter stays on this device.* This is the one that matters. A page about it
  somewhere is not the same answer as a line they cannot miss.
- **A `privacy` definition**, opened by the *Read more* link beside it. Read-only
  like every other `?` — it is not a grazing term, but it is the same kind of
  thing.
- **The *Saving your work* section of the how-to**, which already ended on it.

**The sentence survives printing and the link does not.** The print block hides
`.footer button`, so a worksheet handed to a landlord or an NRCS office still
carries the statement, and it is still true on paper.

It is also the one line in the footer with a **width**, `max-width` plus auto side
margins in `app.css`. Set to the full width of a desktop page it was a single long
row of small grey type, which is the shape of something nobody reads, and this is
the one line in the app that has to be read. `margin: auto` rather than centred
text on a full-width box, so the block sits under the middle of the page instead of
being centred text pinned to the left edge. In `app.css` and not the shared sheet:
the width was chosen for these sentences, and `styles.css` belongs to three tools.

The **cover crops tab gets a different sentence**, and this is the whole reason
`footer()` takes the tab at all. That tab is a cross-origin JotForm: submitting
it sends the entries to JotForm, so the blanket line would be a promise the app
cannot keep on one of its three tabs, which is worse than making no promise. It
names JotForm, says the submission goes to them, and confines the guarantee to
the rest of the calculator. The `privacy` definition carries the same exception
in its last paragraph, so the long answer and the short one agree.

Two things farm-budget's copy of this footer has that this one deliberately does
not:

- **No export links.** Farm-budget's footer carries *Export budget CSV*, *Save
  budget file* and *Print*, acting on the working scenario. Here step 5 already
  carries *Save as image*, *Export CSV* and *Print or save as PDF*, and a card's
  *Save as* carries the same four for a stored record. A second, quieter set at
  the foot of the page would act on the **working** calculation while the Saved
  tab is showing a list of records that are not it — the same mistake the
  `kind:` check on the two file formats exists to make impossible.
- **The how-to link stays**, even though the header `?` opens the same guide.
  They are one action, so there is nothing to keep in step, and at the bottom of
  a five-step worksheet on a phone the spelled-out label is the findable one.

This documents a fact about the current build. If anything is ever submitted
anywhere from the perennial tab, these three places are what has to change
first, before the feature ships and not after.

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

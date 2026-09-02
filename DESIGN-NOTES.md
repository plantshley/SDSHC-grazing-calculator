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

## One registry, parallel calculators

The app held **one** working calculation and one worksheet's worth of steps. The
cover crop worksheet needed a second of each, and the honest question was whether
that is one calculator with a switch in it or two calculators sharing a frame.

**The alternative that was rejected: one `compute()` with branches.** It is the
obvious move, because the two sheets look similar — five steps, the same three
answers, the same result cards. They are not similar where it counts. Steps 3, 4
and 5 are the *same arithmetic*: usable forage, herd demand, days / acres /
animals. Steps 1 and 2 share nothing at all — one clips, dries and weighs samples
against a frame area and a dry matter percentage; the other reads an average
height off a yardstick against a season's production rate. A merged model is a
function whose every line before step 3 sits behind an `if (calcType === …)`, and
whose test file has to assert that each branch does not reach the other's fields.

What the two actually share is the **arithmetic**, and that was already shared
before any of this: `demand()`, `daysFrom()`, `acresFrom()` and `animalsFrom()`
have been exported standalone from `calc.js` since the first build, for exactly
this. So the split is two pure models importing the same primitives, and no
branch anywhere.

The registry is what stops that becoming two of everything else. A descriptor in
`src/calculators.js` names a worksheet's model, factory, renderers, handlers,
report rows and saved-card meta; `main.js` reads whichever one is active. The
stepper, `warnedSteps`, `markPassed()`, `mayLeaveStep()`, the autosave, the
fingerprint guard, the drag order, the print block — none of them learned that
there are two worksheets. **Adding a third is a row in the registry and the
modules it names.**

Three things about the shape are load-bearing:

- **`calculatorFor(calc)` defaults an absent `calcType` to perennial.** Every
  record written before the discriminator existed has none, and they are all
  perennial. Without the default, opening, exporting or printing an old record
  renders nothing — and `test/export.test.js`'s fixture, which has no `calcType`,
  is the standing check that it still works.
- **A descriptor is handed `render()` rather than importing it.** `main.js` owns
  the page. A UI module reaching back into `main.js` closes an import cycle, so
  the handlers take a `ctx` of `{ render, closeModal, root }`, built once because
  they are called on every keystroke.
- **`calculators.js` reaches the whole UI, so `storage.js` and `export.js` stay
  out of it.** `storage.js` promises never to throw and must not depend on the UI
  to know a record's shape; that lives in `schema.js`, which imports nothing.
  `export.js` is imported *by* `main.js`, not the other way round.

`state.js` holds a **map** of working calculations rather than a variable, one
slot per type, created lazily — somebody who never opens the cover crop tab never
gets a cover crop record written to their browser. `setCalculation(calc, type)`
makes the written slot active in the same call, because every caller wanted both,
and splitting them leaves a hole where `notify()` fires about record X while
`writeEverywhere()` reads whatever slot happens to be active.

---

## Every tab has an address

The three tabs were one URL. Somebody sending a colleague to the cover crop
worksheet had to send the address and then say which tab to press, and a
bookmark landed on whichever tab that browser was last on.

### Paths, not a hash

`#/cover-crop` needs no build step at all, which is the whole of its case. It was
rejected because the address is the thing being shared: it goes in an email, on a
handout, and read out at a workshop, and a hash reads as a fragment of a page
rather than as a page. The build cost turned out to be one plugin of a dozen
lines, because GitHub Pages resolves `/cover-crop` to `cover-crop.html` sitting
beside `index.html`, so a copy of the document at each route is the whole
mechanism. `404.html` is the same copy again and covers a host that will not do
that, and any route dropped later.

The copies are written **after** VitePWA has generated the service worker, and
that ordering is deliberate rather than incidental. Written before it they would
land in the precache manifest: four more copies of a document already precached,
paid for in install size on a phone, to answer a request `navigateFallback`
answers offline anyway. Their only job is the very first visit, which is the one
visit that is online by definition.

### Replaced, never pushed

The tempting version pushes a history entry per tab, so Back walks the tabs. It
was not built, and the reason is the installed copy: on Android, Back is how you
leave an app, and a session that had touched three tabs and printed something
would be four presses deep in a stack the user never asked for. Nothing about a
shared link needs a stack — it needs the address to name the tab, which
`replaceState` does, and the reload path proves it.

That also settles `printSavedCalc()` for free. It swaps a borrowed record onto
the screen, renders, and swaps back on `afterprint`, so it changes the tab twice
for something the user did not open. Pushing would leave an entry pointing at
somebody else's calculation. Replacing leaves nothing behind, so the borrow needs
no special case, which is why `syncURL()` could go in `render()` and cover all
eight call sites rather than being spelled out at each of them.

There is no `popstate` handler. Nothing pushes, so within the document there is
no entry to pop; leaving the site and coming back is a full load, which reads the
URL at boot like any other. A handler here would be code that cannot run.

### A slug is not an id

`covercrop` is a storage key on every record ever written; `/cover-crop` is read
by a person. Reusing the id as the slug would have saved a descriptor field and
tied a URL somebody bookmarked to a value that cannot be changed without a
migration. They are separate fields for that reason, and the test asserts the
slug is URL-safe and unique rather than asserting what it is.

### The list lives in two files

`vite.config.js` cannot import `calculators.js` — it would pull the whole UI into
the build config — so the slugs are written out twice, once in the registry and
once in the plugin. That is the failure mode this feature has: a third worksheet
whose slug is added to the descriptor and not to the build gets a working tab, a
correct-looking address bar, and a 404 for everyone it is sent to, on the first
visit only. Nothing on this device would ever show it. `test/router.test.js`
parses `ROUTES` out of the config and compares the two lists in both directions,
the same shape `test/themelab.test.js` uses for `GROUPS` against `:root`.

---

## Preferences are global; a place in a worksheet is not

`step`, `maxStep` and `openSteps` were flat keys in `prefs.js` when there was one
worksheet. With two, the question is which preferences follow the user and which
follow the worksheet, and the answer is not "all of them" either way.

**A place in a worksheet belongs to that worksheet.** Somebody halfway through
the perennial sheet who taps over to cover crops to check a figure must come back
to step 3, not to wherever the cover crop sheet had got to. So `step`, `maxStep`
and `openSteps` moved under `wizard[type]`.

**A way of working does not.** "Show all steps" is how this person reads a
worksheet — the same choice on both, and per-worksheet it would mean turning it on
twice and being surprised once. The theme and the font are the same argument, more
obviously. Those stayed at the top level, along with `tab`, which is a place in the
*app* rather than in a worksheet.

Two implementation details that are easy to lose:

- **`wizard` needs a deep merge over `DEFAULTS` in `read()`.** The shallow spread
  every other key uses would let a stored block holding only `perennial` leave
  `covercrop` `undefined`, and `getWizard('covercrop')` would hand back nothing at
  all rather than zeroes.
- **`migratePrefs()` is not dead code.** Anyone who has not opened the app since
  this shipped still has the v1 flat keys. Dropping them puts them back on step 1
  of a worksheet they were halfway through — a small loss, but the exact kind the
  autosave exists to prevent, and it would happen silently. A block already
  written by this build wins over the v1 keys, so a migration that runs twice
  cannot undo real work.

`checkedNeeds` needed a decision rather than a default. Its ids are
`${scope}:${key}` and both worksheets ask for `animalWeight`, `numAnimals` and
`totalAcres`, so `all:animalWeight` would be one tick shared across two tabs. The
cover crop setup renderer prefixes its scope `cc:`, making them separate. The
reasoning: the checklist is a **packing list**, not a record of what the app
knows. "Bring a gram scale" and "bring a yardstick" are different jobs on
different days, and ticking one off should not tick the other. The pref *shape*
was deliberately not changed for this — a prefix in one renderer is cheaper than a
second dimension in a stored key that every other checklist would then carry.

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

`src/calc-covercrop.js` is the second model and it holds the line one step out: it
imports the primitives above from `calc.js` and **nothing else** — not the season
table, not the utilization table, not `state.js`. `calc.js` itself still imports
nothing at all, which is the property that lets it be checked against the paper
worksheet with no UI in the room.

The cover crop model needed two clamps the perennial one has an idiom for but
could not simply inherit, because both go wrong *inside* a formula rather than at
its output, where `nonNegative()` would catch them:

- **Height below the anchor.** Warm and cool are `base + perInch x (h - 4)`, so
  four inches is the anchor and anything under it drives production negative
  through the subtraction. `productionAt()` counts it as 0 and says so, naming both
  the height entered and the anchor it falls under — rather than clamping at the
  end, where the warning would name a total nobody entered.
- **Residual at or above the stand height.** Available forage goes to zero or
  below, which is exactly perennial's "you are leaving at least as much forage as
  the sample says is there" case, and it reuses that branch's shape and wording.
  Same failure, same sentence.

---

## Blank is not zero, and an unanswered goal has no answer

`Number('') === 0`, which erases the difference between "you have not told me
the herd size yet" and "the herd size is zero". Left alone, leaving planned days
blank divides by zero, `safeDiv` returns 0, and the screen reads **"0 head
allowed"** — a wrong answer wearing the clothes of a right one.

With two models there are two `answered()`, and the rule became "each model has
exactly one, and it is the only place that decides this **for that model**". The
tempting shortcut is a shared `answered()` taking a field list; it was not taken,
because what counts as answered is a claim about *that* worksheet's inputs and
belongs beside them. `GOAL_INPUTS`, `STEP_INPUTS`, `INPUT_LABELS` and
`STEP_FIELDS` went per calculator with it, reached through the descriptor.

**`updateOutputs()` had to be told which label map to use, and this is the kind of
thing that fails quietly.** Its `labels()` helper turns an outstanding input key
into the words on screen, and it read perennial's `INPUT_LABELS` directly. Left
alone it renders a cover crop step's shortfall note as raw keys — `stand.height`
where it should read "average height" — with nothing thrown and no test failing
unless somebody looks at that exact sentence. It now takes
`{ spreadNote, labels = INPUT_LABELS }`, defaulting to the map it always used so
every existing call site is unchanged.

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

### A warning belongs beside the field that caused it

Every warning used to land in one `[data-warnings]` list on step 5. That put
*"the residual height you want to leave is at least as tall as the stand, check
the two heights"* three steps after both heights had scrolled off the screen —
and in the wizard, where one step is on screen at a time, it named two boxes the
reader could not see. The sentence was right and unusable.

Now each step has its own box and shows only what it raised. The mechanism is
`warningsByStep`, cut from the flat list at the step boundaries.

**Slicing rather than tagging is the decision worth keeping.** The obvious
alternative is to make every `warnings.push()` name its step, and it is worse in
the way that matters: a push naming the wrong step is wrong *silently*, and there
are pushes inside `nonNegative()`, `demand()` and `frameMultiplier()` in
`calc.js`, which is shared and knows nothing about steps. Both models already run
strictly in worksheet order, so the step a warning belongs to is simply where in
`compute()` it was raised. Recording `warnings.length` at each boundary and
slicing needs no cooperation from the primitives and cannot disagree with itself.

**The flat list stays.** The CSV's *Check these* block and the share image want
every warning as one thing, and an export is read away from the page where the
per-step split means nothing.

Moving the warnings onto their steps created the problem the missing-count pill
already had: under "Show all steps" a folded step's warnings are in the page,
still correct, and out of sight. So the head carries a second count, in the same
`.step-pill` styling, for the same reason and under the same shut-body-only rule
— with the body open the warnings are two lines below the head, and one problem
said twice in one box reads as two.

It differs from the count beside it in exactly two ways, and both are the point:

- **It is on the last step as well.** The missing count never is, because the
  result cards name their own outstanding inputs. But step 5 asks for the acres,
  so it can raise a warning while still being unable to owe an answer.
- **It is not gated on `data-warned`.** That gate exists because a step is blank
  when you arrive on it, so being told it is unfinished before you have been
  there is telling you what you can already see. A warning is about something
  already typed. There is nothing premature about it.

Reusing `.step-pill` rather than making a second style is not laziness: the phone
rules that wrap the head and indent the count key off `.step-pill`, and a second
class would have needed all of them again or would have silently missed them.

The one cost: in the wizard, standing on step 5, a warning raised on step 1 is no
longer on screen. That is the trade taken deliberately — the warning is there to
be *acted on*, and it can only be acted on where the field is. Under "Show all
steps" and in print, every step is open and all of them are visible at once
anyway.

---

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

## A step change lands on the work, not on the top of the page

Every step change scrolled to `top: 0`, which is right on a desktop and wrong on a
phone. On a phone the top of the page is the logo row, the tool's name on a row of
its own, the tab strip, and the forage chips — a screenful of chrome before step 1
starts. Pressing **Next** therefore did the thing asked of it and then showed the
user something else, leaving them to scroll down to see that it had happened. The
same press on a wide screen shows the step, because up there that chrome is one
compact row.

So the scroll is per layout rather than per action, and the boundary is
`.topbar-title`'s 900px — the width where the name drops to its own row is the
width where the stack begins. Reusing it was the point: a fourth breakpoint would
have to be kept in step with the three that already decide how tall that stack is.

**What to land on** differs by mode, because the wizard has a stepper and "Show
all steps" does not. In the wizard it is the strip: it says which step this is,
and the step's own head is directly under it. With the toggle on there is no
strip, so it is the **expanded** step — the one section that is not a folded head,
and therefore the step somebody has open in order to work on it.

The first version used the wizard's current step for that, which is wrong and only
looks right from the toggle. Nothing under "Show all steps" moves `step`: not
typing, not the carets. It still names wherever the user was when they left the
wizard, so the moment they fold that step away and unfold another, the target is a
shut head somewhere above the work. `toggle-show-all` hides this from itself,
because it force-opens `step` on the way in — the two agree there and nowhere else.
Reading the fold state instead means the answer comes from what is on screen.

Topmost open one when several are, so the landing is never below a step already
unfolded above it. Every step folded and there is no expanded step to go to, so it
falls back to `step`'s head: stale, but a place in the worksheet rather than none.
It is read off `.step-body[hidden]` rather than off the `openSteps` pref, which is
the same answer `isStepOpen()` handed `renderSteps()` a moment earlier, from the
side the user is on.

That is a fact about the mode and not about the button, which is why it is
`workTarget()` and not a selector written out at each call. Three of the five
callers — Start, Return and the toggle itself — can be in either mode, and the
first version of this had the selector inlined at the toggle, where `now` happened
to say which mode it was. Start would have had to ask the same question a second
way.

**Start and Return** scrolled nowhere either, and that one is the worst of the
set: the button is at the foot of a landing screen carrying eight rows of
photographs, so it is nearly always pressed from well down the page, and Return
comes back to a worksheet that is a different length again. Whatever offset
survives belonged to the chart. This one is not gated on the layout — a desktop
press from the bottom of the chart lands just as badly — so on a wide screen it
goes to the page top, which is what every other tab and screen change there does.

Turning the toggle **off** scrolled nowhere at all before this, which was not a
deliberate choice so much as an unnoticed one. Five sections collapse to one, the
page gets much shorter, and the browser clamps the old offset to whatever is left
— an arbitrary landing that changes with the step. It goes to the strip now, the
same place Next goes.

The air above the landing is `scroll-margin-top: 12px` on `.stepper, .step` rather
than an offset computed in JS. Only a `scrollIntoView()` ever reads it, so it
costs nothing at the widths that do not scroll, and it keeps a sliver of the row
above on screen: flush against the top edge reads as a page with no top rather
than as a page that has been scrolled.

`scrollToWork()` has to run after `render()`, since `render()` replaces
`app.innerHTML` and the element scrolled to has to be the one now in the page.

jsdom has no layout, no media query evaluation and no `scrollIntoView`, so the
test stubs `matchMedia` and `Element.prototype.scrollIntoView` and asserts which
element was handed to it, both ways round. That is as far as a test can go here —
where the element actually ends up needs a phone.

### Two columns line up by having the same shape, not by being measured

Step 3's utilization control is a mode pill on the left and, on the right, either
one number input or a six-card picker. The pill has to sit level with whichever of
those is there, and it must not MOVE when the mode changes: a control that jumps
half an inch when you press it reads as the page having reflowed under you.

Three things were tried. `align-items: center` on the grid centres each column
against the tallest, so the pill landed halfway down the six-card picker in one
mode and beside the input in the other — the exact jump this had to avoid. A
`margin-top` in pixels works until the label wraps, and `.dm-split` is shared with
the perennial sheet's dry matter step, where the right column is a chart or a mix
builder. Scoping either by `:has()` on the input's `data-path` fixes one mode and
leaves the other where it was.

What works is giving the two columns **the same shape**. The pill is wrapped in a
`.field` with a real `.field-label`, so both columns are a one-line label over a
44px control — `.mode-pill` declares `--pill-h: 44px` and `styles.css` gives every
input the same `min-height`. With `align-items: start` the label rows line up, the
controls start together, and two boxes of equal height starting on the same line
are centred against each other for free. The pill's position is then fixed by its
own label rather than by anything in the other column, so it is identical in both
modes and stays identical if a third is ever added.

The visible label is not decoration: it is the mechanism. It also gave the control
a name on screen, which it never had — it carried an `aria-label` and nothing a
sighted user could read.

---

### The class contract is why a second worksheet does not break this

`workTarget()` finds its target by querying `.stepper` and `.step-body[hidden]`
**off the DOM**, not by being told. That is the right design — it is the same
answer `isStepOpen()` gave `renderSteps()`, read from the thing that was actually
rendered rather than from a second copy of the state — but it means a worksheet
whose markup does not carry those names gets **no scroll at all**, on a phone,
with nothing thrown and no test failing.

So every calculator's step renderer emits an identical class and attribute
contract: `.box.step[data-step][data-warned]`, `.step--collapsible`,
`.step-head`, `.step-body[hidden]`, `.step-nav`, `[data-out][data-fmt]`,
`[data-step-missing]`, `[data-step-pill]`, `.stepper`. Six separate mechanisms key
off those names — `updateOutputs()`, `stepOutstanding()`, `workTarget()`, the
collapse handler, the print block and `scroll-margin-top` — and **all six fail
silently**, which is the whole reason it is written down as a requirement rather
than left as a resemblance. `src/ui/step-frame.js` exists to hold the shared
shell, so the contract is met by construction rather than by copying markup.

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

### A warning that fires on real work is worse than no warning

Every other guard on this worksheet answers a question about arithmetic: is this
negative, is it non-finite, is it above 100%. `IMPLAUSIBLE_HEIGHT_IN` answers a
question about the world, and that makes choosing the number a different kind of
decision.

The slip it exists for is one keystroke. An 18 inch stand typed as **180** gives
45,140 lbs/ac and offers a hundred head most of a year of grazing. Nothing else
on the sheet has any grounds to query it: 180 is positive, finite, above the
anchor, and the estimate is a straight line with no upper end. Every figure
downstream looks like a figure.

The temptation is to set the threshold near the top of what is normal — six feet,
say, since a cool-season stand never gets there. That would be a mistake, and it
is the reason this note exists. Sorghum-sudan, pearl millet and sunn hemp all
reach eight to ten feet in a good year. A line querying those would be seen most
often by exactly the people whose measurement was right, and a warning somebody
has learned to scroll past is not a warning: it costs the credibility of every
other line in the same box, including the ones about residual and utilization
that really do mean something.

So it sits at **twelve feet** — past anything anybody is standing in, and still
under 180 and 240, which are the slips that matter. And it **warns rather than
refuses**, the same shape as `demand()`'s `rate > 10`: somebody may genuinely be
in a thirteen-foot stand, and this worksheet is not entitled to tell them they are
not. It says the figure is worth checking and works it out anyway.

---

### A stored key is not an answer until it resolves

`answered()` decides whether a goal has a figure or a dash, and the cover crop
model's first version asked it of the **stored key** — `season`, `periodKey` —
rather than of what that key resolved to.

The failure is silent all the way down. An id nothing matches gives
`seasonById()` → `null`, so `base`, `anchor` and `perInch` all come back 0
through `num(undefined)`; `productionAt()` returns 0 without complaint; available
and usable forage follow; and the goal prints **0 grazing days** — a confident
answer saying this field will not feed anything. Meanwhile `answered()` reported
the season as answered, so nothing was in `missing` and no dash was ever shown.

It is reachable: an uploaded calculation file carries whatever ids it was written
with, and any change to the ids in `data/covercrop.js` strands every record
already saved. The perennial model had already met this and guarded it —
`frameMultiplier()` pushes *"…is not a frame size this calculator knows"* and
returns 0 rather than falling through to a blank custom area. That precedent was
not carried across.

So `answered()` now reads `c.seasonRates` and `c.utilization.periodPct`, the
resolved values `resolvedCoverCrop()` puts on the record, and `compute()` pushes a
warning naming the key it could not place. A key nothing matches is unanswered:
a dash, and a sentence telling the user to choose again.

The general rule: **`answered()` is asked of the record `compute()` actually
sees**, which is the resolved one. Checking the raw input is checking that
somebody typed something, not that it means anything.

---

### 2.6% is a default, not one of the worksheet's constants

The printed cover crop worksheet fixes intake at 3% of body weight and prints it
as fixed text rather than as a blank. This calculator defaults to **2.6%** on both
worksheets, which is SDSHC's working figure and sits inside the NRCS range of 2.5%
to 3% that the perennial sheet already used.

That is not the same kind of change as the section below, and the distinction is
the whole reason both are written down. `COOL_SEASON_BASE` is a **constant the
model computes with**: get it wrong and every figure downstream is wrong, and
nobody using the app can see or correct it. The intake rate is a **default in an
editable field**: it is on screen, it can be argued with, and somebody weighing
yearlings knows better than either number does. One worksheet defaulting to a
figure the other does not would be two answers to the same question about the same
herd, on two tabs, with nothing saying why.

`test/covercrop.test.js` types 3 into the field before checking the worksheet's own
worked example. That keeps the paper-fidelity test about the paper, and leaves the
default free to be a product decision rather than a transcription.

---

### The cool-season constant, and an out-of-date PDF

`COOL_SEASON_BASE` is **1,140**. Older printed copies of the cover crop worksheet
give cool-season's first four inches as **140**, and this is worth knowing about
because it looks exactly like the app having a typo in it.

The worksheet's own arithmetic is what settled it. Its worked example runs
`140 + 250 x (18 - 4)`, which is 3,640, and writes **4,640**. Its residual line at
a 4" residual reads **1,140**, not 140. `4,640 - 1,140 = 3,500` is the available
forage it goes on to use, and every figure after that follows. Both printed
constants were exactly 1,000 low while the subtraction between them stayed
consistent, which is a dropped leading "1,". 140 is also implausible against
warm-season's 1,275 lbs/ac for the same four inches. SDSHC has since corrected
the PDF.

The rule the case sets is narrower than "never disagree with the paper". **A round
number the paper rounds is kept, because paper parity is the point; an arithmetic
error the paper's own worked example contradicts is not, because following it puts
the screen at odds with the paper's own answers** — which is the very failure the
hoop-preset rule exists to prevent.

It is one named constant with the evidence written above it, and the reason to
keep that comment is a future reader working from an old printout and "fixing"
this line back.

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

`src/data/covercrop.js` is the same rule for the other worksheet, and it is what
makes the cool-season correction above a one-line change. The season production
rates and the occupation-period utilization table are the only copy of either;
`resolvedCoverCrop()` in `state-covercrop.js` looks them up at compute time and
hands the model plain numbers, so no stored record holds a percentage or a rate.
`test/calc-covercrop.test.js` transcribes both tables independently, the same way.

It hands over the **rates** rather than the season's id — `{ base, anchor,
perInch }` — so `calc-covercrop.js` never learns that a season exists. That is
also what makes the mix estimate fall out of the same expression instead of
needing a branch: it is a flat rate over the whole height, which is `base: 0,
anchor: 0`.

---

## Adding an input means touching three places

Markup in `src/ui/*` -> **that calculator's** factory -> **that calculator's**
model. For perennial that is `src/state.js` -> `src/calc.js`; for cover crops it
is `src/state-covercrop.js` -> `src/calc-covercrop.js`. Inputs declare
`data-path="demand.animalWeight"` and one delegated listener in `main.js` writes
by path, so a new field needs no handler, but it does need to exist in the
factory and be consumed by the model.

The delegated listener is deliberately still **one**, shared. It writes a value at
a path into whatever the active calculation is, and nothing about that is per
worksheet — which is why adding a field to either sheet is still three places and
not four.

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

### One list holding two kinds

**Two lists was the alternative and was not taken.** Each would need its own head,
its own "+ New calculation", its own filter and its own sort order — a second set
of furniture on a phone, permanently, to solve a problem the list only has once
somebody keeps more than a handful of each. One list keeps one `sortIndex` space
and one drag order, which also means a producer can file north-pasture perennial
next to north-pasture cover crop, which is a comparison they might actually want.

What one list does need is a way to tell a card's figures apart. **"Grazing days:
25" off clipped samples and "Grazing days: 25" off a yardstick are not the same
claim**, and nothing else on a card said which. So every card carries a
calculator badge (`.saved-kind`) — a tinted chip rather than colour alone, because
the two badges differ in their *words* first and the tint only makes the list
scannable once you know what you are looking for. The meta line under the name
comes off the descriptor's `savedMeta(calc)`: forage for one worksheet, season for
the other.

The badge sits in the card's **top-right corner**, on the name's row, rather than
at the head of the meta line where it started. It is a label on the whole card and
not one more field about the pasture, and it is the same word on every card of a
kind: down the right-hand edge it reads as a column to skim, where in front of the
pasture name it was a prefix to read past on every row. `.saved-headings` is the
flexible child of `.saved-top`, so the name takes the squeeze and the badge keeps
its width.

The goal list came *off* the card earlier for being said twice, and the badge going
*on* is the opposite case rather than a reversal: a goal was already a labelled
figure two lines below, and the worksheet was nowhere.

The pill row (`.saved-kinds`) is the one-tap version of typing the badge into the
filter box — `matches()` searches `shortName` too, so both routes work and neither
is the only one. It renders only once the list actually holds more than one kind,
or while a pill is on, so a producer who only ever uses one worksheet never sees a
control for a distinction that does not exist for them.

It sits on the **filter row**, to the right of the box, and not on a row of its
own: both controls narrow the same list, and a control given a row to itself reads
as a different kind of thing. The three segments are equal width, sized to the
widest label. `grid-auto-columns: 1fr` over `width: max-content` is what does that
— the track sizing takes the widest label and gives every column that width, then
the container shrinks to fit. A flex row sizes each segment to its own text, which
left "All" a third the width of "Cover crop" and made the group read as three
unrelated buttons rather than one switch.

Getting them onto that row at all took a second fix, and it is a trap worth
naming. `.saved-filter` was `flex: 1 1 auto`, and `styles.css` gives every input
`width: 100%`. An `auto` flex-basis resolves from `width`, so the box's base size
was the entire row: the segments were pushed to a second line before shrinking was
ever considered, and no amount of sizing them differently would have helped.
`flex: 1 1 0` makes the box take what is left instead, with a `min-width` so it
cannot be shrunk to nothing. **Any input placed on a flex row in this app has the
same problem** — `1 1 auto` is never the right shorthand for one.

Below 640px they take a row each, because side by side neither the box nor three
segments has the width to be read, and the segments centre on their row: they are
one control with nothing on the other end of the row to balance against.

Both narrowings switch reordering off, for the reason the text filter always did:
dropping a card between two others in a list hiding half its rows writes an order
nobody can see. One **Clear** undoes both — a Clear beside two narrowings that
undid only one leaves cards hidden with nothing on screen saying why, which reads
as the list having broken.

The backup stays **one file covering both kinds**. Splitting it makes "back up my
work" a two-step job, and a two-step backup is one people do once. The restore
`confirm()` states counts per type on both sides, arriving and going, because
"replace 12 calculations with 9" is a different decision when the 12 are four
perennial and eight cover crop.

---

## Clearing is per step, and it names its own scope

Each step head carries a **Clear**, right-aligned, in the wizard and under "Show
all steps" alike. It empties that step and nothing else, from `stepFields` **on
the descriptor**, whose values come from that calculator's own
`newCalculation()` — so blanking a new field correctly means adding it to the
factory and nothing else.

`afterClearStep(calc, i)` is the optional hook beside it, for whatever a worksheet
cannot leave genuinely blank. Perennial's step 1 uses it: the mix rows take back
the forage type the setup screen already named, because an empty mix builder is
not a cleared step, it is a broken one.

There is no Clear in the sticky bar and there must not be one. A single button
that empties whatever happens to be on screen has to be read carefully every
time; sitting on a step's own head is how this one says which step it means,
which is also why it needs no confirm.

**+ New calculation** (chip row, and the Saved tab header) drops the whole
record, including the goals and the forage type, and lands back on the setup
screen with a new id. It is the only way to a genuinely blank start.

**Its scope had to be stated, because it reads as a bug either way if it is not.**
With two worksheets holding work at once, "new calculation" could mean the one you
are in or everything on the device. Clearing both is destructive and nobody asked
for it; clearing neither looks like the button did nothing. So: it drops the
record for the worksheet you are standing in and leaves the other exactly as it
was, and the confirm about unsaved work asks about **that** record.

From the Saved tab neither worksheet is on screen, so there is no "the one you are
in" to mean. `openNewCalcDialog()` asks — a two-card chooser rather than two
buttons in the head, because it is one question with two answers, and that head
already carries four controls on a row that wraps twice on a phone. The chip row's
copy of the button does not ask and must not start: the answer there is on screen
behind the dialog. **Upload a calculation needs no chooser at all** — the file
declares its own `calcType`, which is the difference between a discriminator on
the record and a question for the user.

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

**And its own key per calculator**, in `WORKING_KEYS`, because two worksheets hold
work at once. `sdshc-gc-working` stays perennial's rather than being renamed to
something symmetrical: somebody was halfway through it when the update shipped,
and a tidier key name is not worth losing that. The key is chosen off the
**record's** `calcType` and not off what is on screen — `printSavedCalc()` borrows
a record that may well be of the other type, and reading the active slot there
clobbers the wrong worksheet's work with nothing on screen to show for it.

### The version ladder carries versions, not shapes

`migrate()`'s `version < 1` step grafted `samples`, `dm`, `usable` and `pasture`
onto **every** record unconditionally. That was harmless while there was one
worksheet and every record wanted those branches. It is exactly wrong the moment a
cover crop record goes through it: it comes out carrying four perennial fields it
has no use for, which then travel into every export and every backup.

So the shape defaults came out of the ladder. The ladder now carries version steps
only — `< 1` stamps the timestamps, `< 2` stamps `calcType` — and
`fillRecordDefaults()` in `schema.js` fills in per-type branches afterwards.
`schema.js` imports nothing, which is what lets `storage.js` know a record's shape
without depending on the UI.

Two guards around it. **Never guess the type from the shape**: an empty perennial
record and an empty cover crop record are the same object, so a v1 record with no
`calcType` is stamped perennial because that is the only calculator that existed
before v2, not because of what it contains. And an unknown `calcType` — a record
from a future build, or a hand-edited file — is **coerced to the default rather
than dropped**, because "never drop a record because it is old" is the same
promise whichever direction the version runs.

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

**None of it prints.** The print block hides `.footer`, and it used to hide only
`.footer button` — keeping the sentence on paper on the grounds that a worksheet
handed to a landlord or an NRCS office should still carry it. It reads wrong
there. On screen the line sits under the app's own controls and is plainly about
the app; on a printout every control is gone and the same grey sentence sits
directly under the figures, where it reads as a caption to them. The promise is
made in three places and all three are on screen, which is where somebody is
deciding whether to type their acres in.

It is also the one line in the footer with a **width**, `max-width` plus auto side
margins in `app.css`. Set to the full width of a desktop page it was a single long
row of small grey type, which is the shape of something nobody reads, and this is
the one line in the app that has to be read. `margin: auto` rather than centred
text on a full-width box, so the block sits under the middle of the page instead of
being centred text pinned to the left edge. In `app.css` and not the shared sheet:
the width was chosen for these sentences, and `styles.css` belongs to three tools.

**`footer()` used to take the tab, and no longer does.** The cover crops tab was
a cross-origin JotForm: submitting it sent the entries to JotForm, so the blanket
line would have been a promise the app could not keep on one of its three tabs,
which is worse than making no promise. That tab got a second sentence naming
JotForm and confining the guarantee to the rest of the calculator, and the
`privacy` definition carried the same exception in its last paragraph so the long
answer and the short one agreed.

The native cover crop calculator removed the exception. Nothing leaves the device
from any of the three tabs now, so one sentence is true everywhere and the
parameter went with the branch. **The rule inverted, and it is worth stating
positively so nobody re-adds the branch out of caution:** a second sentence goes
back only when a tab genuinely sends data somewhere. An "except" on a screen with
no except teaches people to read the whole line as boilerplate, and then the
sentence stops working on the day it matters.

The one thing that still reaches another site is the **link** to SDSHC's older
JotForm at the foot of the cover crop setup screen. It is kept because somebody
may have a half-filled one open or want the emailed copy it sends, and it carries
its own warning where it sits (`.cc-jotform`) rather than in the footer. A link is
not a submission, and warning about it on every screen would be warning about
somebody else's website in the middle of a promise about this one. The `privacy`
definition's last paragraph now carries that same narrower fact, so the long
answer and the short one still agree.

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
anywhere from any tab, these three places are what has to change first, before the
feature ships and not after.

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

**The second calculator added no token to `styles.css`, deliberately, and there is
a test that enforces it.** `test/themelab.test.js` asserts that `GROUPS` in
`themelab.js` and `:root` in `styles.css` agree in both directions, so a token
added here fails a suite in a file with nothing to do with cover crops — and the
lab is shared with farm-budget, so the fix would be an edit in two repositories
for a colour only one of them uses. Every cover crop style is in `app.css`
(`.saved-kind`, `.saved-kinds`, `.cc-jotform`), and the badge tints are
`color-mix()` over tokens that already exist. A colour worth a token is a colour
worth adding to all three tools on purpose.

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
| CC-A | 3 | One stand per cover crop season: warm-dominant, cool-dominant, mixed | **filled** |
| CC-B | 2 | Reading average height off a yardstick in a stand | empty |
| CC-C | 2 | A stand grazed to roughly 4" residual, ideally paired before/after | empty |
| CC-D | 2 | Short occupation strip-grazed, against 30 days of trampling and selection | empty |

Cover crop photography goes in `public/covercrop-images/`, under the same
constraints as the forage set: webp, under about 500 KB each, long side 1400px,
because everything in `public/` is precached and becomes the offline install size.
Worth checking SDSHC's existing `Finished Handouts-Graphics` share before sourcing
anything new. The three season cards are the only set worth calling a minimum:
every other slot renders as a labelled placeholder with the same shape and viewer,
so filling one in later is an edit to `src/data/covercrop.js` and no code change.

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

The cover crops tab was a cross-origin JotForm, which could not be cached by the
service worker, did not work offline, and sent everything typed into it to
JotForm. It is now a native calculator on the same engine, so all three tabs work
offline and nothing leaves the device.

What made that cheap was already in place: steps 3 to 5 of the perennial
worksheet are the same arithmetic as steps 3 to 5 of the cover crop worksheet,
which is why `demand()`, `daysFrom()`, `acresFrom()` and `animalsFrom()` are
exported separately from `calc.js`. The two sheets differ entirely in their first
two steps — clipped samples dried and weighed, against a height read off a
yardstick — and share everything after them. That split is the whole argument for
two models over one parameterised one.

`public/covercrop-images/` holds the minimum viable set: three photos, one per
season: a sorghum-sudan stand shot from the side, cereal rye over crimson clover,
and a flowering multi-species mix. Each is a stand seen at grazing height rather
than a plant identification shot, because the question the card is answering is
which season this field is, not what the species looks like close up. The alt
text describes what is in the frame rather than repeating the species list on the
card, under the same rule as the stage photos.

The cool one is portrait, the other two landscape. That is not worth fixing: the
card thumbnail is a 4/3 `object-fit: cover` crop whatever comes in, so the grid
is uniform, and the full viewer is `contain`, so a portrait letterboxes and shows
whole. Cropping the file to match would throw away photo for no gain on screen.

Rows CC-B to CC-D have nowhere to go yet: the cover crop steps carry no media
panel, so those want a slot before they want a file.

jsdom loads no CSS, so `el.hidden` in `test/app.test.js` reflects the attribute
rather than what a browser paints. Anything depending on the stylesheet has to
be checked in a real browser.

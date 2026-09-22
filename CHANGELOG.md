# Changelog

## 1.8.0

**The teaching is levelled like the controls now.** Leaving every "How this
works" panel on at every level meant a newcomer on Simple was handed the
solver's matrix. Simple gets the one idea the tool is about and its formula —
for the train, why a pair changes speed, and the trade between speed, torque
and power. Advanced adds the working. **Expert is where the app explains
itself**, so "How the whole train is solved", which sets out the simultaneous
equations, only appears there: it describes the software, not gears.

**Standards and jargon are out of Simple.** The single-gear tool no longer
mentions ISO 54, diametral pitch or preferred series to a newcomer — it just
uses ISO 54 series I, which was already the default, without naming it. The
"module is not a preferred size" notification is suppressed too, because at
Simple it is something the reader cannot act on.

**The licence changed again, to MIT with the Commons Clause** — and this one is
right. PolyForm Noncommercial forbade *commercial use*, which is far wider than
intended: it would have barred a workshop from designing parts it sells. MIT
grants everything, the Commons Clause removes exactly one right — selling the
software itself, or charging for a service whose value is substantially this
software. Using it for paid work is explicitly fine, and the licence modal now
says so in its own section.

## 1.7.0

**The footer documents**, matching Bench-Calculator: **Licence & terms**,
**Imprint & privacy** and **Quick start**, each a modal with three ways out —
the ×, Escape, or the backdrop. The text lives in a pure `js/legal.js` so it can
be tested, and one of those tests asserts that the licence the footer claims is
the licence in the LICENSE file. That is the pair most likely to drift.

**Quick start is also the first-run onboarding** — shown once automatically the
first time the app is opened, with a "don't show this again" box, and in the
footer forever after. Same content at two moments.

**The licence changed from MIT to PolyForm Noncommercial 1.0.0**, with a LICENSE
file added. Anyone may use, copy, modify and share the tool for any purpose that
is not commercial; selling it, or building it into something sold, needs a
separate licence. **The gears you design with it are unaffected** — the parts,
the drawings and the DXFs are yours, including commercially. The restriction is
on selling the tool.

**Sidebar sections lock.** The accordion already closed the others when you
opened one; now each section carries a padlock that exempts it, so you can pin
the gear list and cycle through the rest around it. The lock is drawn in
`currentColor` rather than an emoji, its click no longer folds the section it is
in, and it saves immediately rather than through the debounced save — it is
often the last thing you touch before closing the tab.

This replaces the native `<details name>` accordion, which always closes every
sibling and gives no way to exempt one.

Added `BACKLOG.md`, opening with rack gears and hiding individual teeth.

## 1.6.0

**Every notification closes now**, including the green "this train will run as
drawn". A message you cannot get rid of stops being information and becomes
furniture — you stop reading it, and then you stop reading the one underneath it
that mattered. The × sits at the right-hand end, as it does in 3DPrintCost.

**More than one folds into a group.** From two upwards they collapse into a
single "Notifications" line you can open or shut, so you get all of them or none
rather than a stack pushing the drawing off the screen. Worst level first, the
group's border takes the worst level inside it, and the summary counts what is
in there — "3 — 1 problem, 2 to check" — re-tallying as rows are closed. When the
last row goes, the group goes with it. It opens by default, because nothing
should hide an error on first sight, and stays shut once you shut it.

Dismissal is keyed on **what the message says**, not on the element or its
position, because these messages are recomputed from the model on every render —
a flag on the node dies with it. That gives the behaviour you would expect for
free: acknowledge a warning and it stays gone; change the design so it now says
something different and it speaks up again. Kept in memory rather than saved: a
dismissal is "I have read this", not a setting, and a problem that survives a
reload has earned the right to say so once more.

## 1.5.0

Matched to the 3DPrintCost Bench, which is the reference for this chrome.

- **The Simple / Advanced / Expert switch moved to a workspace bar** — one row
  above the drawing, tabs on the left and the three chips on the right, exactly
  where 3DPrintCost puts them. It governs every panel on the screen, so it
  belongs above them all; inside a sidebar section it read as a setting for that
  section. At phone widths the row wraps and the chips go full width.
- **Tabs are ordered as the story runs**: gear train → single gear → planetary
  set → ratio solver. Build something, then design a part for it, then the one
  arrangement that needs its own tool, then work backwards from a number. A rule
  (`segmented__sep`) fences "How to use" off from the working tabs, because it is
  about the app rather than part of the job.
- **The app opens on its own simplest example.** Gear train tab, Simple level,
  one pinion driving one wheel at a round 3:1 — and the "Simple train" chip reads
  as already selected, because the default *is* that preset rather than something
  resembling it. A preset chip stays pressed only while the bench still equals
  it; edit anything and none is pressed, which is the honest state.

  The first pass used a 12-tooth pinion, which undercuts at 20° and opened the
  app on a warning. 18 teeth gives the same 3:1 and nothing to explain away.
  There is now a test that the default bench raises no problems at all.

## 1.4.0

The house features from the `detronics-app` skill that this app did not have yet.

- **Chrome links.** The logo is now the home link to detronics.co.za, a round
  Buy Me a Coffee button sits left of the theme toggle, and a "Buy me a coffee"
  link joins the footer. The coffee icon is a line-drawn SVG in `currentColor`,
  not the emoji — an emoji carries its own colours and clashes with the palette
  in one theme or both. The theme control is now a round icon button too, with
  the state-bearing glyph the icon system asks for.
- **Simple / Advanced / Expert.** A switch at the top of the panel, defaulting
  to Simple and remembered between visits. It only ever *hides*: the arithmetic
  is identical at every level, and moving between them never changes a number.
  Simple is teeth, connections and a speed; Advanced adds positions, centre
  distances, view and export; Expert adds profile shift, module overrides and
  the pressure angle.
- **Sections are an accordion.** Opening one closes its siblings, so a single
  thing is in view at a time — the native `<details name>` behaviour, so the
  browser does the closing and no bookkeeping of ours can drift.
- **A "How to use" tab**, last after the working tabs: one search box over
  nine how-tos, eight questions and nine feature notes at once. It searches in
  the user's words rather than the app's — "laser", "backwards", "make it
  slower" all find the right page — via an alias map in `js/guide.js` that is
  the translator between the two vocabularies.

Also fixed: a tool passing `null` to `sidebar.append()` for a section that does
not apply put the literal word "null" in the panel, because native `append()`
stringifies it. Filtered once in the shell rather than at every call site.

## 1.3.0

**Coaxial labels no longer land on top of each other.** The sun, ring and
carrier of a planetary set share an axis, so all three labels were drawn at the
same point. They are now placed outside the rim — ring above, carrier below,
sun in the middle — and the scene reserves the room so nothing falls outside
the viewBox.

The same fault was in the ratio solver and in any compound train, because two
gears on one shaft are concentric too, so the fix is general: anything sharing
a centre gets its labels stacked, smallest gear nearest the middle. Checked
across every preset, at several instants, by comparing the labels' actual
screen rectangles.

**More of each gear's specification is visible.**

- The gear list shows the pitch diameter beside the tooth count, so resizing a
  gear shows its effect immediately.
- The Selected panel lists what the typed numbers produced — pitch, tip, root
  and base diameters, and the whole tooth depth.
- A new **Positions and sizes** panel gives every centre in one coordinate
  frame, with the driving gear at the origin: X, Y and the centre distance `a`
  to whatever each gear hangs off, in millimetres, x right and y up. Click a row
  to select that gear.

  Positions are derived from the tooth counts rather than stored, so the
  measured centre distance and the one m·(z₁ + z₂)/2 demands are the same
  number. A test now asserts that across every preset — if they ever differ,
  the drawing has come adrift from the arithmetic.

**The single gear tool gained a bore, and its diameter is settable.**

- **Pitch diameter is now an input.** Type a diameter and the module follows
  from the tooth count, which is how you hit a centre distance you have been
  given. Module still works the other way round; same object, two ways in.
- **Keyways and splines**, in a new `js/bore.js`. One keyway, two at 180°, or
  straight-sided splines — all the same construction with a different count, so
  they cannot drift apart. Key sizes default from DIN 6885 for the bore, splines
  from the DIN 5463 medium series, and every dimension is overridable.
- They are real geometry, not decoration: drawn inside the gear group so a
  keyway turns with the teeth, and exported to DXF as a polyline on the BORE
  layer.
- The failure that catches people out is reported — a keyway cut through into
  the tooth roots, and the thin wall before it: *"Only 0.42 mm of metal between
  the keyway and the tooth roots. Under about one module that is where the gear
  will crack."*

## 1.2.1

**The direction arrows pointed the wrong way.** The animation was right and two
separate labels were wrong: the curved arrow was drawn clockwise for a positive
speed, and the readout called it "clockwise", while the gear on screen turned
anticlockwise.

The cause was three parts of the app each working the direction out for
themselves. The drawing is a faithful rendering of maths coordinates — x right,
y up, angles anticlockwise — and the renderer flips y to reach the screen, so a
positive speed genuinely turns anticlockwise. The arrow and the word had each
assumed the opposite.

There is now one place that decides it, `turnsClockwise` in `js/format.js`, and
the arrow, the readout word and the renderer all read from it. `directionArrow`
also builds its head from the arc's actual travel direction instead of assuming
one, which is the fix `references/pitfalls.md` #6 describes.

The test that covers it walks the whole chain rather than any one link: solved
speed → phase at two instants → the SVG rotation those become → whether that
rotation is visually clockwise → the published convention → the word. Confirmed
to fail against the old convention, so it has teeth.

## 1.2.0

- **The top bar carries only Save project, Load project and the theme control**,
  shortening to Save and Load below 700px so nothing crowds the logo. Checked at
  375px and 320px: the actions clear the wordmark by 32px at the narrowest, and
  the header stays one row.
- **Share link and Print moved to the footer**, beside Reset. They are things you
  do when you have finished rather than while working, and the footer is present
  in all four tools — the ratio solver has no export panel to put them in.
- **A new bench is driven at 10 rpm** rather than 1500. A gear train is something
  you watch, and at motor speeds the animation is a blur and the output barely
  appears to move. It also keeps the arithmetic in your head: the default train
  now reads 10 in, −6 at the idler, 3.333 out. The value lives in one constant,
  `DEFAULT_RPM` in `js/train.js`.
- **Speed fields step by an amount that suits the number in them** — 1 rpm at 10,
  50 rpm at 1500, with shift for ten steps at once. A fixed step of 50 jumped
  straight past every value worth trying at the low end.

## 1.1.0

**The gear bodies were drawn as flowers.** Two faults in the profile generator,
both now covered by tests that would have caught them:

- The root fillet could land diametrically opposite the flank it was rounding.
  Extending the same straight run-out far enough crosses the axis and meets the
  root circle again on the far side of the blank — tangent to both, on the space
  side, and completely wrong. The profile therefore jumped across the middle of
  the gear once per tooth. The fillet is now required to stay within half a tooth
  pitch of its own flank.
- The tip arc was traversed twice, because the falling flank was made by
  mirroring a rising side that already included it.

  The old tests checked the right things — minimum radius, maximum radius,
  rotational symmetry, measured tooth thickness on the pitch circle — and every
  one of them passes on a gear that jumps across its own middle. The new test is
  the blunt one: **no step along the profile may be longer than half a circular
  pitch.**

  A fillet is now fitted only where there is a corner to round. Above about 42
  teeth, and on every ring gear, the involute reaches the root by itself and
  meets it at roughly 16° rather than square, so there is nothing to round off.

**The sidebar no longer throws away your place.** Every edit rebuilds it, which
was discarding the scroll position and the caret — so typing a speed four
sections down and pressing Enter snapped the panel back to the top with the
field off screen. It read as "I cannot change this". Scroll position, focused
field and caret position are now captured before the rebuild and restored after,
via a stable `data-field` name on every control.

**Sliders commit on release, not on every pixel.** Committing on `input`
re-rendered the sidebar and so replaced the very element being dragged: the drag
died immediately and the panel jumped. The number beside the slider still tracks
the thumb live.

**Input speed is editable in the summary**, under the drawing, instead of only
four panels down the sidebar.

**The gear list does the work now.** Every shaft has its own speed readout and
its own Drive and Hold buttons — a planetary set gets one row per member, since
which member you hold is the whole character of the set. Drive *moves* the input
rather than adding a second one; the drive panel still adds a genuine second
input for a differential. Each row also names what it hangs off.

**Gears can be re-hung from a different parent** from the Selected panel. Only
legal moves are offered: a gear cannot hang off itself or off anything hanging
off it.

**Sidebar sections collapse**, and remember whether they are open, per tool and
between visits.

## 1.0.0

First release. Four tools, 199 tests, no dependencies.

**Gear train designer**
- Build a train gear by gear: external mesh, internal (ring) mesh, same-shaft and toothed
  belt links, plus planetary sets as a node type.
- Positions are derived, not stored. Dragging a gear swings it around its parent at exactly
  `a = m·(z₁ + z₂)/2`, so the drawing can never show a mesh that could not exist.
- Axial planes: a same-shaft link steps to the next plane, so compound gears that overlap on
  a flat drawing are correctly *not* reported as colliding. Gears in the same plane that do
  overlap are.
- Speeds solved as simultaneous equations rather than propagated, so the tool reports one
  answer, the number of degrees of freedom still free, or a genuine contradiction.
- Live animation with correct tooth phasing, and a direction arrow and speed on every shaft.
- Five presets: simple pair, idler, compound train, planetary set, differential.

**Planetary set designer**
- Willis equation, all six drive configurations shown at once, torque split across the three
  members, planet spin and orbit.
- Assembly condition and planet-to-planet clearance checked, with the planet counts that
  would work named when the chosen one will not.

**Single gear**
- Full dimension table, real involute flanks, an exactly tangent root fillet, and warnings
  for undercut, pointed teeth, thin tips and non-standard modules.
- ISO 54 preferred-module snapping, with the deviation stated.

**Ratio solver**
- Single-pair, two-stage compound and planetary searches, ranked by error then by total
  teeth. Hunting pairs flagged. One click loads a result into the train designer.

**Export**
- SVG and PNG with every design token resolved, asserted to contain no unresolved `var(--)`.
- DXF R12 in millimetres: a single gear, or the whole train at its real centre distances,
  one layer per feature.
- Share link (URL fragment, never transmitted), local JSON project files, and a print sheet.

**Notes**
- `js/eseries.js` from the scaffold was removed: IEC 60063 resistor values have no analogue
  here. `js/modules.js` carries the gear equivalent — ISO 54 preferred modules and stocked
  diametral pitches — with the same snap-and-report-the-deviation behaviour.
- Gear dragging applies each pointer move directly rather than through
  `requestAnimationFrame`. An rAF-based throttle jams permanently the moment a frame does not
  arrive, which is exactly what happens in a background tab.

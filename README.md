# Detronics Gear Bench

**Live: https://detronics-apps.github.io/GearBench/**

Design and simulate interconnected gear systems — trains, compound gearboxes and
planetary sets — and see what actually changes when you change one gear. One static page.
No backend, no build step, no dependencies, no network requests once the page has loaded.

The point is not to generate one gear. It is to make it obvious how gears *interact*: what
happens to every other shaft when you alter a tooth count, a module, a position, a
connection or the input speed.

| Tool | What it does |
|---|---|
| **Gear train** | Build a train gear by gear. Mesh, ring, shaft and belt links, plus planetary sets. Drag a gear to swing it round its parent; it stays in mesh. Drive, hold or re-hang any shaft from the gear list. Every speed, direction, ratio and torque, live. |
| **Planetary set** | A sun, planets, a ring and a carrier. Choose what is held and what drives, see all six configurations at once, and check whether the set can actually be assembled. |
| **Single gear** | One gear, fully dimensioned, with real involute flanks and a proper root fillet. Set it by module or by pitch diameter. Add a keyway, two keyways or straight-sided splines. Exports as SVG, PNG or 1:1 DXF. |
| **Ratio solver** | State the ratio you need; get a shortlist of real tooth counts ranked by error and by how much metal you have to cut. One click drops the answer into the train designer. |

Every tool carries a **"How this works"** panel explaining the concept in plain language,
giving the formula, and working that formula through with whatever values are currently on
screen.

## What it models

- **External mesh** — teeth engaged side by side. Reverses direction: `n₂ = −n₁·z₁/z₂`.
- **Internal mesh** — a pinion inside a ring gear. Keeps direction.
- **Shaft (compound)** — two gears on one shaft. Same speed, and a step to the next axial
  plane, which is why compound gears that overlap on a flat drawing do not touch in reality.
- **Belt** — a timing belt, where the centre distance is yours to choose.
- **Planetary sets** — sun, planets, ring and carrier as four rotating bodies, solved with
  the Willis equation, including the assembly condition and planet clearance.
- **Bores** — plain, one or two keyways to DIN 6885, or straight-sided splines to DIN 5463,
  with the wall left between the slot and the tooth roots checked and reported.

The **Positions and sizes** panel gives every shaft centre in one frame with the driving gear
at the origin, plus the centre distance between each gear and the one it hangs off — the
numbers a build actually needs.

Speeds are not propagated down the train one gear at a time. Every relationship becomes a
linear equation and the whole system is solved at once, so the app can answer honestly:

- **one answer** — the train is fully determined;
- **"you have not said enough yet"** — with the number of degrees of freedom left. An
  epicyclic set with nothing held is a differential, not a gearbox;
- **"these cannot all be true"** — when something is driven and held at the same time.

## Export

- **SVG / PNG** of the drawing, with every design token resolved so the file stands alone.
- **DXF** (R12, millimetres) of a single gear or of the whole train at its real centre
  distances — real involute flanks, a tangent root fillet, and profile, bore, pitch circle
  and centre marks each on its own layer.
- **A share link** that reopens the exact bench.
- **A printable sheet** carrying the drawing, the numbers and the working.

Share and Print are in the footer, beside Reset. The top bar keeps only Save project,
Load project and the theme control, so it still fits beside the logo on a phone.

## Running it

It is plain files. Any static server will do:

```bash
python -m http.server 8845
```

## Tests

The calculation core is pure — no DOM, no globals — so it runs under Node's built-in test
runner with nothing to install:

```bash
npm test
```

238 cases, including the ones that matter most: the **drawn** tooth polygon is measured on
its pitch circle and checked against the tooth thickness the formula predicts; the animation
is checked to turn every gear at exactly the speed the solver worked out; and every mesh is
checked to be phased tooth-against-space at several instants.

Two of them exist because separate parts of the app were each deriving the same fact. One
walks the direction of rotation all the way from the solved speed to the word in the readout,
so the arrow, the label and the animation cannot drift apart again. The other is deliberately
blunt: **no step along a tooth profile may be longer than half a circular pitch.** A gear whose fillet lands on the wrong side of the blank still has the right
minimum radius, the right maximum radius, the right symmetry and the right tooth thickness —
it just draws as a flower. Invariants that hold on a broken drawing are not worth much.

## Deploying to GitHub Pages

Push to `main`, then **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
`.nojekyll` is already present. There is nothing to build.

**After a push, GitHub Pages serves the previous build for up to ten minutes.** Read the
version in the footer before investigating any bug — if it is the old one, nothing you are
looking at is current.

## Layout of the code

```
index.html            the shell; everything else is built by JS
css/tokens.css        the Detronics palette as light/dark custom properties
css/layout.css        header, viewport, sidebar, footer
css/components.css    buttons, fields, tables, banners, panels
css/patterns.css      layout rules that exist because something broke without them
css/print.css         the printable sheet

js/units.js           engineering notation: 1500, 1.5k, 1k5
js/format.js          display formatting — nothing reaches prose unrounded
js/modules.js         ISO 54 preferred modules and diametral pitch
js/gearmath.js        involute spur gear geometry
js/involute.js        tooth profile generation, root fillets, measurement
js/linalg.js          Gaussian elimination with rank and nullspace
js/train.js           the train model, its equations and the solver (DEFAULT_RPM lives here)
js/planetary.js       Willis, assembly conditions, torque split
js/bore.js            bores, keyways and splines; DIN 6885 and DIN 5463
js/layout.js          where every gear sits, axial planes, collisions
js/phase.js           tooth phasing, so the animation actually meshes
js/ratios.js          the ratio search
js/dxf.js             DXF R12 output
js/state.js           one state object, localStorage, URL-hash sharing
js/main.js            chrome, tool routing, rendering, the animation clock
js/ui/                DOM helpers, SVG renderers, widgets, export
js/ui/tools/          one controller per tool
tests/                node --test over the pure modules
```

The rule that keeps this workable: **everything under `js/` except `js/ui/` is pure.**

Three design decisions worth knowing before changing anything:

- **Positions are derived, never stored.** A gear's centre follows from its parent, the two
  tooth counts and one angle, because `a = m·(z₁ + z₂)/2` is the only place two meshing
  gears can be. Dragging changes the angle; the distance is physics. That is why the picture
  and the arithmetic cannot drift apart, and why the DXF can be cut and bolted together.
- **The scene is built once and animated by transform.** A 127-tooth gear is six thousand
  points. A frame rewrites one attribute per gear and nothing else.
- **One fact, one owner.** A positive speed turns anticlockwise on screen, and `turnsClockwise`
  in `js/format.js` is the only place that is decided — the readout word, the curved arrow and
  the renderer all read it from there. They used to work it out separately, and disagreed.
- **Every edit rebuilds the whole sidebar**, which is what keeps the state and the screen from
  drifting apart — but the browser was holding things on the user's behalf that a rebuild
  throws away. Scroll position, focused field and caret are captured and restored around it,
  and no control ever commits on `input`, only on `change`: committing mid-interaction replaces
  the element being interacted with.

## Privacy

Nothing you enter leaves your browser. No analytics, no cookies, no fonts or scripts from
other hosts, and no network request of any kind after the page has loaded. Settings are kept
in `localStorage` on your own device. Share links encode the state into the URL **fragment**,
which browsers never transmit to a server. Saving downloads a JSON file to your own machine.

## Accuracy

Standards followed:

- **ISO 53** basic rack — 20° pressure angle, addendum 1·m, dedendum 1.25·m, so tip clearance
  is 0.25·m. 14.5° and 25° are offered as alternatives.
- **ISO 54** preferred modules, series I and II, and the usual stocked diametral pitches.
- **DIN 6885-1 / ISO 773** parallel keys, by shaft diameter.
- **DIN 5463** straight-sided splines, medium series — indicative dimensions only. No fits,
  tolerances or root radii; enough to draw and to cut a first article from, not enough to
  specify a gearbox.
- **IEC-style involute geometry**: `inv α = tan α − α` throughout, with the working pressure
  angle for profile-shifted pairs solved by Newton's method rather than approximated.

Where the figures are indicative rather than authoritative:

- **Everything is lossless.** Torque and power figures assume 100% efficiency. A real spur
  stage gives back roughly 1–2%, so a three-stage box lands near 95% of what went in. Nothing
  here models friction, churning or bearing drag.
- **Torque on a branched train** is reported as the input torque times the ratio, which is
  only correct while that shaft is the sole output. It is labelled as such on screen.
- **The root fillet is a true tangent arc of 0.38·m**, the tip radius of a standard hob, not
  the trochoid a hob actually cuts. The difference is a few hundredths of a millimetre at the
  root and does not affect any dimension reported. It is fitted only where the profile runs
  radially below the base circle and so has a corner to round — above about 42 teeth, and on
  every ring gear, the involute reaches the root by itself at a glancing angle and none is
  drawn.
- **The tooth profile is a polygon.** At the export setting the measured pitch-circle tooth
  thickness lands within about 0.05% of the theoretical value; the tests assert better than
  0.2% at every setting.
- **Undercut, interference and contact ratio** are the standard first-order checks. They will
  catch a design that cannot work; they are not a substitute for a rating calculation to
  ISO 6336 or AGMA 2001 if the gearbox has to carry a load for a living.
- **Backlash is not modelled.** Gears are drawn and exported at nominal tooth thickness; a
  real cut needs allowance taken off, usually via tooth thinning rather than centre distance.

## Licence

MIT.

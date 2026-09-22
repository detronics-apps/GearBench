# Backlog

Wanted, not yet built. Each entry says what it is, why it is worth doing, and
what it will touch — enough to start from cold.

---

## Rack gears

**Where:** Gear train (as a link type under *Add*) and Single gear (as a kind of
gear in its own right).

A rack is a gear of infinite radius: its pitch circle is a straight line and its
teeth are the basic rack profile itself — straight-sided flanks at the pressure
angle, which is *why* the involute system works the way it does. That makes it
both a real thing people need and the clearest possible teaching object, because
the rack is the shape the cutter has.

What it has to do:

- **In a train**, a rack meshes with a pinion and converts rotation to travel.
  The readout is no longer a speed but a **linear velocity**, `v = π·m·z·n / 60`
  mm/s, and the ratio becomes **mm of travel per turn** (`π·m·z`). That is a new
  kind of output, so `js/train.js` needs a body type whose motion is linear, and
  the solver's equations gain one row relating the rack's travel to the pinion's
  rotation.
- **Geometry** is simpler than an involute gear, which is the point: flanks are
  straight lines at the pressure angle, pitch is `π·m`, addendum `m`, dedendum
  `1.25·m`. A new pure module (`js/rack.js`) generating the profile, plus its
  tests, mirroring `js/involute.js`.
- **Layout** — a rack has a position and an angle but no centre; the pinion sits
  one pitch radius off the pitch line. `js/layout.js` needs to place it.
- **Length** is the user's, not derived: how many teeth long the rack is.
- **Export** falls out for free once the profile exists.

Worth doing early because it also gives the "How this works" panel the honest
explanation of where the involute comes from.

---

## Hiding individual teeth (intermittent / mutilated gears)

**Where:** Single gear, and carried through to the train.

Let the user remove a chosen run of teeth, so a 24-tooth gear can have four
consecutive teeth missing and a plain gap in their place. This is a **Geneva-ish
/ intermittent drive**: the output turns while the teeth are engaged and stands
still while the gap passes, which is how indexers, counters and film mechanisms
work.

What it has to do:

- **Model:** a set of suppressed tooth indices on the gear — `{ hidden: [3,4,5,6] }`
  — rather than a count, so a gap can be anywhere and there can be more than one.
- **Profile:** `gearOutline()` already builds one tooth and rotates it `z` times.
  A hidden tooth is replaced by an arc at the **root** radius spanning that
  tooth's pitch angle, so the blank is continuous and the outline stays a single
  closed path. The step-length invariant (pitfall 18) still has to hold across
  the join.
- **Simulation:** while a gap is in mesh, the pair is *not* engaged. The honest
  behaviour is that the driven gear's speed is undefined — it coasts or is held
  by a detent — so the solver should report the mesh as intermittent rather than
  pretending the ratio holds. Simplest first version: mark the engagement state
  per frame from the phase, and say in the readout when the pair is out of mesh.
- **Warnings:** a gap wide enough that the pair can disengage without a detent
  will not re-engage cleanly; say so.

Deliberately not a Geneva mechanism proper (that needs a locking plate and a
driving pin) — this is the simpler "teeth removed from an ordinary gear" case.

---

## Smaller, already noted

- **Dismiss-all** for the notifications group, once a screen regularly raises
  enough that closing them one at a time annoys.
- **Ring gears get no root fillet.** The flank reaches the root by itself and
  meets it at a glancing angle, so it is cosmetic, but a true trochoid would be
  more honest.
- **Backlash allowance** on the export. None is applied today; it is stated in
  the accuracy note, but a tooth-thinning option would save a step.

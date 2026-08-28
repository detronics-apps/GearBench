import test from 'node:test';
import assert from 'node:assert/strict';

import { gearGeometry, involute } from '../js/gearmath.js';
import {
  flankAngle, pointedRadius, profileRadii, flankSamples, filletArc,
  gearOutline, circlePoints, rimRadius,
  crossingAngles, measuredToothThickness, toPath,
} from '../js/involute.js';

const TAU = Math.PI * 2;
const radius = (p) => Math.hypot(p.x, p.y);

test('the flank angle equals the half tooth thickness on the pitch circle', () => {
  const g = gearGeometry({ m: 2, z: 20 });
  assert.ok(Math.abs(flankAngle(g, g.r) - g.halfAngleAtPitch) < 1e-12);
  // and the string is fully wound at the base circle, where the offset is
  // exactly the pitch offset plus inv(alpha)
  assert.ok(Math.abs(flankAngle(g, g.rb) - (g.halfAngleAtPitch + involute(g.alphaRad))) < 1e-12);
});

test('the flank narrows outward on a gear and outward-thickens on a ring', () => {
  const gear = gearGeometry({ m: 2, z: 30 });
  assert.ok(flankAngle(gear, gear.ra) < flankAngle(gear, gear.r));
  assert.ok(flankAngle(gear, gear.r) < flankAngle(gear, gear.rb));

  const ring = gearGeometry({ m: 2, z: 60, internal: true });
  assert.ok(flankAngle(ring, ring.rf) > flankAngle(ring, ring.r));
  assert.ok(flankAngle(ring, ring.ra) < flankAngle(ring, ring.r));
});

test('pointedRadius never dips below the base circle', () => {
  for (const z of [8, 20, 60, 200]) {
    const g = gearGeometry({ m: 2, z });
    assert.ok(pointedRadius(g) >= g.rb - 1e-12, `z=${z}`);
    assert.ok(flankAngle(g, pointedRadius(g)) < 1e-9, `z=${z} is a point`);
  }
});

test('profileRadii truncates a pointed tooth instead of crossing the flanks', () => {
  const knife = gearGeometry({ m: 2, z: 8, x: 1.4 });
  const r = profileRadii(knife);
  assert.equal(r.pointed, true);
  assert.ok(r.tipR < knife.ra, 'tip pulled in to where the flanks meet');

  const sane = profileRadii(gearGeometry({ m: 2, z: 20 }));
  assert.equal(sane.pointed, false);
  assert.equal(sane.tipR, gearGeometry({ m: 2, z: 20 }).ra);
});

test('a small gear runs out radially below its base circle; a large one does not', () => {
  assert.equal(profileRadii(gearGeometry({ m: 2, z: 20 })).runout, true);   // rf < rb
  assert.equal(profileRadii(gearGeometry({ m: 2, z: 127 })).runout, false); // rf > rb
});

test('a ring gear whose tip falls inside its base circle runs out too', () => {
  const tight = gearGeometry({ m: 2, z: 24, internal: true });
  assert.ok(tight.ra < tight.rb, 'this is the case being covered');
  const r = profileRadii(tight);
  assert.equal(r.runout, true);
  assert.equal(r.pointed, false, 'base-circle limited is not the same as pointed');
  assert.equal(r.tipR, tight.ra, 'the tip is still drawn where it belongs');
});

test('flank samples run root end to tip end and stay inside their radii', () => {
  const g = gearGeometry({ m: 2, z: 20 });
  const s = flankSamples(g, 10);
  assert.equal(s.length, 11);
  assert.ok(Math.abs(s[0].r - Math.max(g.rf, g.rb)) < 1e-9);
  assert.ok(Math.abs(s[s.length - 1].r - g.ra) < 1e-9);
  for (let i = 1; i < s.length; i += 1) assert.ok(s[i].r >= s[i - 1].r - 1e-12, 'monotonic outward');

  const ring = gearGeometry({ m: 2, z: 60, internal: true });
  const rs = flankSamples(ring, 10);
  assert.ok(Math.abs(rs[0].r - ring.rf) < 1e-9, 'a ring starts at its root, which is outside');
  for (let i = 1; i < rs.length; i += 1) assert.ok(rs[i].r <= rs[i - 1].r + 1e-12, 'monotonic inward');
});

test('the outline never jumps across the blank', () => {
  // The invariant that matters most, and the one whose absence let a fillet sit
  // diametrically opposite the flank it was rounding: every step along the
  // profile is short. A gear that jumps to the far side once per tooth still
  // has the right minimum radius, the right maximum radius, the right symmetry
  // and the right tooth thickness — and draws as a flower.
  for (const spec of [
    { m: 2, z: 18 }, { m: 2, z: 12 }, { m: 1, z: 8 }, { m: 2, z: 127 },
    { m: 2, z: 14, x: 0.5 }, { m: 2, z: 30, x: -0.3 },
    { m: 2, z: 60, internal: true }, { m: 2, z: 24, internal: true },
  ]) {
    const g = gearGeometry(spec);
    const points = gearOutline(g);
    let longest = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      longest = Math.max(longest, Math.hypot(a.x - b.x, a.y - b.y));
    }
    assert.ok(longest < g.circularPitch / 2,
      `z=${g.z}${g.internal ? ' internal' : ''}: longest step ${longest} of pitch ${g.circularPitch}`);
  }
});

test('the tip is crossed once, not doubled back over', () => {
  // Mirroring a rising side that already contained the tip arc walks back
  // across the tip before coming down the far flank.
  const g = gearGeometry({ m: 2, z: 18 });
  const points = gearOutline(g);
  const per = points.length / g.z;
  const tip = points.slice(0, per)
    .filter((p) => Math.hypot(p.x, p.y) > g.ra - 1e-6)
    .map((p) => Math.atan2(p.y, p.x));
  assert.ok(tip.length >= 3, 'there is a tip land to check');
  for (let i = 1; i < tip.length; i += 1) {
    assert.ok(tip[i] > tip[i - 1], `tip angles must advance: ${tip.join(', ')}`);
  }
});

test('the root fillet sits at the root of its own tooth', () => {
  // Extend the same straight run-out far enough and it crosses the axis and
  // meets the root circle again on the far side of the gear — tangent to both,
  // on the space side, and completely wrong.
  for (const spec of [{ m: 2, z: 18 }, { m: 2, z: 12 }, { m: 1, z: 8 }, { m: 2, z: 127 }]) {
    const g = gearGeometry(spec);
    const arc = filletArc(g, 0.38 * g.m, { steps: 6 });
    if (!arc) continue;
    const pitchAngle = (2 * Math.PI) / g.z;
    const flankAtRoot = -flankAngle(g, Math.max(g.rf, g.rb));
    for (const p of arc.points) {
      const delta = Math.atan2(p.y, p.x) - flankAtRoot;
      const wrapped = Math.atan2(Math.sin(delta), Math.cos(delta));
      assert.ok(Math.abs(wrapped) <= pitchAngle * 0.6,
        `z=${g.z}: fillet point ${(wrapped * 180 / Math.PI).toFixed(1)}° from its flank`);
      assert.ok(wrapped <= 1e-9, 'the fillet belongs in the space, not inside the tooth');
    }
  }
});

test('the root fillet is genuinely tangent to the root circle', () => {
  const g = gearGeometry({ m: 2, z: 20 });
  const rho = 0.38 * g.m;
  const arc = filletArc(g, rho, { steps: 8 });
  assert.ok(arc, 'a standard gear has room for a fillet');

  // Every point of the arc is one fillet radius from its centre …
  for (const p of arc.points) {
    assert.ok(Math.abs(Math.hypot(p.x - arc.centre.x, p.y - arc.centre.y) - rho) < 1e-9);
  }
  // … the centre sits one fillet radius outside the root circle …
  assert.ok(Math.abs(Math.hypot(arc.centre.x, arc.centre.y) - (g.rf + rho)) < 1e-9);
  // … so the arc touches the root circle and never crosses inside it.
  const radii = arc.points.map(radius);
  assert.ok(Math.abs(Math.min(...radii) - g.rf) < 1e-6, 'touches');
  assert.ok(Math.min(...radii) > g.rf - 1e-6, 'never crosses');
});

test('no fillet is fitted where there is no corner to round', () => {
  // Above about 42 teeth the root circle sits outside the base circle, so the
  // involute reaches the root by itself and meets it at a glancing angle. There
  // is nothing to round off, and nothing straight to be tangent to.
  const big = gearGeometry({ m: 2, z: 127 });
  assert.ok(big.rf > big.rb, 'the root is outside the base circle');
  assert.equal(filletArc(big, 0.38 * big.m), null);

  const ring = gearGeometry({ m: 2, z: 60, internal: true });
  assert.ok(ring.rf > ring.rb);
  assert.equal(filletArc(ring, 0.38 * ring.m), null);

  // The flank really does arrive almost tangentially, so the join is smooth
  // without one: the profile's last two steps into the root differ in angle by
  // far less than they do in a gear that needs a fillet.
  const points = gearOutline(big, { filletCoef: null });
  let longest = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    longest = Math.max(longest, Math.hypot(a.x - b.x, a.y - b.y));
  }
  assert.ok(longest < big.circularPitch / 2, `longest step ${longest}`);
});

test('a small gear does get a fillet, and it is where the corner is', () => {
  const small = gearGeometry({ m: 2, z: 18 });
  assert.ok(small.rf < small.rb, 'the profile runs out radially below the base circle');
  const arc = filletArc(small, 0.38 * small.m, { steps: 6 });
  assert.ok(arc);
  assert.ok(Math.abs(Math.hypot(arc.centre.x, arc.centre.y) - (small.rf + 0.38 * small.m)) < 1e-9);
});

test('an outline is closed, sized right, and repeats once per tooth', () => {
  for (const spec of [
    { m: 2, z: 20 }, { m: 2, z: 12 }, { m: 1, z: 8 }, { m: 2, z: 127 },
    { m: 2, z: 14, x: 0.5 }, { m: 2, z: 30, x: -0.3 },
  ]) {
    const g = gearGeometry(spec);
    const points = gearOutline(g);
    assert.ok(points.length > 0);
    assert.equal(points.length % g.z, 0, `z=${g.z} repeats evenly`);

    const radii = points.map(radius);
    assert.ok(Math.min(...radii) >= g.rf - 1e-6, `z=${g.z} never cuts below the root`);
    assert.ok(Math.max(...radii) <= g.ra + 1e-6, `z=${g.z} never pokes past the tip`);
    assert.ok(Math.abs(Math.min(...radii) - g.rf) < 1e-6, `z=${g.z} reaches the root`);
  }
});

test('the outline is invariant under a one-tooth rotation', () => {
  const g = gearGeometry({ m: 2, z: 17 });
  const points = gearOutline(g);
  const per = points.length / g.z;
  const step = TAU / g.z;
  for (let i = 0; i < per; i += 1) {
    const a = points[i];
    const b = points[i + per];
    const rotated = {
      x: a.x * Math.cos(step) - a.y * Math.sin(step),
      y: a.x * Math.sin(step) + a.y * Math.cos(step),
    };
    assert.ok(Math.hypot(rotated.x - b.x, rotated.y - b.y) < 1e-9, `point ${i}`);
  }
});

test('the DRAWN tooth is the thickness the maths said it would be', () => {
  // This is the check that ties the profile generator back to the geometry:
  // measure the polygon that actually gets exported, on the pitch circle.
  for (const spec of [
    { m: 2, z: 20 }, { m: 2, z: 12 }, { m: 2, z: 60 }, { m: 1, z: 8 },
    { m: 2, z: 14, x: 0.5 }, { m: 2, z: 30, x: -0.3 }, { m: 3, z: 45 },
  ]) {
    const g = gearGeometry(spec);
    const measured = measuredToothThickness(gearOutline(g), g.r, g.z);
    const error = Math.abs(measured - g.toothThickness) / g.toothThickness;
    assert.ok(error < 0.002, `z=${g.z} x=${g.x ?? 0}: measured ${measured}, wanted ${g.toothThickness}`);
  }
});

test('a ring gear measures right too, teeth and all', () => {
  for (const z of [18, 24, 60, 120]) {
    const g = gearGeometry({ m: 2, z, internal: true });
    const points = gearOutline(g);
    const radii = points.map(radius);
    assert.ok(Math.min(...radii) >= g.ra - 1e-6, `z=${z} tip`);
    assert.ok(Math.max(...radii) <= g.rf + 1e-6, `z=${z} root`);

    const measured = measuredToothThickness(points, g.r, z);
    assert.ok(Math.abs(measured - g.toothThickness) / g.toothThickness < 0.002, `z=${z}: ${measured}`);
  }
});

test('more samples means less polygon error, and it converges', () => {
  const g = gearGeometry({ m: 2, z: 20 });
  const err = (steps) => {
    const measured = measuredToothThickness(
      gearOutline(g, { flankSteps: steps, tipSteps: steps, rootSteps: steps }), g.r, g.z,
    );
    return Math.abs(measured - g.toothThickness);
  };
  assert.ok(err(60) < err(6), 'refining the mesh helps');
  assert.ok(err(60) < 1e-3);
});

test('crossingAngles finds two crossings per tooth', () => {
  const g = gearGeometry({ m: 2, z: 20 });
  const points = gearOutline(g);
  assert.equal(crossingAngles(points, g.r).length, 40);
  assert.equal(crossingAngles(points, g.ra + 1).length, 0, 'nothing outside the tip');
  assert.equal(crossingAngles(points, g.rf - 1).length, 0, 'nothing inside the root');
});

test('circlePoints and rimRadius', () => {
  const c = circlePoints(10, 12);
  assert.equal(c.length, 12);
  for (const p of c) assert.ok(Math.abs(radius(p) - 10) < 1e-12);

  const ring = gearGeometry({ m: 2, z: 60, internal: true });
  assert.ok(rimRadius(ring) > ring.rf, 'the rim has to be outside the root');
  assert.equal(rimRadius(ring, 2), ring.rf + 4);
});

test('toPath emits a closed path and flips y for the screen', () => {
  const d = toPath([{ x: 0, y: 1 }, { x: 2, y: 3 }]);
  assert.equal(d, 'M 0 -1 L 2 -3 Z');
  assert.equal(toPath([{ x: 0, y: 1 }], { flipY: false, close: false }), 'M 0 1');
  assert.equal(toPath([]), '');
});

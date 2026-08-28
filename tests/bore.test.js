import test from 'node:test';
import assert from 'node:assert/strict';

import { gearGeometry } from '../js/gearmath.js';
import {
  BORE_TYPES, KEY_TABLE, SPLINE_TABLE,
  keyForBore, splineForBore, slottedBore, resolveBore, boreOutline, boreProblems,
} from '../js/bore.js';

const TAU = Math.PI * 2;
const radius = (p) => Math.hypot(p.x, p.y);

test('the key table is ordered and covers the usual shaft sizes', () => {
  for (let i = 1; i < KEY_TABLE.length; i += 1) {
    assert.ok(KEY_TABLE[i].upTo > KEY_TABLE[i - 1].upTo);
    assert.ok(KEY_TABLE[i].b >= KEY_TABLE[i - 1].b);
  }
  // the hub slot is always shallower than the key is tall — the rest sits in
  // the shaft
  for (const row of KEY_TABLE) assert.ok(row.t2 < row.h, `${row.b}x${row.h}`);
});

test('keyForBore picks the DIN 6885 row for the bore', () => {
  assert.deepEqual(keyForBore(20), { b: 6, h: 6, t2: 2.8, standard: true });
  assert.deepEqual(keyForBore(22), { b: 6, h: 6, t2: 2.8, standard: true }, 'boundaries are inclusive');
  assert.equal(keyForBore(23).b, 8, 'and the next row starts just above');
  assert.equal(keyForBore(10).b, 3);
  assert.equal(keyForBore(1000).standard, false, 'off the end of the table, but still answers');
  assert.equal(keyForBore(0), null);
  assert.equal(keyForBore('x'), null);
});

test('splineForBore finds the nearest DIN 5463 size', () => {
  assert.equal(splineForBore(26).d, 26);
  assert.equal(splineForBore(26).exact, true);
  assert.equal(splineForBore(27).d, 26, 'nearest, not next');
  assert.equal(splineForBore(27).exact, false);
  assert.equal(splineForBore(42).count, 8);
  assert.equal(splineForBore(16).count, 6);
});

test('the spline table is ordered and self-consistent', () => {
  for (const row of SPLINE_TABLE) {
    assert.ok(row.D > row.d, `${row.count}x${row.d}: major must exceed minor`);
    assert.ok(row.B < row.d, 'a spline is narrower than the bore');
    assert.ok(row.count === 6 || row.count === 8);
  }
});

test('a plain bore is just a circle', () => {
  const points = boreOutline({ type: 'plain', diameter: 10 });
  assert.ok(points.length >= 24);
  for (const p of points) assert.ok(Math.abs(radius(p) - 5) < 1e-9);
});

test('a keyway cuts exactly one slot, of the right width and depth', () => {
  const points = boreOutline({ type: 'keyway', diameter: 20 });
  const key = keyForBore(20);          // 6 wide, 2.8 deep
  const outer = 10 + key.t2;

  // The slot is cut along +y, so its depth is measured there — not as a radius.
  // The roof's two corners are further from the axis than its centreline is,
  // which is a property of the rectangle, not a mistake.
  const roof = points.filter((p) => p.y > outer - 1e-6);
  assert.equal(roof.length, 2, 'one slot has one roof, with two corners');
  assert.ok(Math.abs(Math.hypot(roof[0].x - roof[1].x, roof[0].y - roof[1].y) - key.b) < 1e-9,
    'the corners are exactly the key width apart');
  assert.ok(Math.abs(Math.max(...points.map((p) => p.y)) - outer) < 1e-9,
    'and the slot reaches t2 past the bore, no further');
  assert.ok(Math.abs(Math.min(...points.map(radius)) - 10) < 1e-9, 'the bore itself is untouched');
});

test('two keyways are the same slot twice, at 180 degrees', () => {
  const one = boreOutline({ type: 'keyway', diameter: 20 });
  const two = boreOutline({ type: 'keyway2', diameter: 20 });
  const roofOf = (pts) => pts.filter((p) => radius(p) > 10 + 2.8 - 1e-6);
  assert.equal(roofOf(one).length, 2);
  assert.equal(roofOf(two).length, 4);

  // Rotating the pattern by half a turn maps it onto itself.
  const rotated = two.map((p) => ({ x: -p.x, y: -p.y }));
  for (const p of rotated) {
    assert.ok(two.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6), 'symmetric under 180°');
  }
});

test('a spline is the same construction, N times', () => {
  const spec = { type: 'spline', diameter: 26 };
  const bore = resolveBore(spec);
  assert.equal(bore.count, 6);
  assert.equal(bore.majorDiameter, 32);
  assert.ok(Math.abs(bore.slotDepth - 3) < 1e-9, '(32 − 26)/2');

  const points = boreOutline(spec);
  const roof = points.filter((p) => radius(p) > 16 - 1e-6);
  assert.equal(roof.length, 12, 'six slots, two corners each');

  // Evenly spaced: rotating by one pitch maps the outline onto itself.
  const pitch = TAU / 6;
  const rotated = points.map((p) => ({
    x: p.x * Math.cos(pitch) - p.y * Math.sin(pitch),
    y: p.x * Math.sin(pitch) + p.y * Math.cos(pitch),
  }));
  for (const p of rotated) {
    assert.ok(points.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6));
  }
});

test('the outline never jumps, whatever the feature', () => {
  // Same invariant as the tooth profile: a closed outline made of short steps.
  for (const spec of [
    { type: 'plain', diameter: 10 },
    { type: 'keyway', diameter: 20 },
    { type: 'keyway2', diameter: 30 },
    { type: 'spline', diameter: 26 },
    { type: 'spline', diameter: 62 },
  ]) {
    const points = boreOutline(spec);
    const bore = resolveBore(spec);
    let longest = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      longest = Math.max(longest, Math.hypot(a.x - b.x, a.y - b.y));
    }
    const limit = Math.max(bore.slotWidth, bore.slotDepth, bore.radius * 0.5) + 1e-6;
    assert.ok(longest <= limit, `${spec.type} ${spec.diameter}: longest step ${longest} > ${limit}`);
  }
});

test('impossible slots fall back to a plain bore rather than self-intersecting', () => {
  // A slot wider than the bore, and more splines than can fit.
  const tooWide = slottedBore({ radius: 5, slotWidth: 12, slotDepth: 2, count: 1 });
  for (const p of tooWide) assert.ok(Math.abs(radius(p) - 5) < 1e-9);

  const tooMany = slottedBore({ radius: 5, slotWidth: 4, slotDepth: 2, count: 12 });
  for (const p of tooMany) assert.ok(Math.abs(radius(p) - 5) < 1e-9, 'slots would merge into one another');

  assert.deepEqual(slottedBore({ radius: 0, slotWidth: 1, slotDepth: 1, count: 1 }), []);
});

test('resolveBore fills in the standard and lets it be overridden', () => {
  const standard = resolveBore({ type: 'keyway', diameter: 20 });
  assert.equal(standard.slotWidth, 6);
  assert.equal(standard.slotDepth, 2.8);
  assert.equal(standard.standard, true);

  const custom = resolveBore({ type: 'keyway', diameter: 20, slotWidth: 5, slotDepth: 2 });
  assert.equal(custom.slotWidth, 5);
  assert.equal(custom.standard, false, 'and it says so');
});

test('a keyway that breaks into the tooth roots is an error, not a drawing', () => {
  // 12 teeth at module 1: root radius 4.75 mm. An 8 mm bore plus a keyway is
  // straight through it.
  const small = gearGeometry({ m: 1, z: 12 });
  const problems = boreProblems({ type: 'keyway', diameter: 8 }, small);
  assert.ok(problems.some((p) => p.level === 'error' && /breaks? through/i.test(p.text)));

  // A sound one has nothing to say.
  const big = gearGeometry({ m: 2, z: 60 });
  assert.deepEqual(boreProblems({ type: 'keyway', diameter: 20 }, big), []);
});

test('a thin wall between keyway and roots is a warning, with the number', () => {
  const g = gearGeometry({ m: 2, z: 20 });          // root radius 17.5 mm
  const problems = boreProblems({ type: 'keyway', diameter: 30 }, g);   // 15 + 3.3 = 18.3
  const thin = problems.find((p) => p.level === 'error' || p.level === 'warn');
  assert.ok(thin, 'something is said about it');
  assert.match(thin.text, /roots/);
});

test('a bore bigger than the gear is caught before anything is drawn', () => {
  const g = gearGeometry({ m: 1, z: 14 });
  const problems = boreProblems({ type: 'plain', diameter: 20 }, g);
  assert.ok(problems.some((p) => p.level === 'error' && /no gear left/i.test(p.text)));
});

test('a non-standard spline says what the nearest standard one is', () => {
  const g = gearGeometry({ m: 2, z: 60 });
  const problems = boreProblems({ type: 'spline', diameter: 27 }, g);
  const note = problems.find((p) => p.level === 'info');
  assert.ok(note);
  assert.match(note.text, /6×26×32/);
});

test('every bore type is declared, and unknown ones become plain', () => {
  for (const id of Object.keys(BORE_TYPES)) {
    assert.equal(BORE_TYPES[id].id, id);
    assert.ok(BORE_TYPES[id].label && BORE_TYPES[id].hint);
  }
  assert.equal(resolveBore({ type: 'nonsense', diameter: 10 }).type, 'plain');
  assert.equal(resolveBore().type, 'plain');
});

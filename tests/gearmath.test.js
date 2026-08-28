import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEG, BASIC_RACK, involute, involuteInverse,
  minTeethNoUndercut, minProfileShift,
  gearGeometry, centreDistance, workingMesh, contactRatio,
  pitchLineVelocity, tangentialForce, radialForce, meshProblems,
} from '../js/gearmath.js';

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

test('the involute function and its inverse round-trip', () => {
  for (const deg of [5, 10, 14.5, 20, 25, 30, 40]) {
    const a = deg * DEG;
    assert.ok(close(involuteInverse(involute(a)), a, 1e-10), `${deg}° round-trip`);
  }
  assert.equal(involuteInverse(0), 0);
  assert.ok(Number.isNaN(involuteInverse(-1)));
});

test('inv(20°) matches the value printed in every gear handbook', () => {
  assert.ok(close(involute(20 * DEG), 0.014904, 1e-6));
  assert.ok(close(involute(25 * DEG), 0.029975, 1e-6));
});

test('the pitch and base circles come straight from m, z and alpha', () => {
  const g = gearGeometry({ m: 2, z: 20 });
  assert.equal(g.d, 40);
  assert.equal(g.r, 20);
  assert.ok(close(g.db, 40 * Math.cos(20 * DEG)));
  assert.ok(close(g.circularPitch, 2 * Math.PI));
  assert.ok(close(g.basePitch, 2 * Math.PI * Math.cos(20 * DEG)));
});

test('a standard tooth is one module tall and 1.25 deep', () => {
  const g = gearGeometry({ m: 2, z: 20 });
  assert.equal(g.addendum, 2);
  assert.equal(g.dedendum, 2.5);
  assert.equal(g.da, 44);
  assert.equal(g.df, 35);
  assert.equal(g.wholeDepth, 4.5);
  assert.ok(close(g.clearance, 0.5));
});

test('tooth and space share the circular pitch exactly', () => {
  for (const x of [-0.3, 0, 0.4]) {
    const g = gearGeometry({ m: 2, z: 25, x });
    assert.ok(close(g.toothThickness + g.spaceWidth, g.circularPitch, 1e-12), `x=${x}`);
  }
});

test('positive profile shift fattens the tooth and pushes the tip out', () => {
  const plain = gearGeometry({ m: 2, z: 14 });
  const shifted = gearGeometry({ m: 2, z: 14, x: 0.5 });
  assert.ok(shifted.toothThickness > plain.toothThickness);
  assert.ok(shifted.da > plain.da);
  assert.ok(shifted.df > plain.df);
  // and the tooth gets thinner at the tip as a result
  assert.ok(shifted.tipThickness < plain.tipThickness);
});

test('undercut starts just above 17 teeth at 20 degrees', () => {
  assert.ok(close(minTeethNoUndercut(20, 1), 17.0972, 1e-4));
  assert.ok(close(minTeethNoUndercut(14.5, 1), 31.9029, 1e-4));
  assert.ok(minTeethNoUndercut(25, 1) < 12);

  assert.equal(gearGeometry({ m: 1, z: 18 }).undercut, false);
  assert.equal(gearGeometry({ m: 1, z: 12 }).undercut, true);
  // the shift that just cures it
  const xMin = minProfileShift(12, 20, 1);
  assert.equal(gearGeometry({ m: 1, z: 12, x: xMin + 1e-6 }).undercut, false);
});

test('a pointed tooth is detected before it is drawn', () => {
  const sane = gearGeometry({ m: 2, z: 20 });
  assert.equal(sane.pointed, false);
  assert.ok(sane.tipThickness > 0);

  // A big shift on a small gear runs the flanks together into a knife edge.
  const knife = gearGeometry({ m: 2, z: 8, x: 1.4 });
  assert.equal(knife.pointed, true);
});

test('an internal gear turns the tooth inside out', () => {
  const ring = gearGeometry({ m: 2, z: 60, internal: true });
  assert.equal(ring.d, 120);
  assert.ok(ring.ra < ring.r, 'tip is inside the pitch circle');
  assert.ok(ring.rf > ring.r, 'root is outside the pitch circle');
  assert.equal(ring.da, 116);
  assert.equal(ring.df, 125);
  assert.ok(close(ring.toothThickness, Math.PI, 1e-12), 'half the circular pitch at x = 0');
  assert.equal(ring.undercut, false, 'a ring gear is not undercut by its cutter');
});

test('centre distance adds radii externally and subtracts them internally', () => {
  assert.equal(centreDistance({ m: 2, z1: 20, z2: 40 }), 60);
  assert.equal(centreDistance({ m: 2, z1: 20, z2: 80, internal: true }), 60);
});

test('with no profile shift the working centre distance is the reference one', () => {
  const w = workingMesh({ m: 2, z1: 20, z2: 40 });
  assert.equal(w.aw, 60);
  assert.ok(close(w.alphaWDeg, 20));
  assert.equal(w.centreChange, 0);
});

test('profile shift moves the centres apart and raises the pressure angle', () => {
  const w = workingMesh({ m: 2, z1: 14, z2: 30, x1: 0.4, x2: 0.2 });
  assert.ok(w.aw > w.a, 'centres separate');
  assert.ok(w.alphaWDeg > 20, 'flanks meet at a steeper angle');
  // The relation is exact, not approximate: inv(αw) = inv(α) + 2·tanα·Σx/Σz
  const expected = involute(20 * DEG) + (2 * Math.tan(20 * DEG) * 0.6) / 44;
  assert.ok(close(involute(w.alphaW), expected, 1e-12));
  // and the pitch circles still touch at aw·cos(αw) = a·cos(α)
  assert.ok(close(w.aw * Math.cos(w.alphaW), w.a * Math.cos(20 * DEG), 1e-9));
});

test('contact ratio is above 1 for any sane pair, and rises with tooth count', () => {
  const g = (z) => gearGeometry({ m: 2, z });
  const small = contactRatio(g(14), g(14));
  const large = contactRatio(g(40), g(60));
  assert.ok(small > 1.2 && small < 1.6, `got ${small}`);
  assert.ok(large > small, 'more teeth in mesh with more teeth');
  assert.ok(large < 2, `got ${large}`);
});

test('an internal pair has a higher contact ratio than the external equivalent', () => {
  const pinion = gearGeometry({ m: 2, z: 20 });
  const ring = gearGeometry({ m: 2, z: 60, internal: true });
  const wheel = gearGeometry({ m: 2, z: 60 });
  const internal = contactRatio(pinion, ring);
  const external = contactRatio(pinion, wheel);
  assert.ok(internal > external, `${internal} should beat ${external}`);
  assert.ok(internal > 1 && internal < 3);
});

test('pitch-line velocity and tooth forces', () => {
  // 40 mm pitch diameter at 1500 rpm
  assert.ok(close(pitchLineVelocity(40, 1500), (Math.PI * 40 * 1500) / 60000, 1e-12));
  assert.ok(close(pitchLineVelocity(40, -1500), pitchLineVelocity(40, 1500)), 'direction does not change speed');
  // 10 N·m on a 40 mm pitch diameter is 500 N at the tooth
  assert.ok(close(tangentialForce(10, 40), 500));
  assert.ok(close(radialForce(10, 40, 20), 500 * Math.tan(20 * DEG)));
  assert.equal(tangentialForce(10, 0), 0);
});

test('meshProblems explains why a pair will not run, in words', () => {
  const a = gearGeometry({ m: 2, z: 20 });
  const b = gearGeometry({ m: 2.5, z: 30 });
  const problems = meshProblems(a, b);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].level, 'error');
  assert.match(problems[0].text, /module/i);

  assert.deepEqual(meshProblems(a, gearGeometry({ m: 2, z: 30 })), []);
});

test('meshProblems warns about a ring and pinion that are too close in size', () => {
  const pinion = gearGeometry({ m: 2, z: 55 });
  const ring = gearGeometry({ m: 2, z: 60, internal: true });
  const problems = meshProblems(pinion, ring, { internal: true });
  assert.ok(problems.some((p) => p.level === 'warn' && /interference/i.test(p.text)));
});

test('meshProblems warns about undercut and names the cure', () => {
  const small = gearGeometry({ m: 1, z: 11 });
  const problems = meshProblems(small, gearGeometry({ m: 1, z: 40 }));
  const warn = problems.find((p) => /undercut/i.test(p.text));
  assert.ok(warn);
  assert.match(warn.text, /profile shift/i);
});

test('the basic rack is the ISO 53 one and is not mutable', () => {
  assert.equal(BASIC_RACK.alphaDeg, 20);
  assert.equal(BASIC_RACK.haCoef, 1);
  assert.equal(BASIC_RACK.hfCoef, 1.25);
  assert.throws(() => { BASIC_RACK.alphaDeg = 25; }, TypeError);
});

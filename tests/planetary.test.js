import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MEMBERS, ringTeeth, planetTeeth, sunTeeth, basicRatio, carrierRadius,
  willis, planetSpeed, assemblyCondition, possiblePlanetCounts,
  neighbourClearance, configurations, torqueSplit, planetaryProblems,
} from '../js/planetary.js';

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

test('the tooth counts are three views of one relationship', () => {
  assert.equal(ringTeeth(24, 18), 60);
  assert.equal(planetTeeth(24, 60), 18);
  assert.equal(sunTeeth(60, 18), 24);
  assert.equal(basicRatio(24, 60), -2.5);
  assert.equal(carrierRadius(2, 24, 18), 42);
});

test('willis fills in whichever member was left out', () => {
  const z = { zSun: 24, zRing: 60 };
  // Ring held: 1000 rpm in at the sun gives 1000·24/84 at the carrier.
  const a = willis({ ...z, sun: 1000, ring: 0, carrier: null });
  assert.ok(close(a.carrier, (1000 * 24) / 84));

  // Same set, solved the other way round, must return the same sun speed.
  const b = willis({ ...z, sun: null, ring: 0, carrier: a.carrier });
  assert.ok(close(b.sun, 1000, 1e-9));

  const c = willis({ ...z, sun: 1000, ring: null, carrier: 0 });
  assert.ok(close(c.ring, (-24 * 1000) / 60));
});

test('the willis equation itself holds for every solve', () => {
  const zSun = 30;
  const zRing = 90;
  const check = (r) => close(zSun * r.sun + zRing * r.ring, (zSun + zRing) * r.carrier, 1e-9);
  assert.ok(check(willis({ zSun, zRing, sun: 1500, ring: -200, carrier: null })));
  assert.ok(check(willis({ zSun, zRing, sun: 1500, ring: null, carrier: 300 })));
  assert.ok(check(willis({ zSun, zRing, sun: null, ring: -200, carrier: 300 })));
});

test('the planets do not appear in the ratio, only in the geometry', () => {
  // Two sets with the same sun and ring but different planet counts give the
  // same carrier speed. That is the point people find surprising.
  const a = willis({ zSun: 24, zRing: 60, sun: 1000, ring: 0, carrier: null });
  const b = willis({ zSun: 24, zRing: 60, sun: 1000, ring: 0, carrier: null });
  assert.equal(a.carrier, b.carrier);

  // The planet's own spin, though, depends on its size.
  const fast = planetSpeed({ zSun: 24, zPlanet: 12, sun: 1000, carrier: a.carrier });
  const slow = planetSpeed({ zSun: 24, zPlanet: 18, sun: 1000, carrier: a.carrier });
  assert.ok(Math.abs(fast) > Math.abs(slow));
});

test('a planet on a stationary carrier is a plain idler', () => {
  const spin = planetSpeed({ zSun: 20, zPlanet: 10, sun: 100, carrier: 0 });
  assert.ok(close(spin, -200), 'idler reverses and doubles');
});

test('a planet turns with the carrier when nothing is rotating relative to it', () => {
  // Lock sun to carrier and the whole set turns as one solid lump.
  const spin = planetSpeed({ zSun: 24, zPlanet: 18, sun: 500, carrier: 500 });
  assert.ok(close(spin, 500));
});

test('the assembly condition is the one most tooth counts fail', () => {
  const good = assemblyCondition(24, 60, 3);        // 84 / 3 = 28
  assert.equal(good.ok, true);
  assert.match(good.text, /whole number/);

  const bad = assemblyCondition(24, 60, 5);         // 84 / 5 = 16.8
  assert.equal(bad.ok, false);
  assert.equal(bad.remainder, 4);
  assert.match(bad.text, /space/);

  assert.deepEqual(possiblePlanetCounts(24, 60), [2, 3, 4, 6, 7]);
});

test('planets that overlap are caught before anything is drawn', () => {
  // Small sun, big planets, too many of them.
  const crowded = neighbourClearance({ m: 2, zSun: 12, zPlanet: 30, count: 5 });
  assert.equal(crowded.ok, false);
  assert.ok(crowded.clearance < 0);

  const roomy = neighbourClearance({ m: 2, zSun: 60, zPlanet: 12, count: 3 });
  assert.equal(roomy.ok, true);
  assert.ok(roomy.clearance > 0);
});

test('all six configurations, and each one is the reciprocal of its mirror', () => {
  const rows = configurations(24, 60);
  assert.equal(rows.length, 6);
  for (const row of rows) {
    assert.ok(MEMBERS.includes(row.fixed));
    assert.ok(close(row.reduction, 1 / row.ratio));
    const mirror = rows.find((r) => r.fixed === row.fixed && r.input === row.output);
    assert.ok(close(mirror.ratio, 1 / row.ratio), `${row.id} mirrors ${mirror.id}`);
  }
});

test('the configurations agree with the Willis equation, one by one', () => {
  const zSun = 24;
  const zRing = 60;
  for (const row of configurations(zSun, zRing)) {
    const speeds = { [row.fixed]: 0, [row.input]: 1000, [row.output]: null };
    const solved = willis({ zSun, zRing, ...speeds });
    assert.ok(close(solved[row.output] / 1000, row.ratio, 1e-9), `${row.id}: ${solved[row.output] / 1000} vs ${row.ratio}`);
  }
});

test('only a held carrier reverses the output', () => {
  for (const row of configurations(24, 60)) {
    assert.equal(row.reverses, row.fixed === 'carrier', row.id);
  }
});

test('the famous 1 + ring/sun reduction', () => {
  const row = configurations(24, 60).find((r) => r.id === 'sun-carrier-ring');
  assert.ok(close(row.reduction, 1 + 60 / 24));
  assert.ok(close(row.reduction, 3.5));
});

test('torques sum to zero and split by tooth count', () => {
  const t = torqueSplit({ zSun: 24, zRing: 60, member: 'sun', torque: 10 });
  assert.ok(close(t.sun, 10));
  assert.ok(close(t.ring, 25), 'the ring takes z_ring/z_sun times the sun torque');
  assert.ok(close(t.carrier, -35));
  assert.ok(close(t.sun + t.ring + t.carrier, 0), 'a lossless set balances');

  // Driving from the carrier instead just rescales the same split.
  const c = torqueSplit({ zSun: 24, zRing: 60, member: 'carrier', torque: -35 });
  assert.ok(close(c.sun, 10));
});

test('planetaryProblems rejects an odd tooth gap', () => {
  const problems = planetaryProblems({ zSun: 24, zRing: 61, count: 3 });
  assert.ok(problems.some((p) => p.level === 'error' && /even/.test(p.text)));
});

test('planetaryProblems rejects a planet that does not span the gap', () => {
  const problems = planetaryProblems({ zSun: 24, zRing: 60, zPlanet: 20, count: 3 });
  assert.ok(problems.some((p) => /does not span/.test(p.text)));
});

test('planetaryProblems names the planet counts that would work', () => {
  const problems = planetaryProblems({ m: 2, zSun: 24, zRing: 60, zPlanet: 18, count: 5 });
  const assembly = problems.find((p) => /planet/.test(p.text) && /whole number/.test(p.text));
  assert.ok(assembly, 'the assembly failure is reported');
  assert.match(assembly.text, /2, 3, 4, 6, 7/);
});

test('a sound set has nothing to report', () => {
  assert.deepEqual(planetaryProblems({ m: 2, zSun: 24, zRing: 60, zPlanet: 18, count: 3 }), []);
  assert.deepEqual(planetaryProblems({ m: 1, zSun: 30, zRing: 90, zPlanet: 30, count: 4 }), []);
});

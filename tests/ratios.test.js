import test from 'node:test';
import assert from 'node:assert/strict';

import { findPairs, findCompound, findPlanetary, stageRatio } from '../js/ratios.js';
import { assemblyCondition, planetTeeth, ringTeeth } from '../js/planetary.js';

test('an exact ratio is found exactly, and comes first', () => {
  const results = findPairs(3);
  assert.ok(results.length > 0);
  assert.equal(results[0].exact, true);
  assert.equal(results[0].errorPct, 0);
  assert.equal(results[0].stages[0].z2 / results[0].stages[0].z1, 3);
  // The smallest pair that does the job, not the first one stumbled on.
  assert.equal(results[0].teeth, 40, '10 and 30 teeth');
});

test('an awkward ratio comes back with the error stated', () => {
  const results = findPairs(Math.PI, { tolerancePct: 2 });
  assert.ok(results.length > 0);
  assert.ok(results.every((r) => Math.abs(r.errorPct) <= 2));
  assert.ok(!results[0].exact);
  // 22/7 is the classic, and it should be in there somewhere near the top.
  assert.ok(results.slice(0, 6).some((r) => r.ratio === 22 / 7 || Math.abs(r.ratio - 22 / 7) < 1e-12));
});

test('results are ranked by error, then by how much metal you have to cut', () => {
  const results = findPairs(4.37, { tolerancePct: 5 });
  for (let i = 1; i < results.length; i += 1) {
    const a = results[i - 1];
    const b = results[i];
    assert.ok(Math.abs(a.errorPct) <= Math.abs(b.errorPct) + 1e-12
      || (Math.abs(a.errorPct) === Math.abs(b.errorPct) && a.teeth <= b.teeth));
  }
});

test('the same ratio is never offered twice in different clothes', () => {
  const results = findPairs(2, { limit: 50 });
  const ratios = results.map((r) => r.ratio);
  assert.equal(new Set(ratios).size, ratios.length, '20:10 and 40:20 are one answer');
});

test('tooth-count limits are respected', () => {
  for (const r of findPairs(2.5, { minTeeth: 15, maxTeeth: 45, limit: 40 })) {
    assert.ok(r.stages[0].z1 >= 15 && r.stages[0].z1 <= 45);
    assert.ok(r.stages[0].z2 >= 15 && r.stages[0].z2 <= 45);
  }
});

test('a hunting pair — no shared factor — is flagged', () => {
  // 23 and 11 share nothing, so every tooth eventually meets every other tooth
  // and wear is spread evenly. The lowest-terms pair is the one offered.
  const exact = findPairs(23 / 11, { limit: 40, tolerancePct: 0.001 }).find((r) => r.exact);
  assert.ok(exact);
  assert.deepEqual(exact.stages[0], { z1: 11, z2: 23 });
  assert.equal(exact.hunting, true);

  const even = findPairs(2).find((r) => r.exact);
  assert.equal(even.hunting, false, '20 and 10 share a factor of 10');
});

test('nonsense targets return nothing rather than guessing', () => {
  for (const bad of [0, NaN, 'x', Infinity, null]) assert.deepEqual(findPairs(bad), []);
});

test('a negative target is read as a magnitude — direction is the mesh, not the ratio', () => {
  assert.deepEqual(findPairs(-3), findPairs(3));
});

test('a ratio too big for one stage is split over two', () => {
  const single = findPairs(40, { maxTeeth: 80, tolerancePct: 1 });
  assert.equal(single.length, 0, '40:1 is not available from 80 teeth or fewer');

  const compound = findCompound(40, { maxTeeth: 80 });
  assert.ok(compound.length > 0);
  assert.equal(compound[0].stages.length, 2);
  assert.ok(Math.abs(stageRatio(compound[0].stages) - compound[0].ratio) < 1e-12);
});

test('no compound stage exceeds the workshop rule of thumb', () => {
  const results = findCompound(30, { maxTeeth: 80, maxStageRatio: 7 });
  assert.ok(results.length > 0);
  for (const r of results) {
    for (const stage of r.stages) {
      const ratio = stage.z2 / stage.z1;
      assert.ok(ratio <= 7 + 1e-9 && ratio >= 1 / 7 - 1e-9, `stage ratio ${ratio}`);
    }
  }
});

test('an exactly achievable compound ratio comes back exact', () => {
  const results = findCompound(36, { maxTeeth: 80 });     // 6 × 6
  assert.equal(results[0].exact, true);
  assert.ok(Math.abs(results[0].ratio - 36) < 1e-12);
});

test('the same two stages in the other order are one answer', () => {
  const results = findCompound(12, { maxTeeth: 60, limit: 60 });
  const keys = results.map((r) => r.stages.map((s) => `${s.z2}/${s.z1}`).sort().join('·'));
  assert.equal(new Set(keys).size, keys.length);
});

test('planetary sets are only offered if they can actually be assembled', () => {
  const results = findPlanetary(5, { planets: 3 });
  assert.ok(results.length > 0);
  for (const r of results) {
    assert.equal(ringTeeth(r.zSun, r.zPlanet), r.zRing, 'the planet spans the gap');
    assert.equal(planetTeeth(r.zSun, r.zRing), r.zPlanet);
    assert.equal(assemblyCondition(r.zSun, r.zRing, 3).ok, true);
    assert.ok(Math.abs(1 + r.zRing / r.zSun - r.ratio) < 1e-12);
  }
});

test('a planetary set with the ring held cannot reduce by less than 2', () => {
  assert.deepEqual(findPlanetary(1.5), [], 'z_ring > z_sun forces the ratio above 2');
  assert.deepEqual(findPlanetary(1), []);
  assert.ok(findPlanetary(4).length > 0);
});

test('a planetary target that lands exactly is reported as exact', () => {
  const results = findPlanetary(4, { planets: 3 });
  assert.ok(results.some((r) => r.exact), '3 × sun = ring gives exactly 4:1');
  assert.equal(results[0].exact, true);
});

test('more planets means fewer sets survive the assembly condition', () => {
  const three = findPlanetary(5, { planets: 3, limit: 50 });
  const five = findPlanetary(5, { planets: 5, limit: 50 });
  assert.ok(three.length >= five.length);
  for (const r of five) assert.equal(assemblyCondition(r.zSun, r.zRing, 5).ok, true);
});

test('stageRatio multiplies the stages, which is why compounds work', () => {
  assert.equal(stageRatio([{ z1: 10, z2: 30 }, { z1: 10, z2: 30 }]), 9);
  assert.equal(stageRatio([]), 1);
});

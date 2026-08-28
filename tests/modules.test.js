import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MODULE_I, MODULE_II, DP_SERIES, SERIES,
  moduleFromDP, dpFromModule, circularPitch,
  nearestModule, nearestDP, seriesFor, isStandardModule, moduleForCentreDistance,
} from '../js/modules.js';

test('the ISO 54 series are sorted, positive and disjoint', () => {
  for (const list of [MODULE_I, MODULE_II, [...DP_SERIES].reverse()]) {
    for (let i = 1; i < list.length; i += 1) assert.ok(list[i] > list[i - 1], `${list[i]} > ${list[i - 1]}`);
    assert.ok(list.every((v) => v > 0));
  }
  for (const v of MODULE_II) assert.ok(!MODULE_I.includes(v), `${v} appears in both series`);
});

test('module and diametral pitch are reciprocals through 25.4', () => {
  assert.ok(Math.abs(moduleFromDP(24) - 25.4 / 24) < 1e-12);
  assert.ok(Math.abs(dpFromModule(moduleFromDP(32)) - 32) < 1e-12);
  // A 1 module gear and a 25.4 DP gear are the same gear.
  assert.ok(Math.abs(dpFromModule(1) - 25.4) < 1e-12);
});

test('circular pitch is pi times module', () => {
  assert.ok(Math.abs(circularPitch(2) - 2 * Math.PI) < 1e-12);
});

test('nearestModule snaps to series I by default', () => {
  assert.equal(nearestModule(1.9, 'I').value, 2);
  assert.equal(nearestModule(1.3, 'I').value, 1.25);
  assert.equal(nearestModule(0.73, 'I').value, 0.8);
  assert.equal(nearestModule(2, 'I').deviationPct, 0);
});

test('series II is offered as an addition to series I, not a replacement', () => {
  assert.ok(SERIES.II.values.includes(1.25));
  assert.ok(SERIES.II.values.includes(1.125));
  assert.equal(nearestModule(1.13, 'II').value, 1.125);
  // The same input under series I has to climb to 1.25.
  assert.equal(nearestModule(1.13, 'I').value, 1.25);
});

test('deviationPct is signed relative to the value asked for', () => {
  const up = nearestModule(1.9, 'I');
  assert.ok(up.deviationPct > 0, 'snapping up is a positive deviation');
  const down = nearestModule(2.1, 'I');
  assert.ok(down.deviationPct < 0, 'snapping down is a negative deviation');
});

test('"any" passes the value through but still reports whether it is standard', () => {
  const odd = nearestModule(1.9, 'any');
  assert.equal(odd.value, 1.9);
  assert.equal(odd.standard, false);
  assert.equal(odd.deviationPct, 0);

  const round = nearestModule(2, 'any');
  assert.equal(round.standard, true);
  assert.equal(round.series, 'I');
});

test('nearestModule rejects nonsense rather than guessing', () => {
  for (const bad of [0, -1, NaN, 'x']) {
    assert.ok(Number.isNaN(nearestModule(bad, 'I').value));
  }
});

test('seriesFor names the series a module belongs to', () => {
  assert.equal(seriesFor(1.5), 'I');
  assert.equal(seriesFor(1.75), 'II');
  assert.equal(seriesFor(1.9), null);
  assert.equal(isStandardModule(3), true);
  assert.equal(isStandardModule(3.1), false);
});

test('every series value snaps to itself', () => {
  for (const m of MODULE_I) assert.equal(nearestModule(m, 'I').value, m);
  for (const m of SERIES.II.values) assert.equal(nearestModule(m, 'II').value, m);
});

test('nearestDP snaps to a stocked cutter pitch', () => {
  assert.equal(nearestDP(23).value, 24);
  assert.equal(nearestDP(9).value, 10);
  assert.ok(Number.isNaN(nearestDP(-2).value));
});

test('moduleForCentreDistance inverts the centre-distance formula', () => {
  // 20 and 40 teeth at module 2 sit 60 mm apart.
  assert.ok(Math.abs(moduleForCentreDistance(60, 20, 40) - 2) < 1e-12);
  // An internal pair uses the difference: (80 - 20)/2 * 2 = 60.
  assert.ok(Math.abs(moduleForCentreDistance(60, 20, 80, { internal: true }) - 2) < 1e-12);
  assert.ok(Number.isNaN(moduleForCentreDistance(60, 0, 0)));
});

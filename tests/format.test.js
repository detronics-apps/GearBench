import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sig, fmtNum, gcd, reduceRatio, fmtRatio, fmtSigned,
  fmtRpm, fmtMm, fmtPct, fmtDirection, turnsClockwise,
} from '../js/format.js';

test('sig rounds to significant figures, not decimal places', () => {
  assert.equal(sig(19.6078431373, 3), 19.6);
  assert.equal(sig(0.00123456, 3), 0.00123);
  assert.equal(sig(123456, 2), 120000);
  assert.equal(sig(-4.5678, 3), -4.57);
  assert.equal(sig(0, 4), 0);
});

test('sig is safe on non-numbers', () => {
  assert.equal(sig(NaN), 0);
  assert.equal(sig(Infinity), 0);
});

test('fmtNum never leaks full float precision into prose', () => {
  assert.equal(fmtNum(19.6078431373, 3), '19.6');
  assert.equal(fmtNum(1 / 3, 4), '0.3333');
  assert.equal(fmtNum(1500, 4), '1500');
  assert.equal(fmtNum(0), '0');
  assert.equal(fmtNum(NaN), '—');
});

test('fmtNum trims trailing zeros but keeps the value exact', () => {
  assert.equal(fmtNum(2.5, 4), '2.5');
  assert.equal(fmtNum(2.0, 4), '2');
  assert.equal(fmtNum(60.00001, 4), '60');
});

test('gcd and reduceRatio put a tooth pair in lowest terms', () => {
  assert.equal(gcd(40, 16), 8);
  assert.equal(gcd(17, 5), 1);
  assert.deepEqual(reduceRatio(40, 16), { a: 5, b: 2, divisor: 8 });
  // A hunting pair shares no factor, so it reduces to itself.
  assert.deepEqual(reduceRatio(17, 5), { a: 17, b: 5, divisor: 1 });
});

test('fmtRatio flips for an overdrive so the ": 1" side is always the big one', () => {
  assert.equal(fmtRatio(3.75), '3.75 : 1');
  assert.equal(fmtRatio(-3.75), '3.75 : 1');
  assert.equal(fmtRatio(0.25), '1 : 4');
  assert.equal(fmtRatio(0), '—');
});

test('fmtSigned uses a real minus sign and collapses float noise to zero', () => {
  assert.equal(fmtSigned(12.3), '+12.3');
  assert.equal(fmtSigned(-12.3), '−12.3');
  assert.equal(fmtSigned(1e-15), '0');
});

test('unit helpers append the unit once', () => {
  assert.equal(fmtRpm(1500), '1500 rpm');
  assert.equal(fmtMm(37.5), '37.5 mm');
  assert.equal(fmtPct(2.13456), '+2.13%');
  assert.equal(fmtPct(0), '0%');
});

test('direction is words, taken from the sign', () => {
  // A positive speed turns ANTICLOCKWISE on screen. The drawing is a faithful
  // rendering of maths coordinates, where a positive angle is anticlockwise,
  // and that is what the animation actually does.
  assert.equal(fmtDirection(120), 'anticlockwise');
  assert.equal(fmtDirection(-120), 'clockwise');
  assert.equal(fmtDirection(0), 'stationary');
});

test('turnsClockwise is the single source of the rotation convention', () => {
  assert.equal(turnsClockwise(-120), true);
  assert.equal(turnsClockwise(120), false);
  // and the words never disagree with it
  for (const rpm of [-1000, -1, 1, 1000]) {
    assert.equal(fmtDirection(rpm), turnsClockwise(rpm) ? 'clockwise' : 'anticlockwise');
  }
});

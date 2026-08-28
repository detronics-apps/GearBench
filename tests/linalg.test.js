import test from 'node:test';
import assert from 'node:assert/strict';

import { solveLinear, multiply, residual } from '../js/linalg.js';

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

test('a determined system is solved exactly', () => {
  const A = [[2, 1], [1, -1]];
  const b = [5, 1];
  const r = solveLinear(A, b);
  assert.equal(r.status, 'unique');
  assert.equal(r.rank, 2);
  assert.equal(r.dof, 0);
  assert.ok(close(r.x[0], 2));
  assert.ok(close(r.x[1], 1));
  assert.ok(residual(A, b, r.x) < 1e-12);
});

test('row order and scaling do not change the answer', () => {
  const base = solveLinear([[2, 1], [1, -1]], [5, 1]).x;
  const swapped = solveLinear([[1, -1], [2, 1]], [1, 5]).x;
  const scaled = solveLinear([[2e6, 1e6], [1, -1]], [5e6, 1]).x;
  for (let i = 0; i < 2; i += 1) {
    assert.ok(close(base[i], swapped[i], 1e-9));
    assert.ok(close(base[i], scaled[i], 1e-6));
  }
});

test('an underdetermined system reports how many degrees of freedom are left', () => {
  // x + y + z = 6, with nothing else said: two degrees of freedom.
  const r = solveLinear([[1, 1, 1]], [6]);
  assert.equal(r.status, 'underdetermined');
  assert.equal(r.rank, 1);
  assert.equal(r.dof, 2);
  assert.deepEqual(r.freeColumns, [1, 2]);
  // The particular solution puts the free variables at zero.
  assert.deepEqual(r.x, [6, 0, 0]);
});

test('the nullspace basis really is in the nullspace', () => {
  const A = [[1, 1, 1], [1, 2, 3]];
  const r = solveLinear(A, [6, 14]);
  assert.equal(r.dof, 1);
  assert.equal(r.nullspace.length, 1);
  for (const value of multiply(A, r.nullspace[0])) assert.ok(close(value, 0));
  // and the particular solution plus any multiple of it still solves the system
  const shifted = r.x.map((v, i) => v + 3.7 * r.nullspace[0][i]);
  assert.ok(residual(A, [6, 14], shifted) < 1e-9);
});

test('contradictory equations are reported, not averaged away', () => {
  const r = solveLinear([[1, 1], [1, 1]], [2, 3]);
  assert.equal(r.status, 'inconsistent');
  assert.equal(r.x, null);
});

test('a redundant equation is not mistaken for a contradiction', () => {
  const r = solveLinear([[1, 1], [2, 2], [1, -1]], [2, 4, 0]);
  assert.equal(r.status, 'unique');
  assert.ok(close(r.x[0], 1));
  assert.ok(close(r.x[1], 1));
});

test('more equations than unknowns is fine when they agree', () => {
  const A = [[1, 0], [0, 1], [1, 1]];
  const r = solveLinear(A, [3, 4, 7]);
  assert.equal(r.status, 'unique');
  assert.deepEqual(r.x.map((v) => Math.round(v)), [3, 4]);
});

test('an all-zero row with a zero right-hand side says nothing at all', () => {
  const r = solveLinear([[0, 0], [1, 1]], [0, 2]);
  assert.equal(r.status, 'underdetermined');
  assert.equal(r.dof, 1);
});

test('an empty system is entirely free', () => {
  const r = solveLinear([], []);
  assert.equal(r.status, 'underdetermined');
  assert.equal(r.rank, 0);
});

test('residual is infinite when there is no solution to check', () => {
  assert.equal(residual([[1]], [1], null), Infinity);
});

test('a ten-variable chain solves and holds', () => {
  // x0 = 1, then x_{i+1} = -2·x_i — the shape a gear train actually produces.
  const n = 10;
  const A = [];
  const b = [];
  const first = new Array(n).fill(0);
  first[0] = 1;
  A.push(first);
  b.push(1);
  for (let i = 0; i + 1 < n; i += 1) {
    const row = new Array(n).fill(0);
    row[i] = 2;
    row[i + 1] = 1;
    A.push(row);
    b.push(0);
  }
  const r = solveLinear(A, b);
  assert.equal(r.status, 'unique');
  assert.ok(close(r.x[9], (-2) ** 9, 1e-6));
  assert.ok(residual(A, b, r.x) < 1e-6);
});

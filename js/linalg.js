/**
 * A small dense linear solver. Pure.
 *
 * A gear train is a set of simultaneous equations — one per mesh, one per
 * shaft, one per planetary set, one per speed you pin down — and the useful
 * answer is not only "here are the speeds". It is also "you have not said
 * enough yet" (two degrees of freedom left, which is exactly what an
 * unconstrained planetary set feels like) or "these cannot both be true".
 *
 * So this returns the rank as well as the solution, and names the variables
 * that are still free rather than silently picking a value for them.
 */

/**
 * Solve A·x = b.
 *
 * @param {number[][]} A  rows of coefficients
 * @param {number[]} b    right-hand side, one per row
 * @param {object} [options]
 * @param {number} [options.tolerance] below this a pivot counts as zero
 * @returns {{
 *   status: 'unique'|'underdetermined'|'inconsistent',
 *   x: number[]|null, rank: number, dof: number,
 *   freeColumns: number[], nullspace: number[][],
 * }}
 */
export function solveLinear(A, b, { tolerance = 1e-9 } = {}) {
  const rows = A.length;
  const cols = rows ? A[0].length : 0;
  if (!rows || !cols) {
    return { status: 'underdetermined', x: null, rank: 0, dof: cols, freeColumns: range(cols), nullspace: identityBasis(cols) };
  }

  // Work on a copy, in augmented form.
  const M = A.map((row, i) => [...row.map(Number), Number(b[i] ?? 0)]);

  // Scale the tolerance to the size of the numbers actually in the matrix, so
  // a train in rpm and a train in rad/s behave the same way.
  const magnitude = Math.max(1, ...M.flat().map((v) => Math.abs(v)).filter(Number.isFinite));
  const eps = tolerance * magnitude;

  const pivotOf = [];              // pivotOf[r] = the column pivoted on in row r
  let row = 0;

  for (let col = 0; col < cols && row < rows; col += 1) {
    // Partial pivoting: the largest entry left in this column.
    let best = row;
    for (let r = row + 1; r < rows; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[best][col])) best = r;
    }
    if (Math.abs(M[best][col]) <= eps) continue;      // no pivot here — free column
    [M[row], M[best]] = [M[best], M[row]];

    const pivot = M[row][col];
    for (let c = col; c <= cols; c += 1) M[row][c] /= pivot;

    for (let r = 0; r < rows; r += 1) {
      if (r === row) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= cols; c += 1) M[r][c] -= factor * M[row][c];
    }
    pivotOf[row] = col;
    row += 1;
  }

  const rank = row;

  // A row of all zeros with a non-zero right-hand side says 0 = something.
  for (let r = rank; r < rows; r += 1) {
    if (Math.abs(M[r][cols]) > eps) {
      return { status: 'inconsistent', x: null, rank, dof: cols - rank, freeColumns: [], nullspace: [] };
    }
  }

  const pivotColumns = pivotOf.slice(0, rank);
  const freeColumns = range(cols).filter((c) => !pivotColumns.includes(c));

  // The particular solution with every free variable set to zero.
  const x = new Array(cols).fill(0);
  for (let r = 0; r < rank; r += 1) x[pivotColumns[r]] = M[r][cols];

  if (!freeColumns.length) {
    return { status: 'unique', x, rank, dof: 0, freeColumns, nullspace: [] };
  }

  // One basis vector per free variable: set it to 1, back out the pivots.
  const nullspace = freeColumns.map((free) => {
    const v = new Array(cols).fill(0);
    v[free] = 1;
    for (let r = 0; r < rank; r += 1) v[pivotColumns[r]] = -M[r][free];
    return v;
  });

  return { status: 'underdetermined', x, rank, dof: freeColumns.length, freeColumns, nullspace };
}

const range = (n) => Array.from({ length: n }, (_, i) => i);
const identityBasis = (n) => range(n).map((i) => { const v = new Array(n).fill(0); v[i] = 1; return v; });

/** A·x, for checking a solution against the equations it came from. */
export function multiply(A, x) {
  return A.map((row) => row.reduce((sum, coefficient, i) => sum + coefficient * x[i], 0));
}

/** The largest absolute residual of A·x − b. Zero means the solution holds. */
export function residual(A, b, x) {
  if (!x) return Infinity;
  return Math.max(0, ...multiply(A, x).map((value, i) => Math.abs(value - (b[i] ?? 0))));
}

/**
 * Preferred gear sizes. Pure.
 *
 * The same idea as the E-series for resistors: cutters, hobs and stock gears
 * only exist in certain sizes, so a design that lands between them cannot be
 * bought or cut. ISO 54 fixes the metric module series; imperial practice uses
 * whole-number diametral pitch.
 *
 * Series I is the first choice; Series II is used only when Series I will not
 * do. Modules outside both are special-order, which is worth saying out loud.
 */

/** ISO 54 series I — the preferred metric modules, in mm. */
export const MODULE_I = [
  0.1, 0.12, 0.16, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8,
  1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50,
];

/** ISO 54 series II — the second choice, in mm. */
export const MODULE_II = [
  0.11, 0.14, 0.18, 0.22, 0.28, 0.35, 0.45, 0.55, 0.7, 0.9,
  1.125, 1.375, 1.75, 2.25, 2.75, 3.5, 4.5, 5.5, 7, 9, 11, 14, 18, 22, 28, 36, 45,
];

/** Diametral pitch values a cutter is normally stocked in, teeth per inch. */
export const DP_SERIES = [96, 80, 72, 64, 48, 40, 32, 24, 20, 16, 12, 10, 8, 6, 5, 4, 3, 2, 1];

const MM_PER_INCH = 25.4;

export const SERIES = {
  I: { id: 'I', label: 'ISO 54 series I', values: MODULE_I },
  II: { id: 'II', label: 'ISO 54 series I + II', values: [...MODULE_I, ...MODULE_II].sort((a, b) => a - b) },
  any: { id: 'any', label: 'Any module', values: null },
};

/** Module (mm) from diametral pitch (teeth per inch), and back. */
export const moduleFromDP = (dp) => MM_PER_INCH / dp;
export const dpFromModule = (m) => MM_PER_INCH / m;

/** Circular pitch (mm) — the arc from one tooth to the next on the pitch circle. */
export const circularPitch = (m) => Math.PI * m;

/**
 * The nearest stocked module to `value`.
 * @returns {{value:number, series:'I'|'II'|null, standard:boolean, deviationPct:number}}
 */
export function nearestModule(value, seriesId = 'I') {
  const target = Number(value);
  if (!Number.isFinite(target) || target <= 0) {
    return { value: NaN, series: null, standard: false, deviationPct: NaN };
  }
  const list = SERIES[seriesId]?.values;
  if (!list) return { value: target, series: seriesFor(target), standard: isStandardModule(target), deviationPct: 0 };

  // Nearest in log space: a module is a scale factor, so 1.9 sits between 1.5
  // and 2 the way a ratio does, not the way a length does.
  let best = list[0];
  let bestErr = Infinity;
  for (const candidate of list) {
    const err = Math.abs(Math.log(candidate / target));
    if (err < bestErr - 1e-12) { bestErr = err; best = candidate; }
  }
  return {
    value: best,
    series: seriesFor(best),
    standard: true,
    deviationPct: ((best - target) / target) * 100,
  };
}

/** Which ISO 54 series a module belongs to, or null if it is neither. */
export function seriesFor(value) {
  const near = (list) => list.some((v) => Math.abs(v - value) < 1e-9);
  if (near(MODULE_I)) return 'I';
  if (near(MODULE_II)) return 'II';
  return null;
}

export const isStandardModule = (value) => seriesFor(value) !== null;

/** The nearest stocked diametral pitch, for imperial work. */
export function nearestDP(value) {
  const target = Number(value);
  if (!Number.isFinite(target) || target <= 0) return { value: NaN, standard: false, deviationPct: NaN };
  let best = DP_SERIES[0];
  let bestErr = Infinity;
  for (const candidate of DP_SERIES) {
    const err = Math.abs(Math.log(candidate / target));
    if (err < bestErr - 1e-12) { bestErr = err; best = candidate; }
  }
  return {
    value: best,
    standard: true,
    deviationPct: ((best - target) / target) * 100,
  };
}

/**
 * The module that puts two gears on a required centre distance.
 * Externally meshing gears sit at a = m(z1 + z2)/2, so the centre distance
 * chooses the module once the tooth counts are fixed.
 */
export function moduleForCentreDistance(a, z1, z2, { internal = false } = {}) {
  const sum = internal ? Math.abs(z2 - z1) : z1 + z2;
  if (!sum) return NaN;
  return (2 * a) / sum;
}

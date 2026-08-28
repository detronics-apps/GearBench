/**
 * The ratio solver. Pure.
 *
 * Working forwards — "these teeth give this ratio" — is arithmetic. The
 * question people actually have is backwards: *I need 12.5 : 1, what do I
 * cut?* Tooth counts are whole numbers, so an exact answer usually does not
 * exist, and the useful reply is a shortlist of real gears ranked by how close
 * they land and how big they are.
 */

import { reduceRatio } from './format.js';
import { assemblyCondition, neighbourClearance, planetTeeth } from './planetary.js';

const errorPct = (actual, target) => ((actual - target) / target) * 100;

/**
 * Single-stage pairs closest to a target ratio.
 *
 * Ranked by error first and total teeth second, because between two equally
 * accurate answers the smaller gearbox wins every time.
 */
export function findPairs(target, {
  minTeeth = 10, maxTeeth = 120, limit = 12, tolerancePct = 5,
} = {}) {
  const wanted = Math.abs(Number(target));
  if (!Number.isFinite(wanted) || wanted <= 0) return [];

  const seen = new Set();
  const out = [];
  for (let z1 = minTeeth; z1 <= maxTeeth; z1 += 1) {
    const ideal = z1 * wanted;
    for (const z2 of [Math.floor(ideal), Math.ceil(ideal)]) {
      if (z2 < minTeeth || z2 > maxTeeth) continue;
      const reduced = reduceRatio(z2, z1);
      const key = `${reduced.a}/${reduced.b}`;
      if (seen.has(key)) continue;

      const ratio = z2 / z1;
      const error = errorPct(ratio, wanted);
      if (Math.abs(error) > tolerancePct) continue;
      seen.add(key);
      out.push({
        stages: [{ z1, z2 }],
        ratio,
        errorPct: error,
        exact: Math.abs(error) < 1e-12,
        teeth: z1 + z2,
        hunting: reduced.divisor === 1,
      });
    }
  }
  return rank(out, limit);
}

/**
 * Two-stage compound trains closest to a target ratio.
 *
 * Splitting a large ratio over two stages is what makes it buildable: a single
 * 40:1 pair needs a wheel forty times the pinion, which is a wheel nobody wants
 * to make. `maxStageRatio` is the usual workshop rule of thumb.
 */
export function findCompound(target, {
  minTeeth = 10, maxTeeth = 80, limit = 12, maxStageRatio = 7, tolerancePct = 2,
} = {}) {
  const wanted = Math.abs(Number(target));
  if (!Number.isFinite(wanted) || wanted <= 0) return [];

  const seen = new Set();
  const out = [];
  // The first stage is searched around the square root of the target, which is
  // where a balanced split lives; the second stage is then whatever is left.
  for (let z1 = minTeeth; z1 <= maxTeeth; z1 += 1) {
    for (let z2 = minTeeth; z2 <= maxTeeth; z2 += 1) {
      const first = z2 / z1;
      if (first < 1 / maxStageRatio || first > maxStageRatio) continue;
      const need = wanted / first;
      if (need < 1 / maxStageRatio || need > maxStageRatio) continue;

      for (let z3 = minTeeth; z3 <= maxTeeth; z3 += 1) {
        const ideal = z3 * need;
        for (const z4 of [Math.floor(ideal), Math.ceil(ideal)]) {
          if (z4 < minTeeth || z4 > maxTeeth) continue;
          const ratio = first * (z4 / z3);
          const error = errorPct(ratio, wanted);
          if (Math.abs(error) > tolerancePct) continue;

          const a = reduceRatio(z2, z1);
          const b = reduceRatio(z4, z3);
          const key = [`${a.a}/${a.b}`, `${b.a}/${b.b}`].sort().join('·');
          if (seen.has(key)) continue;
          seen.add(key);

          out.push({
            stages: [{ z1, z2 }, { z1: z3, z2: z4 }],
            ratio,
            errorPct: error,
            exact: Math.abs(error) < 1e-12,
            teeth: z1 + z2 + z3 + z4,
            hunting: a.divisor === 1 && b.divisor === 1,
          });
        }
      }
    }
  }
  return rank(out, limit);
}

/**
 * Planetary sets closest to a target reduction, with the ring held and the sun
 * driven — the arrangement that gives 1 + z_ring/z_sun.
 *
 * Only sets that can actually be built are offered: the ring and sun differing
 * by an even number, the assembly condition satisfied, and the planets clearing
 * each other.
 */
export function findPlanetary(target, {
  minSun = 12, maxSun = 60, maxRing = 140, planets = 3, limit = 12, tolerancePct = 5, m = 2,
} = {}) {
  const wanted = Math.abs(Number(target));
  if (!Number.isFinite(wanted) || wanted <= 1) return [];

  const out = [];
  for (let zSun = minSun; zSun <= maxSun; zSun += 1) {
    const ideal = zSun * (wanted - 1);                       // z_ring for an exact hit
    for (const zRing of [Math.floor(ideal), Math.ceil(ideal)]) {
      if (zRing <= zSun || zRing > maxRing) continue;
      const zPlanet = planetTeeth(zSun, zRing);
      if (!Number.isInteger(zPlanet) || zPlanet < 8) continue;
      if (!assemblyCondition(zSun, zRing, planets).ok) continue;
      if (!neighbourClearance({ m, zSun, zPlanet, count: planets }).ok) continue;

      const ratio = 1 + zRing / zSun;
      const error = errorPct(ratio, wanted);
      if (Math.abs(error) > tolerancePct) continue;
      out.push({
        zSun, zRing, zPlanet, planets,
        ratio,
        errorPct: error,
        exact: Math.abs(error) < 1e-12,
        teeth: zSun + zRing + zPlanet * planets,
      });
    }
  }
  return rank(out, limit);
}

/** Closest first; between equals, the one with fewer teeth to cut. */
function rank(list, limit) {
  return list
    .sort((a, b) => Math.abs(a.errorPct) - Math.abs(b.errorPct) || a.teeth - b.teeth)
    .slice(0, limit);
}

/** The ratio a list of stages actually produces. */
export const stageRatio = (stages) => stages.reduce((total, s) => total * (s.z2 / s.z1), 1);

/**
 * Involute spur gear geometry. Pure — no DOM, no globals.
 *
 * Everything here follows from one idea: a gear is a circle that rolls without
 * slipping. That circle is the *pitch circle*, its diameter is d = m·z, and
 * two gears mesh when their pitch circles touch. The teeth exist only to stop
 * the circles slipping, and their flanks are involutes of a smaller *base
 * circle* because that is the one curve that keeps the ratio constant even if
 * the centres are not exactly where you meant them to be.
 *
 * Units: mm and degrees in, mm and radians out (angles are named `...Rad`
 * where they are radians, and `alphaDeg` where they are degrees).
 */

export const DEG = Math.PI / 180;

/** Standard full-depth ISO 53 basic rack. */
export const BASIC_RACK = Object.freeze({
  alphaDeg: 20,   // pressure angle
  haCoef: 1.0,    // addendum, in modules
  hfCoef: 1.25,   // dedendum, in modules — the extra 0.25 is tip clearance
});

/** The involute function, inv(α) = tan α − α. */
export const involute = (alphaRad) => Math.tan(alphaRad) - alphaRad;

/**
 * Invert the involute function. There is no closed form, so this is Newton's
 * method from the standard cube-root seed; it converges in a handful of steps
 * for every angle a gear can actually have.
 */
export function involuteInverse(value, { tolerance = 1e-12, maxSteps = 60 } = {}) {
  if (!Number.isFinite(value) || value < 0) return NaN;
  if (value === 0) return 0;
  let a = Math.cbrt(3 * value);
  for (let i = 0; i < maxSteps; i += 1) {
    const f = Math.tan(a) - a - value;
    const slope = Math.tan(a) ** 2;          // d/da (tan a − a) = tan²a
    if (!Number.isFinite(slope) || slope === 0) break;
    const step = f / slope;
    a -= step;
    if (Math.abs(step) < tolerance) break;
  }
  return a;
}

/** Fewest teeth a gear can have before the cutter undercuts its own flank. */
export function minTeethNoUndercut(alphaDeg = 20, haCoef = 1) {
  return (2 * haCoef) / Math.sin(alphaDeg * DEG) ** 2;
}

/** The profile shift that just avoids undercut on a gear of `z` teeth. */
export function minProfileShift(z, alphaDeg = 20, haCoef = 1) {
  return haCoef - (z * Math.sin(alphaDeg * DEG) ** 2) / 2;
}

/**
 * Every dimension of one gear.
 *
 * @param {object} spec
 * @param {number} spec.m       module, mm
 * @param {number} spec.z       number of teeth
 * @param {number} [spec.alphaDeg] pressure angle, degrees
 * @param {number} [spec.x]     profile shift coefficient
 * @param {boolean} [spec.internal] true for a ring gear (teeth pointing inward)
 */
export function gearGeometry(spec) {
  const {
    m, z,
    alphaDeg = BASIC_RACK.alphaDeg,
    x = 0,
    haCoef = BASIC_RACK.haCoef,
    hfCoef = BASIC_RACK.hfCoef,
    internal = false,
  } = spec;

  const alphaRad = alphaDeg * DEG;
  const d = m * z;
  const r = d / 2;
  const rb = r * Math.cos(alphaRad);

  // On an internal gear the addendum points inward, so tip and root swap sides
  // of the pitch circle. Everything else is identical.
  const addendum = m * (haCoef + (internal ? -x : x));
  const dedendum = m * (hfCoef + (internal ? x : -x));
  const ra = internal ? r - addendum : r + addendum;
  const rf = internal ? r + dedendum : r - dedendum;

  // Arc thickness of the tooth on the pitch circle. A positive shift fattens
  // an external tooth and thins an internal one.
  const s = m * (Math.PI / 2 + (internal ? -1 : 1) * 2 * x * Math.tan(alphaRad));
  const halfAngleAtPitch = s / (2 * r);

  // Thickness where the flank runs out, at the tip of an external tooth.
  const tip = tipThickness({ r, rb, ra, halfAngleAtPitch, alphaRad, internal });

  const zMin = minTeethNoUndercut(alphaDeg, haCoef);
  const xMin = minProfileShift(z, alphaDeg, haCoef);

  return {
    m, z, alphaDeg, alphaRad, x, haCoef, hfCoef, internal,

    d, r,
    db: 2 * rb, rb,
    da: 2 * ra, ra,
    df: 2 * rf, rf,

    addendum,
    dedendum,
    wholeDepth: addendum + dedendum,
    clearance: m * (hfCoef - haCoef),

    circularPitch: Math.PI * m,
    basePitch: Math.PI * m * Math.cos(alphaRad),
    toothThickness: s,
    spaceWidth: Math.PI * m - s,
    halfAngleAtPitch,

    tipThickness: tip.thickness,
    tipHalfAngle: tip.halfAngle,
    pointed: tip.halfAngle <= 0,

    zMin,
    xMin,
    undercut: !internal && x < xMin - 1e-9,
    // Below the base circle there is no involute left to cut.
    tipBelowBase: !internal && ra <= rb,
  };
}

function tipThickness({ r, rb, ra, halfAngleAtPitch, alphaRad, internal }) {
  // The tip of an internal tooth sits at the smaller radius but the flank runs
  // the other way, so the half-angle grows outward rather than shrinking.
  const usable = internal ? Math.max(ra, rb) : ra;
  if (usable < rb) return { thickness: 0, halfAngle: 0 };
  const alphaAtTip = Math.acos(Math.min(1, rb / usable));
  const delta = involute(alphaRad) - involute(alphaAtTip);
  const halfAngle = internal ? halfAngleAtPitch - delta : halfAngleAtPitch + delta;
  return { thickness: 2 * usable * halfAngle, halfAngle };
}

/**
 * Reference centre distance — where two gears sit with no profile shift.
 * External gears add their radii; a pinion inside a ring subtracts them.
 */
export function centreDistance({ m, z1, z2, internal = false }) {
  return internal ? (m * Math.abs(z2 - z1)) / 2 : (m * (z1 + z2)) / 2;
}

/**
 * Profile shift moves the gears apart. `aw` is where they actually have to sit
 * for the flanks still to roll on each other, and `alphaW` is the pressure
 * angle they operate at once they are there.
 */
export function workingMesh({ m, z1, z2, x1 = 0, x2 = 0, alphaDeg = 20, internal = false }) {
  const alphaRad = alphaDeg * DEG;
  const a = centreDistance({ m, z1, z2, internal });
  const sumZ = internal ? z2 - z1 : z1 + z2;
  const sumX = internal ? x2 - x1 : x1 + x2;

  if (Math.abs(sumX) < 1e-15 || sumZ === 0) {
    return { a, aw: a, alphaW: alphaRad, alphaWDeg: alphaDeg, sumX, centreChange: 0 };
  }

  const invW = involute(alphaRad) + (2 * Math.tan(alphaRad) * sumX) / sumZ;
  const alphaW = involuteInverse(invW);
  const aw = a * (Math.cos(alphaRad) / Math.cos(alphaW));
  return { a, aw, alphaW, alphaWDeg: alphaW / DEG, sumX, centreChange: aw - a };
}

/**
 * Transverse contact ratio: the average number of tooth pairs carrying load.
 * Below 1.0 the drive would let go between teeth, so it must exceed 1; below
 * about 1.2 it is rough and noisy.
 */
export function contactRatio(g1, g2, { aw, alphaW } = {}) {
  const internal = g1.internal || g2.internal;
  const a = aw ?? centreDistance({ m: g1.m, z1: g1.z, z2: g2.z, internal });
  const angle = alphaW ?? g1.alphaRad;

  const leg = (g) => Math.sqrt(Math.max(0, g.ra ** 2 - g.rb ** 2));
  const pb = Math.PI * g1.m * Math.cos(g1.alphaRad);

  const value = internal
    ? (leg(g1.internal ? g2 : g1) - leg(g1.internal ? g1 : g2) + a * Math.sin(angle)) / pb
    : (leg(g1) + leg(g2) - a * Math.sin(angle)) / pb;

  return value;
}

/** Pitch-line velocity in m/s, from a rotational speed in rpm. */
export const pitchLineVelocity = (d, rpm) => (Math.PI * d * Math.abs(rpm)) / 60000;

/** Tangential tooth force in N, from a torque in N·m on a pitch diameter in mm. */
export const tangentialForce = (torqueNm, d) => (d > 0 ? (2000 * torqueNm) / d : 0);

/** The separating force that tries to push the two shafts apart, in N. */
export const radialForce = (torqueNm, d, alphaDeg = 20) =>
  tangentialForce(torqueNm, d) * Math.tan(alphaDeg * DEG);

/**
 * Whether two gears can actually run together, and why not if they cannot.
 * Returns a list of plain-language problems rather than throwing: a design in
 * progress is allowed to be wrong for a moment.
 */
export function meshProblems(g1, g2, { internal = false } = {}) {
  const problems = [];

  if (Math.abs(g1.m - g2.m) > 1e-9) {
    problems.push({
      level: 'error',
      text: `Modules differ (${g1.m} and ${g2.m}). Two gears can only mesh at the same module — the teeth are literally a different size.`,
    });
  }
  if (Math.abs(g1.alphaDeg - g2.alphaDeg) > 1e-9) {
    problems.push({
      level: 'error',
      text: `Pressure angles differ (${g1.alphaDeg}° and ${g2.alphaDeg}°). The flank shapes will not roll on each other.`,
    });
  }
  if (internal) {
    const ring = g1.internal ? g1 : g2;
    const pinion = g1.internal ? g2 : g1;
    if (!ring.internal) {
      problems.push({ level: 'error', text: 'An internal mesh needs one of the pair to be a ring gear.' });
    } else if (ring.z - pinion.z < 10) {
      problems.push({
        level: 'warn',
        text: `Only ${ring.z - pinion.z} teeth difference. Below about 10, the pinion tip fouls the ring tooth on the way in (interference).`,
      });
    }
  }
  for (const g of [g1, g2]) {
    if (g.undercut) {
      problems.push({
        level: 'warn',
        text: `${g.z} teeth undercuts at ${g.alphaDeg}°. The cutter carves into the root of the flank, weakening the tooth. Add profile shift of at least ${g.xMin.toFixed(2)}, or use ${Math.ceil(g.zMin)} teeth.`,
      });
    }
    if (g.pointed) {
      problems.push({
        level: 'warn',
        text: `The teeth come to a point before reaching the tip circle. Reduce the profile shift or the addendum.`,
      });
    }
  }
  return problems;
}

/**
 * Tooth profile generation. Pure.
 *
 * The flank of a gear tooth is an *involute*: the curve a taut string traces as
 * it unwinds from the base circle. That is what makes the ratio constant — the
 * contact point slides along one fixed straight line, the line of action, no
 * matter where in the mesh the teeth happen to be, and the ratio survives a
 * centre distance that is a little off.
 *
 * Coordinates are mathematical: x right, y **up**, angles anticlockwise, tooth
 * zero centred on the +x axis, origin at the gear centre. SVG has y pointing
 * down, so the renderer flips it; DXF does not, so the export does not.
 */

import { involute, involuteInverse } from './gearmath.js';

const TAU = Math.PI * 2;

const polar = (radius, angle) => ({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });

/** An angle difference brought into (−π, π]. */
function wrap(angle) {
  let a = angle;
  while (a > Math.PI) a -= TAU;
  while (a <= -Math.PI) a += TAU;
  return a;
}

/**
 * Angular offset of the flank from the tooth centreline, at radius `rho`.
 *
 * At the pitch circle this is the half tooth thickness. Above it the tooth
 * narrows, below it the tooth widens — which is why a tooth is a wedge rather
 * than a peg, and why it is strongest exactly where the bending moment is.
 */
export function flankAngle(geometry, rho) {
  const { rb, alphaRad, halfAngleAtPitch, internal } = geometry;
  const alphaAtRho = Math.acos(Math.min(1, rb / Math.max(rho, rb)));
  const delta = involute(alphaRad) - involute(alphaAtRho);
  return internal ? halfAngleAtPitch - delta : halfAngleAtPitch + delta;
}

/**
 * The radius at which the two flanks of a tooth run together into a point.
 * Never below the base circle, because there is no involute down there to run
 * together in the first place.
 */
export function pointedRadius(geometry) {
  const { rb, alphaRad, halfAngleAtPitch, internal } = geometry;
  const target = internal
    ? involute(alphaRad) - halfAngleAtPitch
    : involute(alphaRad) + halfAngleAtPitch;
  if (!(target > 0)) return rb;
  return rb / Math.cos(involuteInverse(target));
}

/**
 * The four radii a profile is actually drawn between, once the base circle and
 * a pointed tip have had their say.
 *
 * `runout` marks the straight radial length that appears when the tip (of a
 * ring) or the root (of a gear) falls below the base circle: there is no
 * involute there, so the flank simply runs straight.
 */
export function profileRadii(geometry) {
  const { ra, rb, rf, internal } = geometry;
  const rp = pointedRadius(geometry);

  if (internal) {
    // `rp` falls back to the base circle when the tooth never comes to a point,
    // so a ring tooth is only truly pointed if that limit is above it.
    const pointed = rp > rb + 1e-9 && rp > ra;
    return {
      flankRoot: rf,                                  // ring roots sit outside the base circle
      flankTip: pointed ? rp : Math.max(ra, rb),
      tipR: pointed ? rp : ra,
      rootR: rf,
      runout: !pointed && ra < rb,
      pointed,
    };
  }
  const pointed = rp < ra;
  return {
    flankRoot: Math.max(rf, rb),
    flankTip: pointed ? rp : ra,
    tipR: pointed ? rp : ra,
    rootR: rf,
    runout: rf < rb,
    pointed,
  };
}

/**
 * One flank, sampled from the root end to the tip end as `{ r, phi }`.
 * Stepped uniformly in roll angle rather than in radius: that puts the points
 * where the curvature is, instead of bunching them all at the tip.
 */
export function flankSamples(geometry, steps = 14) {
  const { flankRoot, flankTip } = profileRadii(geometry);
  const { rb } = geometry;
  const angleAt = (rho) => Math.acos(Math.min(1, rb / Math.max(rho, rb)));
  const a0 = angleAt(flankRoot);
  const a1 = angleAt(flankTip);

  const lo = Math.min(flankRoot, flankTip);
  const hi = Math.max(flankRoot, flankTip);

  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const rho = Math.min(hi, Math.max(lo, rb / Math.cos(a)));
    out.push({ r: rho, phi: flankAngle(geometry, rho) });
  }
  return out;
}

/**
 * The root fillet: the arc rounding the corner where the flank meets the root
 * circle. Real gears have one, because a sharp internal corner is where a tooth
 * breaks. Constructed exactly — tangent to the straight run-out below the base
 * circle and tangent to the root circle — rather than eyeballed.
 *
 * It only exists where there is a corner to round. On a gear with enough teeth
 * that the root circle sits *outside* the base circle (above about 42 teeth at
 * 20°), and on every ring gear, the involute reaches the root by itself and
 * meets it at a glancing angle — around 16°, not 90° — so there is no corner
 * and the function returns null. The caller then runs the flank straight into
 * the root arc, which is what the metal does too.
 *
 * Returns null when there is no room for one.
 */
export function filletArc(geometry, rho, { steps = 6 } = {}) {
  if (!(rho > 0)) return null;
  const { rb, rf, z, internal } = geometry;

  // A fillet needs a straight length to be tangent to, and that only exists
  // where the profile runs radially below the base circle.
  if (internal || rf >= rb) return null;

  const R = rf + rho;                            // the fillet centre's own radius
  if (!(R > 0)) return null;

  const phi = flankAngle(geometry, rb);
  const start = polar(rb, -phi);                 // top of the radial run-out
  const u = { x: -Math.cos(-phi), y: -Math.sin(-phi) };   // continuing inward
  const startAngle = -phi;
  const pitchAngle = TAU / z;

  // The centre lies one fillet radius off that line, on the tooth-space side,
  // and one root radius from the axis. Both normals and both roots of the
  // quadratic are candidates.
  let best = null;
  for (const sign of [1, -1]) {
    const n = { x: -u.y * sign, y: u.x * sign };
    const q = { x: start.x + rho * n.x, y: start.y + rho * n.y };
    const b = q.x * u.x + q.y * u.y;
    const c = q.x * q.x + q.y * q.y - R * R;
    const disc = b * b - c;
    if (disc < 0) continue;
    const root = Math.sqrt(disc);

    for (const t of [-b - root, -b + root]) {
      if (!(t >= 0)) continue;
      const centre = { x: q.x + t * u.x, y: q.y + t * u.y };
      if (!(Math.hypot(centre.x, centre.y) > 0)) continue;

      const delta = wrap(Math.atan2(centre.y, centre.x) - startAngle);
      if (delta >= 0) continue;                  // that side is inside the tooth

      // The fillet has to belong to *this* tooth. Follow the same line far
      // enough and it passes the axis and meets the root circle again on the
      // far side of the blank, which satisfies every other condition here —
      // tangent to the line, tangent to the root circle, on the space side —
      // while sitting diametrically opposite the flank it is meant to round.
      // Left in, the profile jumps across the middle of the gear once per
      // tooth and the whole thing draws as a flower.
      if (Math.abs(delta) > pitchAngle * 0.5) continue;

      if (!best || t < best.t) {
        best = { t, centre, tangentOnLine: { x: start.x + t * u.x, y: start.y + t * u.y } };
      }
    }
  }
  if (!best) return null;

  const { centre, tangentOnLine } = best;
  const centreR = Math.hypot(centre.x, centre.y);
  if (!(centreR > 0)) return null;
  const tangentOnRoot = { x: (centre.x * rf) / centreR, y: (centre.y * rf) / centreR };

  const a0 = Math.atan2(tangentOnLine.y - centre.y, tangentOnLine.x - centre.x);
  const a1 = Math.atan2(tangentOnRoot.y - centre.y, tangentOnRoot.x - centre.x);
  const sweep = wrap(a1 - a0);

  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = a0 + (sweep * i) / steps;
    points.push({ x: centre.x + rho * Math.cos(a), y: centre.y + rho * Math.sin(a) });
  }
  return { points, radius: rho, centre };
}

/**
 * The complete closed outline of a gear, as points in gear-local coordinates.
 *
 * For an external gear this is the outside of the part. For an internal gear it
 * is the toothed *bore*; the renderer draws a plain circle outside it and fills
 * with the even-odd rule to make an annulus.
 *
 * @param {object} geometry from `gearGeometry()`
 * @param {object} [options]
 * @param {number} [options.flankSteps] samples per flank
 * @param {number} [options.tipSteps]   samples across the tip land
 * @param {number} [options.rootSteps]  samples along the root arc
 * @param {number|null} [options.filletCoef] fillet radius in modules; null for none
 */
export function gearOutline(geometry, options = {}) {
  const {
    flankSteps = 14,
    tipSteps = 4,
    rootSteps = 6,
    filletCoef = 0.38,          // the tip radius of a standard hob
  } = options;

  const { z, m, rb, internal } = geometry;
  const pitchAngle = TAU / z;
  const { tipR, rootR, runout } = profileRadii(geometry);
  const samples = flankSamples(geometry, flankSteps);
  const fillet = filletCoef === null ? null : filletArc(geometry, filletCoef * m, { steps: rootSteps });

  // One tooth, built once and then rotated z times.
  const tooth = [];
  const push = (target, p) => {
    const last = target[target.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-9) target.push(p);
  };

  // The rising side only: from the root end of the flank up to the tip, on the
  // −phi side. The tip and the falling side are added afterwards, because the
  // falling side is this mirrored — and mirroring a list that already contained
  // the tip arc walks back across the tip a second time.
  const rising = [];
  if (fillet) {
    for (let i = fillet.points.length - 1; i >= 0; i -= 1) push(rising, fillet.points[i]);
  } else if (!internal && runout) {
    push(rising, polar(rootR, -flankAngle(geometry, rb)));   // straight run below the base circle
  }
  for (const s of samples) push(rising, polar(s.r, -s.phi));

  // A ring gear's tip can fall inside its base circle; the flank runs straight
  // from there to the tip, at the angle it had when the involute ran out.
  if (internal && runout) push(rising, polar(tipR, -flankAngle(geometry, rb)));

  for (const p of rising) push(tooth, p);

  // -- across the tip ----------------------------------------------------
  const tipPhi = internal && runout ? flankAngle(geometry, rb) : flankAngle(geometry, tipR);
  if (tipPhi > 1e-9) {
    for (let i = 1; i < tipSteps; i += 1) {
      push(tooth, polar(tipR, -tipPhi + (2 * tipPhi * i) / tipSteps));
    }
  }

  // -- the falling side is the rising side, mirrored ---------------------
  for (let i = rising.length - 1; i >= 0; i -= 1) {
    push(tooth, { x: rising[i].x, y: -rising[i].y });
  }

  // -- the root arc across to where the next tooth starts ----------------
  const end = tooth[tooth.length - 1];
  const rootStart = Math.atan2(end.y, end.x);
  const rootEnd = pitchAngle - Math.abs(rootStart);
  if (rootEnd > rootStart + 1e-12) {
    for (let i = 1; i <= rootSteps; i += 1) {
      push(tooth, polar(rootR, rootStart + ((rootEnd - rootStart) * i) / rootSteps));
    }
  }

  // -- repeat it around the gear ----------------------------------------
  const points = [];
  for (let k = 0; k < z; k += 1) {
    const a = k * pitchAngle;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (const p of tooth) {
      points.push({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
    }
  }
  return points;
}

/** A circle as a closed polyline, for bores, rims and reference circles. */
export function circlePoints(radius, steps = 96, { cx = 0, cy = 0 } = {}) {
  const points = [];
  for (let i = 0; i < steps; i += 1) {
    const a = (TAU * i) / steps;
    points.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
  }
  return points;
}

/** The outside of a ring gear's rim — its root circle plus a wall to hold it. */
export const rimRadius = (geometry, wallInModules = 1.6) =>
  geometry.rf + wallInModules * geometry.m;

/**
 * Where a drawn profile crosses a given circle, as angles. Used to *measure* a
 * gear that has been generated, rather than trusting that it was generated
 * right — the same reason the export is checked with getBBox rather than eyes.
 */
export function crossingAngles(points, radius) {
  const angles = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const da = Math.hypot(a.x, a.y) - radius;
    const db = Math.hypot(b.x, b.y) - radius;
    if (da === 0 || db === 0 || (da < 0) === (db < 0)) continue;
    const t = da / (da - db);
    angles.push(Math.atan2(a.y + (b.y - a.y) * t, a.x + (b.x - a.x) * t));
  }
  return angles.sort((p, q) => p - q);
}

/** Mean arc thickness of the teeth, measured on a circle of the drawn outline. */
export function measuredToothThickness(points, radius, z) {
  const angles = crossingAngles(points, radius);
  if (angles.length !== 2 * z) return NaN;

  const pitchAngle = TAU / z;
  let total = 0;
  let count = 0;
  for (let i = 0; i < angles.length; i += 1) {
    const next = angles[(i + 1) % angles.length];
    let span = next - angles[i];
    if (span < 0) span += TAU;
    // A span is a tooth if a tooth centreline (k·2π/z) runs down the middle.
    const mid = angles[i] + span / 2;
    const offset = ((mid % pitchAngle) + pitchAngle) % pitchAngle;
    if (offset < pitchAngle * 0.05 || offset > pitchAngle * 0.95) {
      total += span * radius;
      count += 1;
    }
  }
  return count ? total / count : NaN;
}

/** An SVG path string. `flipY` converts maths coordinates to screen ones. */
export function toPath(points, { flipY = true, close = true, digits = 4 } = {}) {
  if (!points.length) return '';
  const y = (v) => (flipY ? -v : v);
  const n = (v) => Number(v.toFixed(digits));
  let d = `M ${n(points[0].x)} ${n(y(points[0].y))}`;
  for (let i = 1; i < points.length; i += 1) d += ` L ${n(points[i].x)} ${n(y(points[i].y))}`;
  return close ? `${d} Z` : d;
}

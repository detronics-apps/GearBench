/**
 * Bores, keyways and splines. Pure.
 *
 * A gear that cannot be fixed to its shaft is an ornament. This is the part
 * that turns a profile into a component: how the torque actually gets from the
 * shaft into the teeth.
 *
 * Every feature here is the same shape underneath — a circle with slots cut
 * radially outward from it. A single keyway is one slot. A double keyway is two
 * at 180°. A straight-sided spline is six or eight of them evenly spaced. So
 * there is one generator, and the standards tables only choose its numbers.
 *
 * Coordinates match `involute.js`: x right, y **up**, origin at the axis.
 */

const TAU = Math.PI * 2;

export const BORE_TYPES = {
  plain: { id: 'plain', label: 'Plain', hint: 'A round hole. Held by a grub screw, a press fit or adhesive.' },
  keyway: { id: 'keyway', label: 'Keyway', hint: 'One parallel key. The usual way of driving a gear from a shaft.' },
  keyway2: { id: 'keyway2', label: 'Two keyways', hint: 'Two keys at 180°. Twice the torque, and balanced.' },
  spline: { id: 'spline', label: 'Spline', hint: 'Straight-sided splines. Much more torque, and the gear can slide along the shaft.' },
};

/* ------------------------------------------------------------- keyways -- */

/**
 * Parallel keys to DIN 6885-1 / ISO 773, by shaft diameter.
 *
 * `b` is the key width, `h` its height, `t2` how deep the slot goes into the
 * hub — measured out from the bore surface, which is what this module needs.
 * `upTo` is the largest shaft the row covers.
 */
export const KEY_TABLE = Object.freeze([
  { upTo: 8, b: 2, h: 2, t2: 1.0 },
  { upTo: 10, b: 3, h: 3, t2: 1.4 },
  { upTo: 12, b: 4, h: 4, t2: 1.8 },
  { upTo: 17, b: 5, h: 5, t2: 2.3 },
  { upTo: 22, b: 6, h: 6, t2: 2.8 },
  { upTo: 30, b: 8, h: 7, t2: 3.3 },
  { upTo: 38, b: 10, h: 8, t2: 3.3 },
  { upTo: 44, b: 12, h: 8, t2: 3.3 },
  { upTo: 50, b: 14, h: 9, t2: 3.8 },
  { upTo: 58, b: 16, h: 10, t2: 4.3 },
  { upTo: 65, b: 18, h: 11, t2: 4.4 },
  { upTo: 75, b: 20, h: 12, t2: 4.9 },
  { upTo: 85, b: 22, h: 14, t2: 5.4 },
  { upTo: 95, b: 25, h: 14, t2: 5.4 },
  { upTo: 110, b: 28, h: 16, t2: 6.4 },
  { upTo: 130, b: 32, h: 18, t2: 7.4 },
]);

/**
 * The standard key for a given bore. Returns the nearest row rather than
 * nothing at all when the bore runs off the end of the table, because a
 * sensible starting number beats an empty field — the caller can override it.
 */
export function keyForBore(diameter) {
  const d = Number(diameter);
  if (!Number.isFinite(d) || d <= 0) return null;
  const row = KEY_TABLE.find((entry) => d <= entry.upTo) || KEY_TABLE[KEY_TABLE.length - 1];
  return {
    b: row.b, h: row.h, t2: row.t2,
    standard: d <= KEY_TABLE[KEY_TABLE.length - 1].upTo && d > 6,
  };
}

/* ------------------------------------------------------------- splines -- */

/**
 * Straight-sided splines to DIN 5463, medium series: `N × d × D × B`, where
 * `d` is the minor (bore) diameter, `D` the major diameter and `B` the width
 * of each spline.
 *
 * Indicative dimensions only — no fits, tolerances or root radii. Enough to
 * draw and to cut a first article from, not enough to specify a gearbox.
 */
export const SPLINE_TABLE = Object.freeze([
  { count: 6, d: 11, D: 14, B: 3 },
  { count: 6, d: 13, D: 16, B: 3.5 },
  { count: 6, d: 16, D: 20, B: 4 },
  { count: 6, d: 18, D: 22, B: 5 },
  { count: 6, d: 21, D: 25, B: 5 },
  { count: 6, d: 23, D: 28, B: 6 },
  { count: 6, d: 26, D: 32, B: 6 },
  { count: 6, d: 28, D: 34, B: 7 },
  { count: 8, d: 32, D: 38, B: 6 },
  { count: 8, d: 36, D: 42, B: 7 },
  { count: 8, d: 42, D: 48, B: 8 },
  { count: 8, d: 46, D: 54, B: 9 },
  { count: 8, d: 52, D: 60, B: 10 },
  { count: 8, d: 56, D: 65, B: 10 },
  { count: 8, d: 62, D: 72, B: 12 },
]);

/** The nearest standard spline to a wanted minor diameter. */
export function splineForBore(diameter) {
  const d = Number(diameter);
  if (!Number.isFinite(d) || d <= 0) return null;
  let best = SPLINE_TABLE[0];
  for (const row of SPLINE_TABLE) {
    if (Math.abs(row.d - d) < Math.abs(best.d - d)) best = row;
  }
  return { ...best, exact: Math.abs(best.d - d) < 1e-9 };
}

/* ------------------------------------------------------------ geometry -- */

/**
 * A bore with `count` slots cut radially outward from it.
 *
 * One keyway, two keyways and a spline are the same construction with a
 * different count, so they cannot drift apart. Slots are centred on the +y axis
 * and spaced evenly from there.
 *
 * @param {object} spec
 * @param {number} spec.radius     bore radius
 * @param {number} spec.slotWidth  chordal width of each slot
 * @param {number} spec.slotDepth  how far it reaches past the bore
 * @param {number} spec.count      how many
 * @param {number} [spec.phaseDeg] rotate the whole pattern
 * @param {number} [spec.steps]    arc samples between slots
 */
export function slottedBore({ radius, slotWidth, slotDepth, count, phaseDeg = 0, steps = 24 }) {
  const r = Number(radius);
  const half = Number(slotWidth) / 2;
  const depth = Number(slotDepth);
  const n = Math.max(0, Math.round(count));

  if (!(r > 0)) return [];
  if (!n || !(half > 0) || !(depth > 0) || half >= r) return circle(r, Math.max(24, steps * 2));

  const phase = (phaseDeg * Math.PI) / 180;
  // Where the slot walls meet the bore circle.
  const wallY = Math.sqrt(r * r - half * half);
  const halfAngle = Math.atan2(half, wallY);
  const pitch = TAU / n;
  if (halfAngle * 2 >= pitch) return circle(r, Math.max(24, steps * 2));   // slots would merge

  const points = [];
  const rotate = (x, y, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });

  for (let i = 0; i < n; i += 1) {
    // Slot i is centred on +y, turned by i pitches. Walk it anticlockwise:
    // up the trailing wall, across the top, down the leading wall.
    const a = phase + i * pitch;
    const outer = r + depth;
    for (const p of [
      { x: half, y: wallY },
      { x: half, y: outer },
      { x: -half, y: outer },
      { x: -half, y: wallY },
    ]) points.push(rotate(p.x, p.y, a));

    // Then the bore arc across to the next slot.
    const from = a + Math.PI / 2 + halfAngle;
    const to = a + pitch + Math.PI / 2 - halfAngle;
    const arcSteps = Math.max(2, Math.round((steps * (to - from)) / pitch));
    for (let s = 1; s < arcSteps; s += 1) {
      const t = from + ((to - from) * s) / arcSteps;
      points.push({ x: r * Math.cos(t), y: r * Math.sin(t) });
    }
  }
  return points;
}

function circle(radius, steps) {
  const points = [];
  for (let i = 0; i < steps; i += 1) {
    const a = (TAU * i) / steps;
    points.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return points;
}

/**
 * Resolve a bore specification into the numbers the generator needs.
 *
 * Anything the user has not overridden comes from the standard for that bore
 * size, so a keyway is right by default and can still be wrong on purpose.
 */
export function resolveBore(spec = {}) {
  const type = BORE_TYPES[spec.type] ? spec.type : 'plain';
  const diameter = Math.max(0.5, Number(spec.diameter) || 6);
  const radius = diameter / 2;

  if (type === 'plain') {
    return { type, diameter, radius, count: 0, slotWidth: 0, slotDepth: 0, standard: true };
  }

  if (type === 'spline') {
    const table = splineForBore(diameter);
    const count = Math.max(3, Math.round(Number(spec.count) || table.count));
    const major = Number(spec.majorDiameter) || table.D;
    const width = Number(spec.slotWidth) || table.B;
    return {
      type, diameter, radius, count,
      slotWidth: width,
      slotDepth: Math.max(0, (major - diameter) / 2),
      majorDiameter: major,
      standard: table.exact && count === table.count && major === table.D && width === table.B,
      reference: table,
    };
  }

  const key = keyForBore(diameter);
  const width = Number(spec.slotWidth) || key.b;
  const depth = Number(spec.slotDepth) || key.t2;
  return {
    type, diameter, radius,
    count: type === 'keyway2' ? 2 : 1,
    slotWidth: width,
    slotDepth: depth,
    standard: key.standard && width === key.b && depth === key.t2,
    reference: key,
  };
}

/** The bore outline for a specification, ready to draw or cut. */
export function boreOutline(spec, { steps = 24 } = {}) {
  const bore = resolveBore(spec);
  return slottedBore({
    radius: bore.radius,
    slotWidth: bore.slotWidth,
    slotDepth: bore.slotDepth,
    count: bore.count,
    phaseDeg: Number(spec.phaseDeg) || 0,
    steps,
  });
}

/**
 * What is wrong with a bore, in plain language.
 *
 * The one that actually bites: a keyway cut into a gear with a small root
 * diameter breaks through into the tooth space. The wall left between the slot
 * and the root circle is the number that matters, and it is easy not to notice
 * until the part is on the machine.
 */
export function boreProblems(spec, geometry) {
  const problems = [];
  const bore = resolveBore(spec);
  if (!geometry) return problems;

  const outer = bore.radius + bore.slotDepth;
  const wall = geometry.rf - outer;

  if (bore.radius >= geometry.rf) {
    problems.push({
      level: 'error',
      text: `A ${bore.diameter} mm bore is bigger than the root circle (${(geometry.rf * 2).toFixed(1)} mm). There would be no gear left.`,
    });
  } else if (wall <= 0) {
    problems.push({
      level: 'error',
      text: `The ${bore.type === 'spline' ? 'splines break' : 'keyway breaks'} through into the tooth roots. Reduce the bore, or use a bigger gear.`,
    });
  } else if (wall < geometry.m) {
    problems.push({
      level: 'warn',
      text: `Only ${wall.toFixed(2)} mm of metal between the ${bore.type === 'spline' ? 'spline' : 'keyway'} and the tooth roots. Under about one module that is where the gear will crack.`,
    });
  }

  if (bore.type !== 'plain' && bore.slotWidth >= bore.radius) {
    problems.push({
      level: 'error',
      text: 'The slot is wider than the bore radius. Nothing sensible can be cut from that.',
    });
  }
  if (bore.type !== 'plain' && !bore.standard) {
    problems.push({
      level: 'info',
      text: bore.type === 'spline'
        ? `Not a DIN 5463 size. The nearest standard is ${bore.reference.count}×${bore.reference.d}×${bore.reference.D}, ${bore.reference.B} mm wide.`
        : `Not a DIN 6885 key for this bore. The standard one is ${bore.reference.b} mm wide, ${bore.reference.t2} mm deep.`,
    });
  }
  return problems;
}

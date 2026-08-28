/**
 * Where every gear physically sits. Pure.
 *
 * Positions are not stored — they are *derived*. A gear's centre follows from
 * its parent's centre, the two tooth counts and one angle, because that is the
 * only place two meshing gears can be: a = m·(z₁ + z₂)/2 and nothing else will
 * do. Storing coordinates instead would let the picture drift away from the
 * arithmetic, which is exactly the confusion this app exists to remove.
 *
 * So the user drags a gear *around* its parent rather than away from it. The
 * angle is theirs; the distance is physics.
 *
 * Coordinates are millimetres, maths convention: x right, y up.
 */

import { centreDistance } from './gearmath.js';
import { rimRadius } from './involute.js';
import { geometryOf, gearSpec, planetarySpec, nodeById } from './train.js';

const DEG = Math.PI / 180;

/** The natural centre distance for a belt: far enough to be worth a belt. */
export function defaultBeltDistance(parentGeometry, childGeometry) {
  const minimum = parentGeometry.ra + childGeometry.ra + 2 * parentGeometry.m;
  return Math.max(minimum, 2 * (parentGeometry.r + childGeometry.r));
}

/** How far a child sits from its parent, for each kind of link. */
export function linkDistance(model, node) {
  const parent = nodeById(model, node.parent);
  if (!parent || !node.link || node.link === 'shaft') return 0;
  if (parent.kind === 'planetary' || node.kind === 'planetary') return 0;

  const parentGeometry = geometryOf(model, parent);
  const childGeometry = geometryOf(model, node);
  const m = gearSpec(model, parent).m;

  if (node.link === 'belt') {
    const wanted = Number(node.distance);
    const minimum = parentGeometry.ra + childGeometry.ra + 2 * m;
    return Number.isFinite(wanted) && wanted > 0
      ? Math.max(minimum, wanted)
      : defaultBeltDistance(parentGeometry, childGeometry);
  }
  return centreDistance({ m, z1: parent.z, z2: node.z, internal: node.link === 'internal' });
}

/** The radius the node takes up on the drawing, teeth and rim included. */
export function outerRadius(model, node) {
  if (node.kind === 'planetary') {
    const spec = planetarySpec(model, node);
    return rimRadius({ rf: (spec.m * spec.zRing) / 2 + 1.25 * spec.m, m: spec.m });
  }
  const geometry = geometryOf(model, node);
  return geometry.internal ? rimRadius(geometry) : geometry.ra;
}

/**
 * Which axial plane a node sits in.
 *
 * This is the part a flat drawing hides. Two gears on one shaft are *not* in
 * the same plane — they sit side by side along the shaft — which is exactly why
 * a compound train works at all. Drawn from above they appear to overlap, and
 * they are perfectly happy: they never touch. Gears that mesh, by contrast,
 * must share a plane.
 *
 * So a shaft link steps to the next plane and every other link stays put, and
 * the overlap check only ever compares gears in the same plane.
 */
export function planeOf(model, node, planes) {
  if (!node.parent) return 0;
  const parentPlane = planes[node.parent] ?? 0;
  return node.link === 'shaft' ? parentPlane + 1 : parentPlane;
}

/**
 * Place the whole train.
 *
 * Nodes are walked parent-first, so a child always has somewhere to hang from.
 */
export function layoutTrain(model) {
  const positions = {};
  const planets = {};
  const radii = {};
  const planes = {};

  const place = (node, x, y) => {
    positions[node.id] = { x, y };
    radii[node.id] = outerRadius(model, node);
    if (node.kind === 'planetary') {
      const spec = planetarySpec(model, node);
      const base = (Number(node.angle) || 0) * DEG;
      planets[node.id] = Array.from({ length: Math.max(1, spec.planets) }, (_, i) => {
        const angle = base + (i * 2 * Math.PI) / Math.max(1, spec.planets);
        return {
          index: i,
          angle,
          x: x + spec.carrierR * Math.cos(angle),
          y: y + spec.carrierR * Math.sin(angle),
        };
      });
    }
  };

  // Parent-first, and tolerant of a list that is not already in that order.
  const pending = [...model.nodes];
  let guard = pending.length * pending.length + 8;
  while (pending.length && guard > 0) {
    guard -= 1;
    const node = pending.shift();
    if (!node.parent) { planes[node.id] = 0; place(node, 0, 0); continue; }
    const anchor = positions[node.parent];
    if (!anchor) { pending.push(node); continue; }

    planes[node.id] = planeOf(model, node, planes);
    const distance = linkDistance(model, node);
    const angle = (Number(node.angle) || 0) * DEG;
    place(node, anchor.x + distance * Math.cos(angle), anchor.y + distance * Math.sin(angle));
  }
  for (const node of pending) { planes[node.id] = 0; place(node, 0, 0); }   // be safe

  return {
    positions,
    planets,
    radii,
    planes,
    planeCount: Math.max(1, ...Object.values(planes).map((n) => n + 1)),
    bounds: boundsOf(model, positions, radii, planets),
    collisions: collisionsIn(model, positions, radii, planes),
  };
}

function boundsOf(model, positions, radii, planets) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x, y, r) => {
    minX = Math.min(minX, x - r);
    minY = Math.min(minY, y - r);
    maxX = Math.max(maxX, x + r);
    maxY = Math.max(maxY, y + r);
  };
  for (const node of model.nodes) {
    const p = positions[node.id];
    if (!p) continue;
    grow(p.x, p.y, radii[node.id] || 0);
    for (const planet of planets[node.id] || []) {
      const spec = planetarySpec(model, node);
      grow(planet.x, planet.y, (spec.m * (spec.zPlanet + 2)) / 2);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Gears that are trying to occupy the same space.
 *
 * Pairs that are *meant* to overlap are excluded: a pinion inside its ring, a
 * mesh (which touches by definition), anything sharing a centre, and anything
 * in a different axial plane, which only overlaps on paper.
 */
export function collisionsIn(model, positions, radii, planes = {}) {
  const out = [];
  const related = new Set();
  for (const node of model.nodes) {
    if (node.parent) related.add(key(node.parent, node.id));
  }

  for (let i = 0; i < model.nodes.length; i += 1) {
    for (let j = i + 1; j < model.nodes.length; j += 1) {
      const a = model.nodes[i];
      const b = model.nodes[j];
      if (related.has(key(a.id, b.id))) continue;
      if ((planes[a.id] ?? 0) !== (planes[b.id] ?? 0)) continue;   // different plane, no contact

      const pa = positions[a.id];
      const pb = positions[b.id];
      if (!pa || !pb) continue;

      const gap = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (gap < 1e-6) continue;                       // same shaft, on purpose
      const reach = (radii[a.id] || 0) + (radii[b.id] || 0);
      if (gap < reach - 1e-6) out.push({ a: a.id, b: b.id, overlap: reach - gap, gap });
    }
  }
  return out;
}

const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * The angle a gear would have to sit at to be under a given point. Used by the
 * drag handler: the pointer chooses the direction, the tooth counts choose the
 * distance, so a dragged gear stays in mesh however far the pointer wanders.
 */
export function angleTowards(anchor, point) {
  return (Math.atan2(point.y - anchor.y, point.x - anchor.x) / DEG + 360) % 360;
}

/** Snap an angle to a step, for tidy layouts. Pass 0 to leave it alone. */
export function snapAngle(degrees, step = 15) {
  if (!step) return degrees;
  return Math.round(degrees / step) * step;
}

/* ---------------------------------------------------- global coordinates -- */

/**
 * Every centre in one coordinate frame, with the driving gear at the origin.
 *
 * This is the drawing turned into numbers you can take to a machine: where to
 * put each shaft, and how far apart each meshing pair sits. The origin is the
 * gear the train is driven from, because that is the one a build starts from.
 *
 * Two centre distances are reported per gear and they are worth comparing. The
 * *actual* one is measured from the laid-out positions; the *required* one
 * comes from m·(z₁ + z₂)/2. They agree by construction here — a gear's position
 * is derived from its parent rather than stored — and seeing them agree is the
 * point: it is what says the picture and the arithmetic are the same object.
 *
 * Coordinates are millimetres, x right and y **up**, as in every other pure
 * module. The renderer flips y; these numbers do not.
 */
export function coordinateTable(model, layout, originId = null) {
  const origin = layout.positions[originId] || layout.positions[model.nodes[0]?.id] || { x: 0, y: 0 };

  return model.nodes.map((node) => {
    const position = layout.positions[node.id];
    if (!position) return null;

    const parent = node.parent ? nodeById(model, node.parent) : null;
    const parentPosition = parent ? layout.positions[parent.id] : null;
    const actual = parentPosition
      ? Math.hypot(position.x - parentPosition.x, position.y - parentPosition.y)
      : null;

    return {
      id: node.id,
      name: node.name || node.id,
      kind: node.kind,
      x: position.x - origin.x,
      y: position.y - origin.y,
      plane: layout.planes[node.id] ?? 0,
      parentId: parent?.id ?? null,
      parentName: parent ? (parent.name || parent.id) : null,
      link: node.link,
      centreDistance: actual,
      requiredDistance: parent ? linkDistance(model, node) : null,
      // Non-zero only if something has gone wrong, which is the useful part.
      distanceError: parent && actual !== null ? actual - linkDistance(model, node) : null,
    };
  }).filter(Boolean);
}

/**
 * The gear a build should be measured from: whatever is driven, else the root.
 */
export function originNode(model) {
  const driven = Object.keys(model.drives || {})[0];
  if (driven) {
    const id = driven.split('.')[0];
    if (nodeById(model, id)) return id;
  }
  return model.nodes[0]?.id ?? null;
}

/**
 * DXF export. Pure — takes geometry, returns a string.
 *
 * R12 (AC1009) on purpose. It is the oldest and dullest DXF there is, which is
 * exactly why every CAM package, laser cutter and CNC controller still reads
 * it. Everything is a POLYLINE of straight segments or a CIRCLE, so there is no
 * spline interpretation to disagree about — what the tool cuts is what the
 * profile generator produced, to the number of samples it was given.
 *
 * DXF is a stream of (group code, value) pairs on alternate lines. That is the
 * whole format.
 *
 * Model coordinates are already y-up millimetres, which is exactly what DXF
 * wants, so unlike the SVG renderer nothing is flipped on the way out.
 */

import { gearGeometry } from './gearmath.js';
import { gearOutline, rimRadius } from './involute.js';
import { geometryOf, planetarySpec } from './train.js';

/** The layers a gear drawing is split across, so the cutter can pick one. */
export const DXF_LAYERS = {
  profile: { name: 'GEAR_PROFILE', colour: 7 },
  bore: { name: 'BORE', colour: 7 },
  pitch: { name: 'PITCH_CIRCLE', colour: 3 },
  reference: { name: 'REFERENCE', colour: 8 },
  centre: { name: 'CENTRE_MARK', colour: 1 },
};

const n = (value) => (Number.isFinite(value) ? Number(value).toFixed(6) : '0.000000');

/** One (code, value) pair. */
const pair = (code, value) => `${code}\n${value}\n`;

export const polyline = (points, { layer = 'GEAR_PROFILE', closed = true } = {}) =>
  ({ type: 'polyline', points, layer, closed });

export const circle = (cx, cy, r, { layer = 'REFERENCE' } = {}) =>
  ({ type: 'circle', cx, cy, r, layer });

export const line = (x1, y1, x2, y2, { layer = 'CENTRE_MARK' } = {}) =>
  ({ type: 'line', x1, y1, x2, y2, layer });

function entityText(entity) {
  if (entity.type === 'circle') {
    return pair(0, 'CIRCLE') + pair(8, entity.layer)
      + pair(10, n(entity.cx)) + pair(20, n(entity.cy)) + pair(30, '0.000000')
      + pair(40, n(entity.r));
  }
  if (entity.type === 'line') {
    return pair(0, 'LINE') + pair(8, entity.layer)
      + pair(10, n(entity.x1)) + pair(20, n(entity.y1)) + pair(30, '0.000000')
      + pair(11, n(entity.x2)) + pair(21, n(entity.y2)) + pair(31, '0.000000');
  }
  // A closed POLYLINE: flag 70 = 1, then one VERTEX each, then SEQEND.
  let out = pair(0, 'POLYLINE') + pair(8, entity.layer) + pair(66, 1)
    + pair(70, entity.closed ? 1 : 0)
    + pair(10, '0.000000') + pair(20, '0.000000') + pair(30, '0.000000');
  for (const point of entity.points) {
    out += pair(0, 'VERTEX') + pair(8, entity.layer)
      + pair(10, n(point.x)) + pair(20, n(point.y)) + pair(30, '0.000000');
  }
  return out + pair(0, 'SEQEND') + pair(8, entity.layer);
}

/** A complete DXF document holding the given entities. */
export function dxfDocument(entities, { units = 4 } = {}) {
  const layers = [...new Set(entities.map((e) => e.layer))];
  const known = Object.values(DXF_LAYERS);

  let out = '';
  // HEADER — $INSUNITS 4 means millimetres, so nothing arrives scaled by 25.4.
  out += pair(0, 'SECTION') + pair(2, 'HEADER')
    + pair(9, '$ACADVER') + pair(1, 'AC1009')
    + pair(9, '$INSUNITS') + pair(70, units)
    + pair(0, 'ENDSEC');

  out += pair(0, 'SECTION') + pair(2, 'TABLES')
    + pair(0, 'TABLE') + pair(2, 'LAYER') + pair(70, layers.length);
  for (const name of layers) {
    const colour = known.find((l) => l.name === name)?.colour ?? 7;
    out += pair(0, 'LAYER') + pair(2, name) + pair(70, 0) + pair(62, colour) + pair(6, 'CONTINUOUS');
  }
  out += pair(0, 'ENDTAB') + pair(0, 'ENDSEC');

  out += pair(0, 'SECTION') + pair(2, 'ENTITIES');
  for (const entity of entities) out += entityText(entity);
  out += pair(0, 'ENDSEC') + pair(0, 'EOF');
  return out;
}

/**
 * One gear as DXF entities, at a given centre and rotation.
 *
 * `reference` adds the pitch, base and root circles on their own layer — not
 * cutting geometry, but the lines an inspector or a drawing wants.
 */
export function gearEntities(geometry, outline, {
  cx = 0, cy = 0, angle = 0, bore = 0, reference = true, rim = null, boreProfile = null,
} = {}) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const place = (p) => ({ x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos });

  const entities = [polyline(outline.map(place), { layer: DXF_LAYERS.profile.name })];

  if (geometry.internal && rim) {
    entities.push(circle(cx, cy, rim, { layer: DXF_LAYERS.profile.name }));
  }
  // A keyway or a spline is a shape, not a circle, so it goes out as a
  // polyline on the same layer — and it turns with the gear, because a keyway
  // has to line up with the shaft.
  if (boreProfile?.length) {
    entities.push(polyline(boreProfile.map(place), { layer: DXF_LAYERS.bore.name }));
  } else if (bore > 0) {
    entities.push(circle(cx, cy, bore, { layer: DXF_LAYERS.bore.name }));
  }

  if (reference) {
    entities.push(circle(cx, cy, geometry.r, { layer: DXF_LAYERS.pitch.name }));
    entities.push(circle(cx, cy, geometry.rb, { layer: DXF_LAYERS.reference.name }));
    const mark = geometry.m * 1.5;
    entities.push(line(cx - mark, cy, cx + mark, cy));
    entities.push(line(cx, cy - mark, cx, cy + mark));
  }
  return entities;
}

/** Filename-safe name for a gear, so downloads do not collide. */
export const dxfFilename = (parts) =>
  `${parts.filter(Boolean).join('-').replace(/[^\w.-]+/g, '_')}.dxf`;

/* ------------------------------------------------------------- a train -- */

/**
 * A whole gear train as DXF entities, in real millimetres at real centres.
 *
 * This is the reason positions are derived rather than stored: what comes out
 * here is a drawing you could cut and bolt together, with every centre distance
 * exactly m·(z₁ + z₂)/2, because that is the only number the layout could have
 * produced.
 *
 * Each gear is put on its own layer so a cutter can take one at a time.
 */
export function trainEntities(model, layout, {
  phases = null, reference = false, bore = 0, steps = 20,
} = {}) {
  const entities = [];
  const at = (nodeId) => layout.positions[nodeId];

  for (const node of model.nodes) {
    const centre = at(node.id);
    if (!centre) continue;

    if (node.kind === 'planetary') {
      const spec = planetarySpec(model, node);
      const ring = gearGeometry({ m: spec.m, z: spec.zRing, alphaDeg: spec.alphaDeg, internal: true });
      entities.push(...gearEntities(ring, gearOutline(ring, { flankSteps: steps }), {
        cx: centre.x, cy: centre.y, angle: phases?.angles?.[`${node.id}.ring`] || 0,
        reference, rim: rimRadius(ring),
      }));

      const sun = gearGeometry({ m: spec.m, z: spec.zSun, alphaDeg: spec.alphaDeg });
      entities.push(...gearEntities(sun, gearOutline(sun, { flankSteps: steps }), {
        cx: centre.x, cy: centre.y, angle: phases?.angles?.[`${node.id}.sun`] || 0, reference, bore,
      }));

      const planet = gearGeometry({ m: spec.m, z: spec.zPlanet, alphaDeg: spec.alphaDeg });
      const planetOutline = gearOutline(planet, { flankSteps: steps });
      (layout.planets[node.id] || []).forEach((position, index) => {
        entities.push(...gearEntities(planet, planetOutline, {
          cx: position.x, cy: position.y,
          angle: phases?.planets?.[node.id]?.[index] || 0,
          reference, bore,
        }));
      });
      continue;
    }

    const geometry = geometryOf(model, node);
    entities.push(...gearEntities(geometry, gearOutline(geometry, { flankSteps: steps }), {
      cx: centre.x, cy: centre.y, angle: phases?.angles?.[node.id] || 0,
      reference, bore: geometry.internal ? 0 : bore,
      rim: geometry.internal ? rimRadius(geometry) : null,
    }));
  }
  return entities;
}

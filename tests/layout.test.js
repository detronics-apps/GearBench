import test from 'node:test';
import assert from 'node:assert/strict';

import { createTrain, PRESETS, updateNode, addPlanetary, planetarySpec, nodeById } from '../js/train.js';
import {
  layoutTrain, linkDistance, outerRadius, defaultBeltDistance,
  collisionsIn, angleTowards, snapAngle,
  coordinateTable, originNode,
} from '../js/layout.js';
import { gearGeometry } from '../js/gearmath.js';

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

function pair(z1, z2, link, extra = {}) {
  return {
    version: 3,
    defaults: { m: 2, alphaDeg: 20 },
    nodes: [
      { id: 'g1', kind: 'gear', name: 'A', z: z1, parent: null, link: null, angle: 0 },
      { id: 'g2', kind: 'gear', name: 'B', z: z2, parent: 'g1', link, angle: 0, ...extra },
    ],
    drives: {}, grounds: [], inputTorque: 5, nextId: 3,
  };
}

test('a meshed gear sits exactly one centre distance away', () => {
  const model = pair(20, 40, 'mesh');
  assert.equal(linkDistance(model, model.nodes[1]), 60);      // 2·(20+40)/2

  const { positions } = layoutTrain(model);
  assert.deepEqual(positions.g1, { x: 0, y: 0 });
  assert.ok(close(positions.g2.x, 60));
  assert.ok(close(positions.g2.y, 0));
});

test('the angle chooses the direction; the tooth counts choose the distance', () => {
  const model = updateNode(pair(20, 40, 'mesh'), 'g2', { angle: 90 });
  const { positions } = layoutTrain(model);
  assert.ok(close(positions.g2.x, 0, 1e-12));
  assert.ok(close(positions.g2.y, 60));
  assert.ok(close(Math.hypot(positions.g2.x, positions.g2.y), 60), 'still touching');

  for (const angle of [0, 37, 145, 260, -80]) {
    const turned = updateNode(pair(20, 40, 'mesh'), 'g2', { angle });
    const p = layoutTrain(turned).positions.g2;
    assert.ok(close(Math.hypot(p.x, p.y), 60, 1e-9), `angle ${angle} keeps the mesh`);
  }
});

test('a ring gear sits on the difference, not the sum', () => {
  const model = pair(20, 80, 'internal');
  assert.equal(linkDistance(model, model.nodes[1]), 60);      // 2·(80−20)/2
});

test('two gears on one shaft share a centre', () => {
  const { positions } = layoutTrain(pair(20, 40, 'shaft'));
  assert.deepEqual(positions.g2, { x: 0, y: 0 });
});

test('a belt is pushed apart far enough for the pulleys to clear', () => {
  const a = gearGeometry({ m: 2, z: 20 });
  const b = gearGeometry({ m: 2, z: 40 });
  const natural = defaultBeltDistance(a, b);
  assert.ok(natural > a.ra + b.ra, 'the pulleys cannot touch');
  assert.equal(linkDistance(pair(20, 40, 'belt'), pair(20, 40, 'belt').nodes[1]), natural);

  // A distance the user asked for is honoured …
  const asked = pair(20, 40, 'belt', { distance: 200 });
  assert.equal(linkDistance(asked, asked.nodes[1]), 200);
  // … unless it would overlap the pulleys.
  const silly = pair(20, 40, 'belt', { distance: 5 });
  assert.ok(linkDistance(silly, silly.nodes[1]) >= a.ra + b.ra);
});

test('outerRadius is the tip circle, or the rim on a ring gear', () => {
  const model = pair(20, 80, 'internal');
  assert.ok(close(outerRadius(model, model.nodes[0]), gearGeometry({ m: 2, z: 20 }).ra));
  const ring = gearGeometry({ m: 2, z: 80, internal: true });
  assert.ok(outerRadius(model, model.nodes[1]) > ring.rf, 'a ring needs a wall around it');
});

test('the bounds enclose every gear that was drawn', () => {
  const model = PRESETS.compound.build();
  const { positions, radii, bounds } = layoutTrain(model);
  for (const node of model.nodes) {
    const p = positions[node.id];
    assert.ok(p.x - radii[node.id] >= bounds.minX - 1e-9, node.id);
    assert.ok(p.x + radii[node.id] <= bounds.maxX + 1e-9, node.id);
    assert.ok(p.y - radii[node.id] >= bounds.minY - 1e-9, node.id);
    assert.ok(p.y + radii[node.id] <= bounds.maxY + 1e-9, node.id);
  }
  assert.ok(bounds.width > 0 && bounds.height > 0);
});

test('planets are spaced evenly on the carrier circle', () => {
  const model = addPlanetary(createTrain(), null, 'none', { zSun: 24, zPlanet: 18, planets: 3 }).model;
  const set = model.nodes.find((n) => n.kind === 'planetary');
  const spec = planetarySpec(model, set);
  const { positions, planets } = layoutTrain(model);
  const centre = positions[set.id];

  assert.equal(planets[set.id].length, 3);
  for (const planet of planets[set.id]) {
    assert.ok(close(Math.hypot(planet.x - centre.x, planet.y - centre.y), spec.carrierR, 1e-9));
  }
  const gaps = planets[set.id].map((p) => p.angle);
  assert.ok(close(gaps[1] - gaps[0], (2 * Math.PI) / 3, 1e-12));
  assert.ok(close(gaps[2] - gaps[1], (2 * Math.PI) / 3, 1e-12));
});

test('two gears on the same plane, swung together, collide', () => {
  // Two wheels both meshed with the pinion, only 20 degrees apart.
  const model = {
    ...PRESETS.simple.build(),
    nodes: [
      { id: 'g1', kind: 'gear', name: 'Pinion', z: 12, parent: null, link: null, angle: 0 },
      { id: 'g2', kind: 'gear', name: 'A', z: 36, parent: 'g1', link: 'mesh', angle: 0 },
      { id: 'g3', kind: 'gear', name: 'B', z: 36, parent: 'g1', link: 'mesh', angle: 20 },
    ],
  };
  const { collisions, planes } = layoutTrain(model);
  assert.equal(planes.g2, planes.g3, 'both meshed with the pinion, so both in its plane');
  assert.equal(collisions.length, 1);
  assert.deepEqual([collisions[0].a, collisions[0].b], ['g2', 'g3']);
  assert.ok(collisions[0].overlap > 0);

  // Swing them apart and the complaint goes away.
  assert.deepEqual(layoutTrain(updateNode(model, 'g3', { angle: 180 })).collisions, []);
});

test('a shaft link steps to the next axial plane', () => {
  const layout = layoutTrain(PRESETS.compound.build());
  assert.equal(layout.planes.g1, 0);
  assert.equal(layout.planes.g2, 0, 'meshed gears share a plane');
  assert.equal(layout.planes.g3, 1, 'the second gear on the countershaft is beside it');
  assert.equal(layout.planes.g4, 1);
  assert.equal(layout.planeCount, 2);
});

test('gears in different planes are allowed to overlap on paper', () => {
  // In the compound train the two 36-tooth wheels are only 48 mm apart and
  // 38 mm in radius. On a flat drawing they overlap; on a real shaft they sit
  // side by side and never touch.
  const layout = layoutTrain(PRESETS.compound.build());
  const gap = Math.hypot(
    layout.positions.g2.x - layout.positions.g4.x,
    layout.positions.g2.y - layout.positions.g4.y,
  );
  assert.ok(gap < layout.radii.g2 + layout.radii.g4, 'they really do overlap in plan');
  assert.notEqual(layout.planes.g2, layout.planes.g4);
  assert.deepEqual(layout.collisions, [], 'and that is fine');
});

test('a mesh, a shaft and a ring are not mistaken for collisions', () => {
  for (const link of ['mesh', 'shaft', 'internal', 'belt']) {
    assert.deepEqual(layoutTrain(pair(20, 40, link)).collisions, [], link);
  }
  assert.deepEqual(layoutTrain(createTrain()).collisions, []);
  for (const preset of Object.values(PRESETS)) {
    assert.deepEqual(layoutTrain(preset.build()).collisions, [], preset.label);
  }
});

test('collisionsIn ignores pairs that are directly linked', () => {
  const model = pair(20, 40, 'mesh');
  const positions = { g1: { x: 0, y: 0 }, g2: { x: 1, y: 0 } };
  const radii = { g1: 50, g2: 50 };
  assert.deepEqual(collisionsIn(model, positions, radii), [], 'parent and child are exempt');

  const unrelated = { ...model, nodes: [model.nodes[0], { ...model.nodes[1], parent: null, link: null }] };
  assert.equal(collisionsIn(unrelated, positions, radii).length, 1);
});

test('angleTowards and snapAngle drive the drag handler', () => {
  assert.ok(close(angleTowards({ x: 0, y: 0 }, { x: 10, y: 0 }), 0));
  assert.ok(close(angleTowards({ x: 0, y: 0 }, { x: 0, y: 10 }), 90));
  assert.ok(close(angleTowards({ x: 0, y: 0 }, { x: -10, y: 0 }), 180));
  assert.ok(close(angleTowards({ x: 5, y: 5 }, { x: 5, y: -5 }), 270));

  assert.equal(snapAngle(47, 15), 45);
  assert.equal(snapAngle(47, 0), 47, 'zero step means no snapping');
});

test('a train laid out twice lands in the same place', () => {
  const model = PRESETS.compound.build();
  assert.deepEqual(layoutTrain(model).positions, layoutTrain(model).positions);
});

test('nodes listed out of order still find their parents', () => {
  const model = PRESETS.compound.build();
  const shuffled = { ...model, nodes: [...model.nodes].reverse() };
  assert.deepEqual(layoutTrain(shuffled).positions, layoutTrain(model).positions);
  assert.ok(nodeById(shuffled, 'g4'));
});

/* ---------------------------------------------------- global coordinates -- */

test('the driving gear sits at the origin', () => {
  const model = PRESETS.compound.build();
  const rows = coordinateTable(model, layoutTrain(model), originNode(model));
  const input = rows.find((r) => r.id === 'g1');
  assert.equal(input.x, 0);
  assert.equal(input.y, 0);
  assert.equal(originNode(model), 'g1', 'the driven shaft is the origin');
});

test('every centre is given relative to that origin', () => {
  const model = PRESETS.compound.build();
  const layout = layoutTrain(model);
  const rows = coordinateTable(model, layout, 'g1');
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  // g2 meshes with g1: 18 and 54 teeth at module 2 sit 72 mm apart, at angle 0.
  assert.ok(close(byId.g2.x, 72));
  assert.ok(close(byId.g2.y, 0));
  // g3 shares g2's shaft, so it is at the same place.
  assert.ok(close(byId.g3.x, byId.g2.x));
  assert.ok(close(byId.g3.y, byId.g2.y));
  // and every row is the raw position shifted by the origin
  for (const row of rows) {
    assert.ok(close(row.x, layout.positions[row.id].x - layout.positions.g1.x));
    assert.ok(close(row.y, layout.positions[row.id].y - layout.positions.g1.y));
  }
});

test('the measured centre distance equals the one the formula demands', () => {
  // The whole point of deriving positions rather than storing them.
  for (const preset of Object.values(PRESETS)) {
    const model = preset.build();
    const rows = coordinateTable(model, layoutTrain(model), originNode(model));
    for (const row of rows) {
      if (row.parentId === null) {
        assert.equal(row.centreDistance, null);
        continue;
      }
      assert.ok(Math.abs(row.distanceError) < 1e-9,
        `${preset.label}: ${row.name} is ${row.distanceError} mm off its required centre distance`);
    }
  }
});

test('gears on one shaft are zero apart, and say so', () => {
  const model = PRESETS.compound.build();
  const row = coordinateTable(model, layoutTrain(model), 'g1').find((r) => r.id === 'g3');
  assert.equal(row.link, 'shaft');
  assert.ok(close(row.centreDistance, 0));
  assert.ok(close(row.requiredDistance, 0));
});

test('an internal mesh subtracts the radii instead of adding them', () => {
  const model = PRESETS.ring.build();
  const rows = coordinateTable(model, layoutTrain(model), originNode(model));
  const ring = rows.find((r) => r.link === 'internal');
  assert.ok(ring, 'the preset has a ring');
  // pinion 18, ring 72, module 2: (72 − 18)/2 × 2 = 54 mm
  assert.ok(close(ring.centreDistance, 54), `got ${ring.centreDistance}`);
});

test('the origin falls back to the root when nothing is driven', () => {
  const model = { ...PRESETS.simple.build(), drives: {} };
  assert.equal(originNode(model), 'g1');
  const rows = coordinateTable(model, layoutTrain(model), originNode(model));
  assert.equal(rows[0].x, 0);
});

test('coordinates carry the plane, so a compound stack is legible', () => {
  const model = PRESETS.compound.build();
  const rows = coordinateTable(model, layoutTrain(model), 'g1');
  const planes = new Set(rows.map((r) => r.plane));
  assert.ok(planes.size > 1, 'a compound train uses more than one plane');
  // Two gears at the same x and y must be on different planes, or they collide.
  for (const a of rows) {
    for (const b of rows) {
      if (a.id >= b.id) continue;
      if (close(a.x, b.x) && close(a.y, b.y)) assert.notEqual(a.plane, b.plane, `${a.id}/${b.id}`);
    }
  }
});

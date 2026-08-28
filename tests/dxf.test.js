import test from 'node:test';
import assert from 'node:assert/strict';

import { DXF_LAYERS, dxfDocument, polyline, circle, line, gearEntities, dxfFilename } from '../js/dxf.js';
import { gearGeometry } from '../js/gearmath.js';
import { gearOutline, rimRadius } from '../js/involute.js';

/** DXF is (code, value) on alternate lines, so a valid file has even lines. */
function pairsOf(text) {
  const lines = text.split('\n');
  assert.equal(lines[lines.length - 1], '', 'the file ends with a newline');
  lines.pop();
  assert.equal(lines.length % 2, 0, 'every group code has a value');
  const out = [];
  for (let i = 0; i < lines.length; i += 2) {
    assert.match(lines[i], /^\d+$/, `line ${i} should be a group code, got "${lines[i]}"`);
    out.push([Number(lines[i]), lines[i + 1]]);
  }
  return out;
}

test('an empty document is still a valid DXF', () => {
  const text = dxfDocument([]);
  const pairs = pairsOf(text);
  assert.deepEqual(pairs[0], [0, 'SECTION']);
  assert.deepEqual(pairs[pairs.length - 1], [0, 'EOF']);
  assert.equal(pairs.filter(([c, v]) => c === 0 && v === 'SECTION').length, 3);
  assert.equal(pairs.filter(([c, v]) => c === 0 && v === 'ENDSEC').length, 3);
});

test('the header states millimetres, so nothing arrives scaled by 25.4', () => {
  const pairs = pairsOf(dxfDocument([]));
  const units = pairs.findIndex(([c, v]) => c === 9 && v === '$INSUNITS');
  assert.ok(units > -1);
  assert.deepEqual(pairs[units + 1], [70, '4']);
});

test('a polyline emits one vertex per point and closes itself', () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }];
  const pairs = pairsOf(dxfDocument([polyline(points)]));
  assert.equal(pairs.filter(([c, v]) => c === 0 && v === 'VERTEX').length, 3);
  assert.equal(pairs.filter(([c, v]) => c === 0 && v === 'SEQEND').length, 1);

  const header = pairs.findIndex(([c, v]) => c === 0 && v === 'POLYLINE');
  assert.ok(pairs.slice(header, header + 6).some(([c, v]) => c === 70 && v === '1'), 'closed');
  assert.ok(pairs.some(([c, v]) => c === 10 && v === '10.000000'));

  const open = pairsOf(dxfDocument([polyline(points, { closed: false })]));
  const openHeader = open.findIndex(([c, v]) => c === 0 && v === 'POLYLINE');
  assert.ok(open.slice(openHeader, openHeader + 6).some(([c, v]) => c === 70 && v === '0'));
});

test('circles and lines carry their geometry', () => {
  const pairs = pairsOf(dxfDocument([circle(1, 2, 3), line(0, 0, 4, 5)]));
  assert.ok(pairs.some(([c, v]) => c === 40 && v === '3.000000'), 'radius');
  assert.ok(pairs.some(([c, v]) => c === 11 && v === '4.000000'), 'line end x');
  assert.ok(pairs.some(([c, v]) => c === 21 && v === '5.000000'), 'line end y');
});

test('every layer used is declared in the table', () => {
  const entities = [
    polyline([{ x: 0, y: 0 }], { layer: DXF_LAYERS.profile.name }),
    circle(0, 0, 5, { layer: DXF_LAYERS.pitch.name }),
  ];
  const pairs = pairsOf(dxfDocument(entities));
  const declared = pairs.filter(([c], i) => c === 2 && pairs[i - 1]?.[1] === 'LAYER').map(([, v]) => v);
  assert.ok(declared.includes(DXF_LAYERS.profile.name));
  assert.ok(declared.includes(DXF_LAYERS.pitch.name));
});

test('a real gear exports with its profile and reference circles', () => {
  const geometry = gearGeometry({ m: 2, z: 24 });
  const outline = gearOutline(geometry);
  const text = dxfDocument(gearEntities(geometry, outline, { bore: 5 }));
  const pairs = pairsOf(text);

  assert.equal(pairs.filter(([c, v]) => c === 0 && v === 'VERTEX').length, outline.length);
  assert.equal(pairs.filter(([c, v]) => c === 0 && v === 'CIRCLE').length, 3, 'bore, pitch, base');
  assert.ok(pairs.some(([c, v]) => c === 40 && v === geometry.r.toFixed(6)), 'pitch circle radius');
  assert.ok(!text.includes('NaN'));
  assert.ok(!text.includes('undefined'));
});

test('a gear placed away from the origin is moved, not redrawn', () => {
  const geometry = gearGeometry({ m: 2, z: 20 });
  const outline = gearOutline(geometry);
  const moved = gearEntities(geometry, outline, { cx: 100, cy: -40, reference: false });
  const points = moved[0].points;
  for (let i = 0; i < points.length; i += 1) {
    assert.ok(Math.abs(points[i].x - (outline[i].x + 100)) < 1e-9);
    assert.ok(Math.abs(points[i].y - (outline[i].y - 40)) < 1e-9);
  }
});

test('a rotated gear keeps every point at its own radius', () => {
  const geometry = gearGeometry({ m: 2, z: 20 });
  const outline = gearOutline(geometry);
  const turned = gearEntities(geometry, outline, { angle: 0.7, reference: false })[0].points;
  for (let i = 0; i < outline.length; i += 1) {
    assert.ok(Math.abs(Math.hypot(turned[i].x, turned[i].y) - Math.hypot(outline[i].x, outline[i].y)) < 1e-9);
  }
});

test('a ring gear exports its rim as well as its bore of teeth', () => {
  const geometry = gearGeometry({ m: 2, z: 60, internal: true });
  const outline = gearOutline(geometry);
  const entities = gearEntities(geometry, outline, { rim: rimRadius(geometry), reference: false });
  assert.equal(entities.length, 2);
  assert.equal(entities[1].type, 'circle');
  assert.ok(entities[1].r > geometry.rf);
});

test('non-finite coordinates never reach the file', () => {
  const text = dxfDocument([polyline([{ x: NaN, y: Infinity }])]);
  assert.ok(!text.includes('NaN'));
  assert.ok(!text.includes('Infinity'));
  pairsOf(text);
});

test('dxfFilename is safe to write to disk', () => {
  assert.equal(dxfFilename(['gear bench', 'm2', 'z20']), 'gear_bench-m2-z20.dxf');
  assert.equal(dxfFilename(['a/b', null, 'c']), 'a_b-c.dxf');
});

/* ------------------------------------------------------------- a train -- */

test('a whole train exports at its real centre distances', async () => {
  const { PRESETS, geometryOf, nodeById } = await import('../js/train.js');
  const { layoutTrain } = await import('../js/layout.js');
  const { trainEntities } = await import('../js/dxf.js');

  const model = PRESETS.compound.build();
  const layout = layoutTrain(model);
  const entities = trainEntities(model, layout, { bore: 4 });

  // One profile polyline and one bore circle per gear.
  assert.equal(entities.filter((e) => e.type === 'polyline').length, model.nodes.length);
  assert.equal(entities.filter((e) => e.type === 'circle').length, model.nodes.length);

  // The exported gears really are a centre distance apart.
  const centre = (points) => ({
    x: (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2,
    y: (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2,
  });
  const profiles = entities.filter((e) => e.type === 'polyline').map((e) => centre(e.points));
  const gap = Math.hypot(profiles[1].x - profiles[0].x, profiles[1].y - profiles[0].y);
  const expected = 2 * (nodeById(model, 'g1').z + nodeById(model, 'g2').z) / 2;
  assert.ok(Math.abs(gap - expected) < 1e-6, `${gap} vs ${expected}`);

  // And the tips land where the geometry says they do.
  const g1 = geometryOf(model, nodeById(model, 'g1'));
  const radii = entities[0].points.map((p) => Math.hypot(p.x - profiles[0].x, p.y - profiles[0].y));
  assert.ok(Math.abs(Math.max(...radii) - g1.ra) < 1e-6);
});

test('a planetary set exports every planet, at its own centre', async () => {
  const { PRESETS, planetarySpec } = await import('../js/train.js');
  const { layoutTrain } = await import('../js/layout.js');
  const { trainEntities, dxfDocument } = await import('../js/dxf.js');

  const model = PRESETS.planetary.build();
  const spec = planetarySpec(model, model.nodes[0]);
  const layout = layoutTrain(model);
  const entities = trainEntities(model, layout, { bore: 3 });

  // ring + rim, sun, and one polyline per planet
  assert.equal(entities.filter((e) => e.type === 'polyline').length, 2 + spec.planets);
  const text = dxfDocument(entities);
  pairsOf(text);
  assert.ok(!text.includes('NaN'));
});

test('the exported train survives being rotated to an animation frame', async () => {
  const { PRESETS, solveTrain } = await import('../js/train.js');
  const { layoutTrain } = await import('../js/layout.js');
  const { trainPhases } = await import('../js/phase.js');
  const { trainEntities, dxfDocument } = await import('../js/dxf.js');

  const model = PRESETS.compound.build();
  const layout = layoutTrain(model);
  const phases = trainPhases(model, layout, solveTrain(model).speeds, 0.37);
  const text = dxfDocument(trainEntities(model, layout, { phases }));
  pairsOf(text);
  assert.ok(!text.includes('NaN'));
});

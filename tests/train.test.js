import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MODEL_VERSION, LINKS, PRESETS,
  createTrain, nodeById, childrenOf, subtree, gearSpec, planetarySpec,
  bodies, bodyOf, parentBodyOf, buildSystem, solveTrain, ratioBetween,
  addGear, addPlanetary, removeNode, updateNode, setDrive, toggleGround, setSoleDrive,
  DEFAULT_RPM,
  canReparent, reparentOptions, setParent, descendantIds,
  migrateTrain,
} from '../js/train.js';

const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const speed = (result, id) => result.speeds[id];

/** A bare two-gear train, built by hand so the test does not depend on presets. */
function pair(z1, z2, link = 'mesh', rpm = 1000) {
  return {
    version: MODEL_VERSION,
    defaults: { m: 2, alphaDeg: 20 },
    nodes: [
      { id: 'g1', kind: 'gear', name: 'A', z: z1, parent: null, link: null, angle: 0 },
      { id: 'g2', kind: 'gear', name: 'B', z: z2, parent: 'g1', link, angle: 0 },
    ],
    drives: { g1: rpm },
    grounds: [],
    inputTorque: 10,
    nextId: 3,
  };
}

test('an external mesh divides the speed and reverses it', () => {
  const r = solveTrain(pair(12, 36));
  assert.equal(r.status, 'unique');
  assert.equal(speed(r, 'g1'), 1000);
  assert.ok(close(speed(r, 'g2'), -1000 / 3));
  // The ratio is signed: a 3:1 reduction that also reverses is −3.
  assert.ok(close(r.bodies.find((b) => b.id === 'g2').ratio, -3), 'a 3:1 reduction, reversed');
  assert.equal(r.bodies.find((b) => b.id === 'g2').reverses, true);
});

test('an internal mesh divides the speed and keeps the direction', () => {
  const r = solveTrain(pair(12, 36, 'internal'));
  assert.ok(close(speed(r, 'g2'), 1000 / 3));
  assert.equal(r.bodies.find((b) => b.id === 'g2').reverses, false);
});

test('a belt keeps direction; a shaft keeps speed', () => {
  assert.ok(close(speed(solveTrain(pair(12, 36, 'belt')), 'g2'), 1000 / 3));
  assert.ok(close(speed(solveTrain(pair(12, 36, 'shaft')), 'g2'), 1000), 'teeth are irrelevant on one shaft');
});

test('an idler changes the direction and nothing else', () => {
  const withIdler = solveTrain(createTrain());        // 18 → 30 → 54
  const direct = solveTrain(pair(18, 54));
  const asFraction = (r, out, input) => speed(r, out) / speed(r, input);
  assert.ok(close(Math.abs(asFraction(withIdler, 'g3', 'g1')), Math.abs(asFraction(direct, 'g2', 'g1'))),
    'the 20-tooth idler contributes nothing to the ratio');
  // 12 → 20 reverses, 20 → 36 reverses again, so the output turns with the input.
  assert.ok(speed(withIdler, 'g3') > 0);
  assert.ok(speed(direct, 'g2') < 0);
});

test('a compound train multiplies its stages', () => {
  const r = solveTrain(PRESETS.compound.build());
  // 18→54 is 3:1, then 18→54 again on the countershaft: 9:1 overall.
  assert.ok(close(speed(r, 'g4'), DEFAULT_RPM / 9));
  assert.ok(close(r.bodies.find((b) => b.id === 'g4').ratio, 9));
  assert.ok(speed(r, 'g4') > 0, 'two reversals cancel');
});

test('torque goes up exactly as speed comes down', () => {
  const r = solveTrain(PRESETS.compound.build());
  const out = r.bodies.find((b) => b.id === 'g4');
  assert.ok(close(out.torque, 5 * 9), 'input torque × the reduction');
  // Power in equals power out, which is the reason the ratio works both ways.
  const power = (rpm, torque) => Math.abs(rpm * torque);
  assert.ok(close(power(speed(r, 'g1'), 5), power(speed(r, 'g4'), out.torque), 1e-6));
});

test('a planetary set with the ring held gives 1 + z_ring/z_sun', () => {
  const r = solveTrain(PRESETS.planetary.build());
  assert.equal(r.status, 'unique');
  assert.equal(speed(r, 'p1.ring'), 0);
  assert.ok(close(speed(r, 'p1.carrier'), DEFAULT_RPM / 3.5));
  assert.ok(close(r.bodies.find((b) => b.id === 'p1.carrier').ratio, 3.5));
});

test('the planets spin the way the sun makes them', () => {
  const r = solveTrain(PRESETS.planetary.build());
  const carrier = speed(r, 'p1.carrier');
  const expected = carrier + (DEFAULT_RPM - carrier) * (-24 / 18);
  assert.ok(close(speed(r, 'p1.planet'), expected));
  assert.ok(speed(r, 'p1.planet') < 0, 'the planet runs backwards against the sun');
});

test('a planetary set with nothing held is a differential, and says so', () => {
  const r = solveTrain(PRESETS.differential.build());
  assert.equal(r.status, 'underdetermined');
  assert.equal(r.dof, 1);
  assert.ok(r.problems.some((p) => /degree/.test(p.text) && /differential/.test(p.text)));
});

test('a wholly unconstrained planetary set has two degrees of freedom', () => {
  const model = PRESETS.differential.build();
  model.drives = {};
  const r = solveTrain(model);
  assert.equal(r.dof, 2);
});

test('driving and holding the same shaft is reported as impossible', () => {
  const model = pair(12, 36);
  model.grounds = ['g2'];
  const r = solveTrain(model);
  assert.equal(r.status, 'inconsistent');
  assert.ok(r.problems.some((p) => p.level === 'error' && /cannot all be true/.test(p.text)));
});

test('two drives that agree through the gearing are accepted', () => {
  const model = pair(12, 36);
  model.drives = { g1: 1000, g2: -1000 / 3 };
  assert.equal(solveTrain(model).status, 'unique');
});

test('the system carries the equation it built, in readable form', () => {
  const { rows } = buildSystem(pair(12, 36));
  const mesh = rows.find((r) => r.kind === 'mesh');
  assert.equal(mesh.text, '12·n_g1 + 36·n_g2 = 0');
  assert.match(mesh.why, /reverses/i);
  assert.ok(rows.some((r) => r.kind === 'drive' && /1000 rpm/.test(r.text)));
});

test('a planetary set contributes exactly two equations and four bodies', () => {
  const model = PRESETS.planetary.build();
  const list = bodies(model);
  assert.deepEqual(list.map((b) => b.id), ['p1.sun', 'p1.ring', 'p1.carrier', 'p1.planet']);
  assert.equal(list.find((b) => b.member === 'planet').driveable, false);

  const { rows } = buildSystem(model);
  assert.equal(rows.filter((r) => r.kind === 'planetary').length, 2);
});

test('a gear hung off a planetary set has to say which shaft it is on', () => {
  let model = PRESETS.planetary.build();
  const added = addGear(model, 'p1', 'shaft', { z: 20 });
  model = updateNode(added.model, added.id, { parentMember: 'carrier' });
  assert.equal(parentBodyOf(model, nodeById(model, added.id)), 'p1.carrier');

  const r = solveTrain(model);
  assert.ok(close(speed(r, added.id), speed(r, 'p1.carrier')));

  const onRing = updateNode(model, added.id, { parentMember: 'ring' });
  assert.equal(speed(solveTrain(onRing), added.id), 0, 'the ring is held, so this gear is too');
});

test('bodyOf points a planetary set at the member it hangs from', () => {
  const model = addPlanetary(createTrain(), 'g3', 'sun').model;
  const set = model.nodes.find((n) => n.kind === 'planetary');
  assert.equal(bodyOf(model, set), `${set.id}.sun`);
  assert.equal(bodyOf(model, nodeById(model, 'g1')), 'g1');
});

test('ratioBetween works between any two shafts', () => {
  const r = solveTrain(PRESETS.compound.build());
  assert.ok(close(ratioBetween(r, 'g1', 'g4'), 9));
  assert.ok(close(ratioBetween(r, 'g4', 'g1'), 1 / 9));
  assert.equal(ratioBetween(r, 'g1', 'nope'), null);
});

test('adding, editing and removing gears', () => {
  let model = createTrain();
  const { model: bigger, id } = addGear(model, 'g3', 'mesh', { z: 24 });
  assert.equal(bigger.nodes.length, 4);
  assert.equal(nodeById(bigger, id).z, 24);
  assert.deepEqual(childrenOf(bigger, 'g3').map((n) => n.id), [id]);

  model = updateNode(bigger, id, { z: 30, name: 'Output' });
  assert.equal(nodeById(model, id).z, 30);

  // Removing a gear takes its children with it, and forgets any drive on them.
  const deeper = addGear(model, id, 'mesh', { z: 18 });
  assert.equal(subtree(deeper.model, id).length, 2);
  const pruned = removeNode(setDrive(deeper.model, deeper.id, 500), id);
  assert.equal(pruned.nodes.length, 3);
  assert.equal(pruned.drives[deeper.id], undefined);
});

test('the root gear cannot be removed', () => {
  const model = createTrain();
  assert.equal(removeNode(model, 'g1'), model);
});

test('driving a shaft clears its ground, and grounding it clears its drive', () => {
  let model = toggleGround(createTrain(), 'g3');
  assert.deepEqual(model.grounds, ['g3']);
  model = setDrive(model, 'g3', 200);
  assert.deepEqual(model.grounds, []);
  assert.equal(model.drives.g3, 200);
  model = toggleGround(model, 'g3');
  assert.equal(model.drives.g3, undefined);
  model = setDrive(model, 'g3', '');
  assert.equal(model.drives.g3, undefined);
});

test('edits never mutate the model they were given', () => {
  const model = createTrain();
  const snapshot = JSON.stringify(model);
  addGear(model, 'g1', 'mesh');
  updateNode(model, 'g1', { z: 99 });
  setDrive(model, 'g1', 1);
  toggleGround(model, 'g1');
  removeNode(model, 'g2');
  assert.equal(JSON.stringify(model), snapshot);
});

test('gearSpec falls back to the train defaults', () => {
  const model = createTrain();
  assert.equal(gearSpec(model, nodeById(model, 'g1')).m, 2);
  const custom = updateNode(model, 'g1', { m: 1.5 });
  assert.equal(gearSpec(custom, nodeById(custom, 'g1')).m, 1.5);
  assert.equal(gearSpec(custom, nodeById(custom, 'g2')).m, 2, 'only that gear changed');
});

test('a node marked as an internal link is a ring gear', () => {
  const model = pair(12, 36, 'internal');
  assert.equal(gearSpec(model, nodeById(model, 'g2')).internal, true);
  assert.equal(gearSpec(model, nodeById(model, 'g1')).internal, false);
});

test('the ring tooth count follows the sun and planet automatically', () => {
  const model = addPlanetary(createTrain(), null, 'none', { zSun: 30, zPlanet: 20 }).model;
  const set = model.nodes.find((n) => n.kind === 'planetary');
  assert.equal(planetarySpec(model, set).zRing, 70);
  const edited = updateNode(model, set.id, { zPlanet: 15 });
  assert.equal(planetarySpec(edited, nodeById(edited, set.id)).zRing, 60);
});

test('problems name the gear they belong to', () => {
  const model = updateNode(pair(12, 36), 'g2', { m: 3 });
  const r = solveTrain(model);
  const problem = r.problems.find((p) => /module/i.test(p.text));
  assert.ok(problem);
  assert.equal(problem.nodeId, 'g2');
});

test('a train with nothing driving it says so', () => {
  const model = { ...pair(12, 36), drives: {} };
  assert.ok(solveTrain(model).problems.some((p) => /driving/.test(p.text)));
});

/* ------------------------------------------------------------ migration -- */

test('a v1 save with the old link names still loads', () => {
  // Pasted verbatim from an old share link, not regenerated.
  const old = {
    version: 1,
    defaults: { m: 2, alphaDeg: 20 },
    nodes: [
      { id: 'g1', kind: 'gear', name: 'In', z: 12, parent: null, link: null },
      { id: 'g2', kind: 'gear', name: 'Mid', z: 36, parent: 'g1', link: 'mesh' },
      { id: 'g3', kind: 'gear', name: 'Out', z: 12, parent: 'g2', link: 'compound' },
      { id: 'g4', kind: 'gear', name: 'Ring', z: 60, parent: 'g3', link: 'annulus' },
    ],
    drives: { g1: 900 },
  };
  const model = migrateTrain(old);
  assert.equal(model.version, MODEL_VERSION);
  assert.equal(nodeById(model, 'g3').link, 'shaft');
  assert.equal(nodeById(model, 'g4').link, 'internal');
  assert.equal(model.drives.g1, 900);
  assert.equal(solveTrain(model).status, 'unique');
});

test('migration defaults anything missing rather than carrying undefined through', () => {
  const model = migrateTrain({ nodes: [{ id: 'g1', kind: 'gear', parent: null }], defaults: {} });
  assert.equal(model.defaults.m, 2);
  assert.equal(model.defaults.alphaDeg, 20);
  assert.equal(nodeById(model, 'g1').z, 20);
  assert.equal(model.inputTorque, createTrain().inputTorque);
});

test('migration drops drives and grounds that point at gears which no longer exist', () => {
  const model = migrateTrain({
    nodes: [{ id: 'g1', kind: 'gear', parent: null, z: 20 }],
    drives: { g1: 100, g9: 500 },
    grounds: ['g9', 'g1'],
  });
  assert.deepEqual(Object.keys(model.drives), ['g1']);
  assert.deepEqual(model.grounds, ['g1']);
});

test('migration re-roots an orphan instead of losing the gear', () => {
  const model = migrateTrain({ nodes: [{ id: 'g5', kind: 'gear', parent: 'gone', link: 'mesh', z: 20 }] });
  assert.equal(model.nodes.length, 1);
  assert.equal(nodeById(model, 'g5').parent, null);
  assert.ok(model.nextId > 5, 'the id counter clears the ids already used');
});

test('garbage falls back to a working default train', () => {
  for (const junk of [null, 'x', 42, {}, { nodes: 'no' }, { nodes: [] }]) {
    const model = migrateTrain(junk);
    assert.ok(model.nodes.length >= 2);
    assert.equal(solveTrain(model).status, 'unique');
  }
});

test('every preset solves and carries a hint', () => {
  for (const [id, preset] of Object.entries(PRESETS)) {
    const result = solveTrain(preset.build());
    assert.ok(preset.label && preset.hint, id);
    assert.notEqual(result.status, 'inconsistent', id);
    assert.equal(result.problems.filter((p) => p.level === 'error').length, 0, `${id}: ${JSON.stringify(result.problems)}`);
  }
});

test('no preset opens on an undercut warning', () => {
  // The first thing anyone sees should be a sound design, not a complaint.
  for (const [id, preset] of Object.entries(PRESETS)) {
    const problems = solveTrain(preset.build()).problems.filter((p) => /undercut/i.test(p.text));
    assert.deepEqual(problems, [], `${id} opens with an undercut warning`);
  }
});

test('the ring-drive preset really is an internal mesh, and keeps direction', () => {
  const r = solveTrain(PRESETS.ring.build());
  assert.equal(r.status, 'unique');
  assert.ok(close(r.speeds.g2, r.speeds.g1 * (18 / 72)), 'n₂ = +n₁·z₁/z₂');
  assert.ok(r.speeds.g2 > 0 && r.speeds.g1 > 0, 'a ring turns with its pinion');
});

test('every link type is documented well enough to teach from', () => {
  for (const [id, link] of Object.entries(LINKS)) {
    assert.equal(link.id, id);
    assert.ok(link.label && link.short && link.summary);
    assert.ok(link.detail.length > 60, `${id} needs a real explanation`);
  }
});

/* ---------------------------------------------------------- reparenting -- */

test('a gear can be re-hung from a different gear', () => {
  const model = PRESETS.compound.build();
  const moved = setParent(model, 'g4', 'g1', 'mesh');
  assert.equal(nodeById(moved, 'g4').parent, 'g1');
  assert.equal(nodeById(moved, 'g4').link, 'mesh');
  assert.equal(solveTrain(moved).status, 'unique');
  // 18 → 54 straight off the input is 3:1, not the 9:1 it was.
  assert.ok(close(solveTrain(moved).speeds.g4, -DEFAULT_RPM / 3));
});

test('a gear cannot be hung from itself or its own descendants', () => {
  const model = PRESETS.compound.build();
  assert.equal(canReparent(model, 'g2', 'g2'), false, 'itself');
  assert.equal(canReparent(model, 'g2', 'g3'), false, 'its child');
  assert.equal(canReparent(model, 'g2', 'g4'), false, 'its grandchild');
  assert.equal(canReparent(model, 'g4', 'g1'), true);
  assert.equal(canReparent(model, 'g2', 'nope'), false);

  // and the illegal move is refused rather than silently corrupting the tree
  assert.equal(setParent(model, 'g2', 'g4'), model);
});

test('reparentOptions offers exactly the legal moves', () => {
  const model = PRESETS.compound.build();
  assert.deepEqual(reparentOptions(model, 'g4').map((n) => n.id), ['g1', 'g2', 'g3']);
  assert.deepEqual(reparentOptions(model, 'g1').map((n) => n.id), []);
});

test('hanging a gear off a planetary set forces a shaft link and a member', () => {
  const model = PRESETS.planetary.build();
  const added = addGear(model, 'p1', 'shaft', { z: 20 });
  const moved = setParent(added.model, added.id, 'p1', 'mesh');
  assert.equal(nodeById(moved, added.id).link, 'shaft', 'a set has no teeth of its own');
  assert.equal(nodeById(moved, added.id).parentMember, 'carrier');
});

test('reparenting never mutates the model it was given', () => {
  const model = PRESETS.compound.build();
  const snapshot = JSON.stringify(model);
  setParent(model, 'g4', 'g1', 'mesh');
  assert.equal(JSON.stringify(model), snapshot);
});

test('choosing a new input moves the drive rather than adding a second one', () => {
  const model = PRESETS.compound.build();
  const moved = setSoleDrive(model, 'g4');
  assert.deepEqual(Object.keys(moved.drives), ['g4']);
  assert.equal(moved.drives.g4, DEFAULT_RPM, 'the speed comes along with it');
  assert.equal(solveTrain(moved).status, 'unique');
  // driving the old output at the old input speed reverses the whole train
  assert.ok(close(solveTrain(moved).speeds.g1, DEFAULT_RPM * 9));
});

test('setSoleDrive releases a shaft it takes over from the casing', () => {
  const model = toggleGround(PRESETS.compound.build(), 'g4');
  const driven = setSoleDrive(model, 'g4');
  assert.deepEqual(driven.grounds, []);
  assert.equal(solveTrain(driven).status, 'unique');
});

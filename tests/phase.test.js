import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rpmToRadPerSecond, toothPhase, meshAngle, internalMeshAngle,
  ringFromPinionAngle, pinionInRingAngle, beltAngle, trainPhases, meshError,
  screenRotationDeg,
} from '../js/phase.js';
import { fmtDirection, turnsClockwise } from '../js/format.js';
import { createTrain, PRESETS, solveTrain, nodeById, planetarySpec } from '../js/train.js';
import { layoutTrain } from '../js/layout.js';

const TAU = Math.PI * 2;
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

test('rpm converts to radians per second', () => {
  assert.ok(close(rpmToRadPerSecond(60), TAU));
  assert.equal(rpmToRadPerSecond('x'), 0);
});

test('toothPhase is a fraction of one tooth pitch', () => {
  assert.ok(close(toothPhase(20, 0, 0), 0));
  assert.ok(close(toothPhase(20, 0, TAU / 20), 0), 'one whole tooth later is the same phase');
  assert.ok(close(toothPhase(20, 0, TAU / 40), 0.5), 'half a tooth');
  assert.ok(toothPhase(20, 0, -TAU / 40) >= 0, 'never negative');
});

test('an externally meshed gear lands tooth-against-space', () => {
  for (const zA of [8, 12, 20, 37]) {
    for (const zB of [11, 20, 45]) {
      for (const theta of [0, 0.7, 2.2, -1.4]) {
        for (const alphaA of [0, 0.13, 1.9]) {
          const alphaB = meshAngle(zA, zB, theta, alphaA);
          const gap = meshError({ zDriver: zA, zDriven: zB, theta, driverAngle: alphaA, drivenAngle: alphaB });
          assert.ok(Math.abs(gap) < 1e-9, `z ${zA}/${zB} theta ${theta}: gap ${gap}`);
        }
      }
    }
  }
});

test('the mesh relation carries the right speed and direction', () => {
  const zA = 12;
  const zB = 30;
  const theta = 0.4;
  const step = 0.001;
  const rate = (meshAngle(zA, zB, theta, step) - meshAngle(zA, zB, theta, 0)) / step;
  assert.ok(close(rate, -zA / zB, 1e-9), 'external meshes reverse');
});

test('a ring gear lands tooth-against-space too, and keeps direction', () => {
  for (const zP of [12, 20]) {
    for (const zR of [48, 72]) {
      for (const theta of [0, 1.1, -2.5]) {
        const alphaP = 0.37;
        const alphaR = internalMeshAngle(zP, zR, theta, alphaP);
        const gap = meshError({
          zDriver: zP, zDriven: zR, theta, driverAngle: alphaP, drivenAngle: alphaR, internal: true,
        });
        assert.ok(Math.abs(gap) < 1e-9, `z ${zP}/${zR} theta ${theta}: gap ${gap}`);
      }
    }
  }
  const step = 0.001;
  const rate = (internalMeshAngle(15, 60, 0.4, step) - internalMeshAngle(15, 60, 0.4, 0)) / step;
  assert.ok(close(rate, 15 / 60, 1e-9), 'internal meshes keep direction');
});

test('the ring and pinion relations invert each other', () => {
  const phi = 0.83;
  const ring = 1.4;
  const pinion = pinionInRingAngle(18, 54, phi, ring);
  assert.ok(close(ringFromPinionAngle(18, 54, phi, pinion), ring, 1e-9));
});

test('a belt keeps direction and scales by teeth', () => {
  assert.ok(close(beltAngle(20, 40, 2), 1));
  assert.ok(beltAngle(20, 40, 1) > 0, 'no reversal');
});

/* -------------------------------------------------- the whole train ------ */

/** Speed implied by the drawing itself, from two frames one second apart. */
function drawnRpm(model, key) {
  const layout = layoutTrain(model);
  const { speeds } = solveTrain(model);
  const a = trainPhases(model, layout, speeds, 0).angles[key];
  const b = trainPhases(model, layout, speeds, 1).angles[key];
  return ((b - a) / TAU) * 60;
}

test('the animation turns every gear at the speed the solver worked out', () => {
  for (const model of [createTrain(), PRESETS.simple.build(), PRESETS.compound.build()]) {
    const { speeds } = solveTrain(model);
    for (const node of model.nodes) {
      assert.ok(close(drawnRpm(model, node.id), speeds[node.id], 1e-6),
        `${node.id}: drawn ${drawnRpm(model, node.id)} vs solved ${speeds[node.id]}`);
    }
  }
});

test('every mesh in a laid-out train is genuinely phased', () => {
  for (const model of [createTrain(), PRESETS.compound.build()]) {
    const layout = layoutTrain(model);
    const { speeds } = solveTrain(model);
    for (const t of [0, 0.017, 0.35, 2.5]) {
      const { angles } = trainPhases(model, layout, speeds, t);
      for (const node of model.nodes) {
        if (!node.parent || node.link === 'shaft' || node.link === 'belt') continue;
        const parent = nodeById(model, node.parent);
        const here = layout.positions[node.id];
        const there = layout.positions[parent.id];
        const theta = Math.atan2(here.y - there.y, here.x - there.x);
        const gap = meshError({
          zDriver: parent.z, zDriven: node.z, theta,
          driverAngle: angles[parent.id], drivenAngle: angles[node.id],
          internal: node.link === 'internal',
        });
        assert.ok(Math.abs(gap) < 1e-7, `${node.id} at t=${t}: ${gap}`);
      }
    }
  }
});

test('the planets are phased on the sun at every instant', () => {
  const model = PRESETS.planetary.build();
  const layout = layoutTrain(model);
  const { speeds } = solveTrain(model);
  const spec = planetarySpec(model, model.nodes[0]);

  for (const t of [0, 0.04, 0.9]) {
    const { angles, planets, orbits } = trainPhases(model, layout, speeds, t);
    for (let i = 0; i < spec.planets; i += 1) {
      const gap = meshError({
        zDriver: spec.zSun, zDriven: spec.zPlanet, theta: orbits.p1[i],
        driverAngle: angles['p1.sun'], drivenAngle: planets.p1[i],
      });
      assert.ok(Math.abs(gap) < 1e-9, `planet ${i} at t=${t}: ${gap}`);
    }
  }
});

test('the ring is phased on planet one, and turns at the solved speed', () => {
  const model = PRESETS.differential.build();
  const layout = layoutTrain(model);
  const { speeds } = solveTrain(model);
  // The differential is underdetermined, so pin the sun down to get one answer.
  const pinned = { ...model, grounds: ['p1.sun'] };
  const solved = solveTrain(pinned).speeds;
  const spec = planetarySpec(pinned, pinned.nodes[0]);

  const at = (t) => trainPhases(pinned, layoutTrain(pinned), solved, t);
  const a = at(0);
  const b = at(1);
  assert.ok(close(((b.angles['p1.ring'] - a.angles['p1.ring']) / TAU) * 60, solved['p1.ring'], 1e-6));

  const gap = meshError({
    // meshError takes the pinion → ring direction, and the orbit angle is the
    // other way round: the ring's centre is the set's centre.
    zDriver: spec.zPlanet, zDriven: spec.zRing, theta: a.orbits.p1[0] + Math.PI,
    driverAngle: a.planets.p1[0], drivenAngle: a.angles['p1.ring'], internal: true,
  });
  assert.ok(Math.abs(gap) < 1e-9, `ring phase gap ${gap}`);
  assert.ok(layout.positions.p1, 'the set was laid out');
  assert.ok(Number.isFinite(speeds['p1.carrier']));
});

test('a planet spins at the speed the solver gives it', () => {
  const model = PRESETS.planetary.build();
  const layout = layoutTrain(model);
  const { speeds } = solveTrain(model);
  const spin = (t) => trainPhases(model, layout, speeds, t).planets.p1[0];
  assert.ok(close(((spin(1) - spin(0)) / TAU) * 60, speeds['p1.planet'], 1e-6));
});

test('gears on one shaft share a rotation', () => {
  const model = PRESETS.compound.build();
  const { angles } = trainPhases(model, layoutTrain(model), solveTrain(model).speeds, 0.3);
  assert.equal(angles.g3, angles.g2);
});

test('phases are produced for every node, even a train with nothing driving it', () => {
  const model = { ...createTrain(), drives: {} };
  const { angles } = trainPhases(model, layoutTrain(model), solveTrain(model).speeds, 1);
  for (const node of model.nodes) assert.ok(Number.isFinite(angles[node.id]), node.id);
});

/* ------------------------------------------------- the screen convention -- */

test('screenRotationDeg flips the sign on the way to SVG', () => {
  // Maths convention here, y-down in SVG, so the sign has to turn over exactly
  // once between the two.
  assert.ok(Math.abs(screenRotationDeg(Math.PI) + 180) < 1e-9);
  assert.ok(Math.abs(screenRotationDeg(-Math.PI / 2) - 90) < 1e-9);
  assert.ok(Math.abs(screenRotationDeg(0)) < 1e-12);   // −0 is still zero
});

test('the arrow, the word and the animation all agree about which way it turns', () => {
  // The bug this covers: the readout said "clockwise" and the arrow was drawn
  // clockwise, while the gear on screen turned the other way. Each had worked
  // the direction out separately. This walks the actual chain — solved speed,
  // phase at two instants, the SVG rotation those become — and checks the
  // published convention against what the drawing really does.
  const model = PRESETS.simple.build();
  const layout = layoutTrain(model);
  const { speeds } = solveTrain(model);

  for (const bodyId of ['g1', 'g2']) {
    const rpm = speeds[bodyId];
    assert.ok(Math.abs(rpm) > 1e-9, `${bodyId} is turning`);

    const before = screenRotationDeg(trainPhases(model, layout, speeds, 0).angles[bodyId]);
    const after = screenRotationDeg(trainPhases(model, layout, speeds, 0.05).angles[bodyId]);

    // A *rising* SVG rotation is clockwise, because SVG's y points down.
    const clockwiseOnScreen = after > before;
    assert.equal(clockwiseOnScreen, turnsClockwise(rpm),
      `${bodyId} at ${rpm} rpm: screen rotation went ${before} → ${after}`);
    assert.equal(fmtDirection(rpm), clockwiseOnScreen ? 'clockwise' : 'anticlockwise');
  }

  // and the two gears really do turn opposite ways, so the test is not vacuous
  assert.notEqual(turnsClockwise(speeds.g1), turnsClockwise(speeds.g2));
});

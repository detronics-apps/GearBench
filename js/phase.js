/**
 * Tooth phasing for the animation. Pure.
 *
 * Getting the speeds right is not enough to make a drawing believable: if the
 * teeth are not *phased*, the gears visibly pass through each other. A tooth on
 * one gear has to arrive exactly where the other has a space.
 *
 * All of it follows from one statement. Measure, at the line of centres, how
 * far a gear has turned past its last tooth, as a fraction of one tooth pitch:
 *
 *     u = ((θ − α)·z / 2π)  mod 1
 *
 * where α is the gear's rotation and θ the direction of the contact point. Two
 * external gears mesh when u_driven = ½ − u_driver: tooth against space.
 *
 * Angles are radians, anticlockwise, in the same maths convention as the
 * profile generator.
 */

import { nodeById, planetarySpec } from './train.js';

const TAU = Math.PI * 2;

export const rpmToRadPerSecond = (rpm) => (Number(rpm) || 0) * (TAU / 60);

/**
 * The angle these phases become in an SVG `rotate()`, in degrees.
 *
 * Everything here is maths convention — y up, anticlockwise positive — while
 * SVG has y pointing down, so the sign flips on the way to the screen. The
 * renderer must not do this conversion itself: when the arrow and the readout
 * each worked out the direction on their own, both ended up contradicting the
 * animation. Keeping the rule here means a test can check the whole chain.
 */
export const screenRotationDeg = (angleRad) => (-angleRad * 180) / Math.PI;

/** How far past its last tooth a gear is, at direction `theta`, as a fraction. */
export function toothPhase(z, angle, theta) {
  const u = ((theta - angle) * z) / TAU;
  return ((u % 1) + 1) % 1;
}

/**
 * The rotation an externally meshed gear must have to fit.
 * @param {number} zDriver teeth on the gear already placed
 * @param {number} zDriven teeth on the gear being phased
 * @param {number} theta   direction from the driver's centre to the driven one
 * @param {number} driverAngle
 */
export function meshAngle(zDriver, zDriven, theta, driverAngle) {
  return theta + Math.PI - Math.PI / zDriven + (zDriver / zDriven) * (theta - driverAngle);
}

/**
 * The rotation of a ring gear placed around a pinion.
 * @param {number} theta direction from the pinion's centre to the ring's centre,
 *                       which is the direction the layout stores.
 */
export function internalMeshAngle(zPinion, zRing, theta, pinionAngle) {
  return ringFromPinionAngle(zPinion, zRing, theta + Math.PI, pinionAngle);
}

/**
 * The ring's rotation, given a pinion inside it.
 * @param {number} phi direction from the ring's centre to the pinion's centre
 */
export function ringFromPinionAngle(zPinion, zRing, phi, pinionAngle) {
  return phi - (zPinion / zRing) * (phi - pinionAngle - Math.PI / zPinion);
}

/** The same relation solved the other way: the pinion, from the ring. */
export function pinionInRingAngle(zPinion, zRing, phi, ringAngle) {
  return phi - (zRing / zPinion) * (phi - ringAngle) - Math.PI / zPinion;
}

/** A belt keeps direction, and has no tooth phase worth honouring. */
export const beltAngle = (zDriver, zDriven, driverAngle) => (zDriver / zDriven) * driverAngle;

/**
 * Every rotation in the train at time `t` seconds.
 *
 * Two mechanisms, on purpose:
 *
 * - Plain gears are phased *down the tree* from their parent, so their teeth
 *   land where they should. That propagation reproduces the right speed as a
 *   side effect, which makes it an independent check on the solver.
 * - Planetary members take their speed from the solver, because three shafts on
 *   one axis have no parent to inherit from. The planets are still phased off
 *   the sun and the ring off planet one, so the picture meshes.
 *
 * Where two parts are merely bolted to the same shaft the phase between them is
 * arbitrary — they are separate parts — so it is simply left at zero.
 *
 * @returns {{ angles: Record<string, number>, planets: Record<string, number[]> }}
 */
export function trainPhases(model, layout, speeds, t = 0) {
  const angles = {};
  const planets = {};
  const orbits = {};
  const spin = (bodyId) => rpmToRadPerSecond(speeds?.[bodyId] ?? 0) * t;

  const pending = [...model.nodes];
  let guard = pending.length * pending.length + 8;

  while (pending.length && guard > 0) {
    guard -= 1;
    const node = pending.shift();
    const parent = node.parent ? nodeById(model, node.parent) : null;
    if (parent && angles[parent.id] === undefined) { pending.push(node); continue; }

    if (node.kind === 'planetary') {
      const spec = planetarySpec(model, node);
      const base = ((Number(node.angle) || 0) * Math.PI) / 180;
      const count = Math.max(1, spec.planets);

      const sun = spin(`${node.id}.sun`);
      const carrier = base + spin(`${node.id}.carrier`);
      angles[`${node.id}.sun`] = sun;
      angles[`${node.id}.carrier`] = carrier;
      angles[node.id] = carrier;

      const orbit = [];
      const spins = [];
      for (let i = 0; i < count; i += 1) {
        const theta = carrier + (i * TAU) / count;
        orbit.push(theta);
        spins.push(meshAngle(spec.zSun, spec.zPlanet, theta, sun));
      }
      planets[node.id] = spins;
      orbits[node.id] = orbit;
      angles[`${node.id}.ring`] = ringFromPinionAngle(spec.zPlanet, spec.zRing, orbit[0], spins[0]);
      continue;
    }

    if (!parent) { angles[node.id] = spin(node.id); continue; }

    const parentAngle = parent.kind === 'planetary'
      ? angles[`${parent.id}.${memberOf(node)}`] ?? angles[parent.id]
      : angles[parent.id];

    if (parent.kind === 'planetary' || node.link === 'shaft') {
      angles[node.id] = parentAngle;
      continue;
    }

    const here = layout.positions[node.id];
    const there = layout.positions[parent.id];
    const theta = here && there ? Math.atan2(here.y - there.y, here.x - there.x) : 0;

    if (node.link === 'internal') {
      angles[node.id] = internalMeshAngle(parent.z, node.z, theta, parentAngle);
    } else if (node.link === 'belt') {
      angles[node.id] = beltAngle(parent.z, node.z, parentAngle);
    } else {
      angles[node.id] = meshAngle(parent.z, node.z, theta, parentAngle);
    }
  }
  for (const node of pending) angles[node.id] = angles[node.id] ?? 0;

  return { angles, planets, orbits };
}

const memberOf = (node) =>
  (['sun', 'ring', 'carrier'].includes(node.parentMember) ? node.parentMember : 'carrier');

/**
 * Does a phased pair actually mesh? Tooth against space, to within a whisker.
 * The renderer is trusted no further than this check.
 */
export function meshError({ zDriver, zDriven, theta, driverAngle, drivenAngle, internal = false }) {
  if (internal) {
    const phi = theta + Math.PI;
    const wanted = (toothPhase(zDriver, driverAngle, phi) + 0.5) % 1;
    return signedGap(toothPhase(zDriven, drivenAngle, phi), wanted);
  }
  const wanted = (0.5 - toothPhase(zDriver, driverAngle, theta) + 1) % 1;
  return signedGap(toothPhase(zDriven, drivenAngle, theta + Math.PI), wanted);
}

function signedGap(a, b) {
  let d = a - b;
  d = ((d % 1) + 1) % 1;
  return d > 0.5 ? d - 1 : d;
}

/**
 * The gear train model and its solver. Pure.
 *
 * A train is a tree: every gear after the first is attached to one already in
 * the train, by a named relationship. That is deliberate. It means a train can
 * never be geometrically impossible — a gear's position follows from its
 * parent, its tooth count and one angle — and it means the thing on screen and
 * the thing in the equations are the same object.
 *
 * Speeds are not propagated down the tree, though. They are solved as
 * simultaneous equations, because a planetary set couples three shafts at once
 * and has two degrees of freedom, so there is no "downstream" to propagate to.
 * Solving instead of propagating is what lets the app answer "you have not
 * said enough yet" rather than quietly inventing a number.
 */

import { gearGeometry, centreDistance, meshProblems } from './gearmath.js';
import { solveLinear } from './linalg.js';
import {
  ringTeeth, planetTeeth, carrierRadius, planetaryProblems, MEMBER_LABEL,
} from './planetary.js';

export const MODEL_VERSION = 3;

/**
 * The speed a new bench is driven at, in rpm.
 *
 * Deliberately slow. A gear train is something you watch, and at motor speeds
 * the animation is a blur and the output shaft barely appears to move. Ten rpm
 * makes the mesh legible and keeps the arithmetic in your head — a 3:1
 * reduction reads as 10 in, 3.33 out.
 */
export const DEFAULT_RPM = 10;

/** The ways one gear can be attached to another. */
export const LINKS = {
  mesh: {
    id: 'mesh',
    label: 'Meshed',
    short: 'Mesh',
    summary: 'Teeth engaged, side by side. Reverses direction.',
    detail: 'The pitch circles roll on each other, so the rim speeds match: n₂ = −n₁·z₁/z₂. The minus sign is the whole story — every external mesh reverses direction, which is why an idler costs you nothing but a direction.',
  },
  internal: {
    id: 'internal',
    label: 'Inside a ring',
    short: 'Ring',
    summary: 'A pinion running inside a ring gear. Keeps direction.',
    detail: 'The teeth still roll at the same rim speed, but the pinion is inside, so both turn the same way: n₂ = +n₁·z₁/z₂. Internal meshes are also quieter and stronger, because the flanks curve the same way and share more contact.',
  },
  shaft: {
    id: 'shaft',
    label: 'Same shaft',
    short: 'Shaft',
    summary: 'Two gears keyed to one shaft. Identical speed.',
    detail: 'Nothing is geared here at all: n₂ = n₁. This is how a train gets a second stage — a big gear takes the drive in, a small gear on the same shaft passes it on, and the reductions multiply.',
  },
  belt: {
    id: 'belt',
    label: 'Toothed belt',
    short: 'Belt',
    summary: 'A timing belt between two pulleys. Keeps direction.',
    detail: 'A belt behaves like a very long internal mesh: n₂ = +n₁·z₁/z₂, same direction, and the centre distance is yours to choose rather than fixed by the tooth counts.',
  },
};

export const PLANET_ATTACH = {
  none: { id: 'none', label: 'Free-standing' },
  sun: { id: 'sun', label: "On the sun's shaft" },
  ring: { id: 'ring', label: "On the ring's shaft" },
  carrier: { id: 'carrier', label: "On the carrier's shaft" },
};

/* ---------------------------------------------------------------- model -- */

export function createTrain() {
  return {
    version: MODEL_VERSION,
    defaults: { m: 2, alphaDeg: 20 },
    nodes: [
      { id: 'g1', kind: 'gear', name: 'Input', z: 18, parent: null, link: null, angle: 0 },
      { id: 'g2', kind: 'gear', name: 'Idler', z: 30, parent: 'g1', link: 'mesh', angle: 0 },
      { id: 'g3', kind: 'gear', name: 'Output', z: 54, parent: 'g2', link: 'mesh', angle: 0 },
    ],
    drives: { g1: DEFAULT_RPM },
    grounds: [],
    inputTorque: 5,
    nextId: 4,
  };
}

export const nodeById = (model, id) => model.nodes.find((n) => n.id === id) || null;
export const childrenOf = (model, id) => model.nodes.filter((n) => n.parent === id);

/** A node and everything hanging off it. */
export function subtree(model, id) {
  const out = [];
  const walk = (nodeId) => {
    const node = nodeById(model, nodeId);
    if (!node) return;
    out.push(node);
    for (const child of childrenOf(model, nodeId)) walk(child.id);
  };
  walk(id);
  return out;
}

/** Every gear-shaped value for a node, with the train defaults filled in. */
export function gearSpec(model, node) {
  return {
    m: node.m ?? model.defaults.m,
    z: node.z,
    alphaDeg: node.alphaDeg ?? model.defaults.alphaDeg,
    x: node.x ?? 0,
    internal: node.link === 'internal',
  };
}

export const geometryOf = (model, node) => gearGeometry(gearSpec(model, node));

/** The planetary tooth counts, with the ring worked out from sun and planet. */
export function planetarySpec(model, node) {
  const m = node.m ?? model.defaults.m;
  const zSun = node.zSun ?? 24;
  const zPlanet = node.zPlanet ?? 18;
  return {
    m,
    alphaDeg: node.alphaDeg ?? model.defaults.alphaDeg,
    zSun,
    zPlanet,
    zRing: node.zRing ?? ringTeeth(zSun, zPlanet),
    planets: node.planets ?? 3,
    carrierR: carrierRadius(m, zSun, zPlanet),
  };
}

/* --------------------------------------------------------------- bodies -- */

/**
 * Every independently-rotating thing in the train.
 *
 * A plain gear is one body. A planetary set is four — sun, ring, carrier and
 * the planets' own spin — which is why it needs its own node type rather than
 * being faked with three gears.
 */
export function bodies(model) {
  const out = [];
  for (const node of model.nodes) {
    if (node.kind === 'planetary') {
      const spec = planetarySpec(model, node);
      for (const member of ['sun', 'ring', 'carrier', 'planet']) {
        out.push({
          id: `${node.id}.${member}`,
          nodeId: node.id,
          member,
          kind: 'planetary',
          label: `${node.name || node.id} ${member === 'planet' ? 'planet spin' : MEMBER_LABEL[member].toLowerCase()}`,
          z: member === 'sun' ? spec.zSun : member === 'ring' ? spec.zRing : member === 'planet' ? spec.zPlanet : null,
          m: spec.m,
          driveable: member !== 'planet',
        });
      }
    } else {
      out.push({
        id: node.id,
        nodeId: node.id,
        member: null,
        kind: 'gear',
        label: node.name || node.id,
        z: node.z,
        m: gearSpec(model, node).m,
        driveable: true,
      });
    }
  }
  return out;
}

export const bodyLabel = (model, id) => bodies(model).find((b) => b.id === id)?.label || id;

/** The body a node presents when it is the child in a link. */
export function bodyOf(model, node) {
  if (node.kind !== 'planetary') return node.id;
  return `${node.id}.${node.attach && node.attach !== 'none' ? node.attach : 'carrier'}`;
}

/**
 * The body of a node's parent that it actually attaches to. A planetary set
 * has three shafts on one axis, so a gear hung off it has to say which.
 */
export function parentBodyOf(model, node) {
  const parent = nodeById(model, node.parent);
  if (!parent) return null;
  if (parent.kind !== 'planetary') return parent.id;
  const member = ['sun', 'ring', 'carrier'].includes(node.parentMember) ? node.parentMember : 'carrier';
  return `${parent.id}.${member}`;
}

/* --------------------------------------------------------------- system -- */

/**
 * Turn the train into simultaneous equations.
 *
 * Each row is one physical statement, kept alongside the plain-language reason
 * it exists so the "How this works" panel can show the actual equations rather
 * than a paraphrase of them.
 */
export function buildSystem(model) {
  const list = bodies(model);
  const ids = list.map((b) => b.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const A = [];
  const b = [];
  const rows = [];

  const row = () => new Array(ids.length).fill(0);
  const add = (coefficients, rhs, meta) => {
    A.push(coefficients);
    b.push(rhs);
    rows.push(meta);
  };

  for (const node of model.nodes) {
    if (node.kind === 'planetary') {
      const { zSun, zRing, zPlanet } = planetarySpec(model, node);
      const sun = index.get(`${node.id}.sun`);
      const ring = index.get(`${node.id}.ring`);
      const carrier = index.get(`${node.id}.carrier`);
      const planet = index.get(`${node.id}.planet`);

      // z_s·n_s + z_r·n_r = (z_s + z_r)·n_c
      const willisRow = row();
      willisRow[sun] = zSun;
      willisRow[ring] = zRing;
      willisRow[carrier] = -(zSun + zRing);
      add(willisRow, 0, {
        kind: 'planetary',
        nodeId: node.id,
        text: `${zSun}·n_sun + ${zRing}·n_ring = ${zSun + zRing}·n_carrier`,
        why: 'Willis: seen from the carrier, the set is a plain sun-to-ring train.',
      });

      // n_p = n_c + (n_s − n_c)·(−z_s/z_p)
      const planetRow = row();
      planetRow[planet] = 1;
      planetRow[sun] = zSun / zPlanet;
      planetRow[carrier] = -(1 + zSun / zPlanet);
      add(planetRow, 0, {
        kind: 'planetary',
        nodeId: node.id,
        text: `n_planet = n_carrier + (n_sun − n_carrier)·(−${zSun}/${zPlanet})`,
        why: 'The planet is an idler on the sun — but only relative to the carrier it rides on.',
      });
    }

    if (!node.parent || !node.link) continue;
    const parent = nodeById(model, node.parent);
    if (!parent) continue;

    const childBody = bodyOf(model, node);
    const parentBody = parentBodyOf(model, node);
    const i = index.get(parentBody);
    const j = index.get(childBody);
    if (i === undefined || j === undefined) continue;

    const zParent = teethOfBody(model, parent, parentBody);
    const zChild = teethOfBody(model, node, childBody);
    const link = LINKS[node.link] ? node.link : 'shaft';

    const coefficients = row();
    if (link === 'shaft' || node.kind === 'planetary') {
      coefficients[i] = 1;
      coefficients[j] = -1;
      add(coefficients, 0, {
        kind: 'shaft', nodeId: node.id,
        text: `n_${label(model, childBody)} = n_${label(model, parentBody)}`,
        why: 'Same shaft: nothing is geared, so the speeds are identical.',
      });
    } else {
      const sign = link === 'mesh' ? 1 : -1;         // external meshes reverse
      coefficients[i] = zParent;
      coefficients[j] = sign * zChild;
      add(coefficients, 0, {
        kind: link, nodeId: node.id,
        text: `${zParent}·n_${label(model, parentBody)} ${sign > 0 ? '+' : '−'} ${zChild}·n_${label(model, childBody)} = 0`,
        why: LINKS[link].summary,
      });
    }
  }

  for (const [id, rpm] of Object.entries(model.drives || {})) {
    const i = index.get(id);
    if (i === undefined) continue;
    const coefficients = row();
    coefficients[i] = 1;
    add(coefficients, Number(rpm) || 0, {
      kind: 'drive', bodyId: id,
      text: `n_${label(model, id)} = ${Number(rpm) || 0} rpm`,
      why: 'Driven at a stated speed.',
    });
  }

  for (const id of model.grounds || []) {
    const i = index.get(id);
    if (i === undefined) continue;
    const coefficients = row();
    coefficients[i] = 1;
    add(coefficients, 0, {
      kind: 'ground', bodyId: id,
      text: `n_${label(model, id)} = 0`,
      why: 'Held to the casing.',
    });
  }

  return { ids, bodies: list, A, b, rows };
}

function label(model, bodyId) {
  const short = bodyId.includes('.') ? bodyId.split('.')[1] : bodyId;
  const node = nodeById(model, bodyId.split('.')[0]);
  if (!node) return short;
  return bodyId.includes('.') ? `${node.id}.${short}` : node.id;
}

function teethOfBody(model, node, bodyId) {
  if (node.kind === 'planetary') {
    const spec = planetarySpec(model, node);
    if (bodyId.endsWith('.sun')) return spec.zSun;
    if (bodyId.endsWith('.ring')) return spec.zRing;
    if (bodyId.endsWith('.planet')) return spec.zPlanet;
    return spec.zSun + spec.zRing;      // the carrier has no teeth of its own
  }
  return node.z;
}

/* --------------------------------------------------------------- solver -- */

/**
 * Solve the whole train.
 *
 * `status` is the interesting part: `underdetermined` is not an error, it is
 * the honest answer for a differential, and `dof` says how many more speeds
 * have to be pinned down before there is a single answer.
 */
export function solveTrain(model) {
  const system = buildSystem(model);
  const solution = solveLinear(system.A, system.b);
  const speeds = {};
  if (solution.x) system.ids.forEach((id, i) => { speeds[id] = clean(solution.x[i]); });

  const referenceId = referenceBody(model, system);
  const reference = speeds[referenceId];
  const torque = Number(model.inputTorque) || 0;

  const results = system.bodies.map((body) => {
    const rpm = solution.x ? speeds[body.id] : null;
    const ratio = rpm && reference ? reference / rpm : null;
    return {
      ...body,
      rpm,
      // Signed: n_reference / n_this. −3 means "three times slower, and backwards".
      ratio,
      reverses: rpm !== null && reference !== null && rpm !== 0 && Math.sign(rpm) !== Math.sign(reference),
      // Only true if this shaft is the only one taking power out — said so in the UI.
      torque: ratio === null ? null : clean(torque * ratio),
    };
  });

  return {
    status: solution.status,
    dof: solution.dof,
    rank: solution.rank,
    referenceId,
    referenceRpm: reference ?? null,
    speeds,
    bodies: results,
    rows: system.rows,
    system,
    problems: trainProblems(model, solution),
  };
}

/** Float noise from the elimination is not information. */
const clean = (value) => (Math.abs(value) < 1e-9 ? 0 : Number(value.toPrecision(12)));

function referenceBody(model, system) {
  const driven = Object.entries(model.drives || {}).find(([, rpm]) => Number(rpm) !== 0);
  if (driven && system.ids.includes(driven[0])) return driven[0];
  return system.ids[0] ?? null;
}

/** The ratio between any two shafts, however far apart they are in the train. */
export function ratioBetween(result, fromId, toId) {
  const from = result.speeds?.[fromId];
  const to = result.speeds?.[toId];
  if (!Number.isFinite(from) || !Number.isFinite(to) || to === 0) return null;
  return from / to;
}

/* ------------------------------------------------------------- problems -- */

export function trainProblems(model, solution) {
  const problems = [];

  if (solution.status === 'inconsistent') {
    problems.push({
      level: 'error',
      text: 'These speeds cannot all be true at once. Something is driven and held at the same time, or two drives disagree through the gearing.',
    });
  }
  if (solution.status === 'underdetermined') {
    const n = solution.dof;
    problems.push({
      level: 'warn',
      text: `${n} degree${n === 1 ? '' : 's'} of freedom left. ${n === 1 ? 'One more shaft' : `${n} more shafts`} must be driven or held before there is a single answer — an epicyclic set with nothing held is a differential, not a gearbox.`,
    });
  }
  if (!Object.keys(model.drives || {}).length) {
    problems.push({ level: 'warn', text: 'Nothing is driving the train yet. Pick a gear and give it a speed.' });
  }

  for (const node of model.nodes) {
    if (node.kind === 'planetary') {
      const spec = planetarySpec(model, node);
      for (const problem of planetaryProblems({
        m: spec.m, zSun: spec.zSun, zRing: spec.zRing, zPlanet: spec.zPlanet, count: spec.planets,
      })) {
        problems.push({ ...problem, nodeId: node.id });
      }
      continue;
    }
    if (!Number.isFinite(node.z) || node.z < 6) {
      problems.push({
        level: 'error', nodeId: node.id,
        text: `${node.name || node.id} has ${node.z} teeth. Below about 6 there is no usable tooth left after undercut.`,
      });
    }
    if (!node.parent || node.link === 'shaft' || node.link === 'belt') continue;

    const parent = nodeById(model, node.parent);
    if (!parent || parent.kind === 'planetary') continue;
    for (const problem of meshProblems(geometryOf(model, parent), geometryOf(model, node), {
      internal: node.link === 'internal',
    })) {
      problems.push({ ...problem, nodeId: node.id });
    }
  }
  return problems;
}

/* ---------------------------------------------------------------- edits -- */

const copy = (model) => JSON.parse(JSON.stringify(model));

export function addGear(model, parentId, link, spec = {}) {
  const next = copy(model);
  const id = `g${next.nextId}`;
  next.nextId += 1;
  next.nodes.push({
    id,
    kind: 'gear',
    name: spec.name || `Gear ${next.nodes.filter((n) => n.kind === 'gear').length + 1}`,
    z: spec.z ?? 20,
    parent: parentId,
    link,
    angle: spec.angle ?? 0,
    ...(link === 'belt' ? { distance: spec.distance ?? null } : {}),
    ...(spec.m ? { m: spec.m } : {}),
  });
  return { model: next, id };
}

export function addPlanetary(model, parentId, attach = 'none', spec = {}) {
  const next = copy(model);
  const id = `p${next.nextId}`;
  next.nextId += 1;
  const zSun = spec.zSun ?? 24;
  const zPlanet = spec.zPlanet ?? 18;
  next.nodes.push({
    id,
    kind: 'planetary',
    name: spec.name || `Planetary ${next.nodes.filter((n) => n.kind === 'planetary').length + 1}`,
    zSun,
    zPlanet,
    zRing: ringTeeth(zSun, zPlanet),
    planets: spec.planets ?? 3,
    parent: parentId || null,
    link: parentId ? 'shaft' : null,
    attach: parentId ? attach : 'none',
    angle: spec.angle ?? 0,
  });
  return { model: next, id };
}

/** Remove a node and everything that hangs off it. The root cannot go. */
export function removeNode(model, id) {
  const node = nodeById(model, id);
  if (!node || !node.parent) return model;
  const doomed = new Set(subtree(model, id).map((n) => n.id));
  const next = copy(model);
  next.nodes = next.nodes.filter((n) => !doomed.has(n.id));
  next.grounds = (next.grounds || []).filter((bodyId) => !doomed.has(bodyId.split('.')[0]));
  for (const key of Object.keys(next.drives || {})) {
    if (doomed.has(key.split('.')[0])) delete next.drives[key];
  }
  return next;
}

/** Every node hanging below `id`, itself included. */
export const descendantIds = (model, id) => new Set(subtree(model, id).map((n) => n.id));

/**
 * Can this gear be re-hung off that one?
 *
 * A train is a tree, so the only illegal moves are onto itself or onto one of
 * its own descendants — either would make a loop, and a loop has no root to lay
 * the drawing out from.
 */
export function canReparent(model, id, parentId) {
  if (!id || !parentId || id === parentId) return false;
  if (!nodeById(model, id) || !nodeById(model, parentId)) return false;
  return !descendantIds(model, id).has(parentId);
}

/** The gears a given gear could legally be re-hung from. */
export const reparentOptions = (model, id) =>
  model.nodes.filter((node) => canReparent(model, id, node.id));

/**
 * Move a gear onto a different parent, keeping its link type where that still
 * makes sense. A gear hung off a planetary set can only be on a shaft, because
 * the set presents three coaxial shafts and no teeth of its own.
 */
export function setParent(model, id, parentId, link = null) {
  if (!canReparent(model, id, parentId)) return model;
  const next = copy(model);
  const node = next.nodes.find((n) => n.id === id);
  const parent = next.nodes.find((n) => n.id === parentId);

  node.parent = parentId;
  if (parent.kind === 'planetary') {
    node.link = 'shaft';
    if (!['sun', 'ring', 'carrier'].includes(node.parentMember)) node.parentMember = 'carrier';
  } else {
    delete node.parentMember;
    node.link = LINKS[link] ? link : (LINKS[node.link] ? node.link : 'mesh');
  }
  return next;
}

export function updateNode(model, id, patch) {
  const next = copy(model);
  const node = next.nodes.find((n) => n.id === id);
  if (!node) return model;
  Object.assign(node, patch);
  if (node.kind === 'planetary') node.zRing = ringTeeth(node.zSun, node.zPlanet);
  return next;
}

export function setDrive(model, bodyId, rpm) {
  const next = copy(model);
  next.drives = { ...next.drives };
  if (rpm === null || rpm === undefined || rpm === '') delete next.drives[bodyId];
  else next.drives[bodyId] = Number(rpm);
  next.grounds = (next.grounds || []).filter((id) => id !== bodyId);
  return next;
}

/**
 * Make this the shaft the train is driven from, and the only one.
 *
 * Picking a new input almost always means *moving* the input rather than adding
 * a second one — two drives usually contradict each other through the gearing.
 * The speed comes along with it, so the ratio on screen stays comparable.
 * Adding a genuine second input, for a differential, is still possible from the
 * drive field itself.
 */
export function setSoleDrive(model, bodyId, rpm = null) {
  const speed = rpm ?? Object.values(model.drives || {}).find((v) => Number(v) !== 0) ?? DEFAULT_RPM;
  let next = model;
  for (const id of Object.keys(model.drives || {})) next = setDrive(next, id, null);
  return setDrive(next, bodyId, speed);
}

export function toggleGround(model, bodyId) {
  const next = copy(model);
  const grounds = new Set(next.grounds || []);
  if (grounds.has(bodyId)) grounds.delete(bodyId);
  else {
    grounds.add(bodyId);
    delete next.drives[bodyId];
  }
  next.grounds = [...grounds];
  return next;
}

/* -------------------------------------------------------------- storage -- */

/**
 * Bring an older saved train up to date.
 *
 * Share links and saved files outlive the code, so every shape change needs a
 * migration — and a key that is present but `undefined` will happily overwrite
 * a perfectly good default, so nothing here uses a bare spread.
 * See references/pitfalls.md #8.
 */
export function migrateTrain(incoming) {
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.nodes)) return createTrain();

  const base = createTrain();
  const model = {
    version: MODEL_VERSION,
    defaults: {
      m: Number(incoming.defaults?.m) || base.defaults.m,
      alphaDeg: Number(incoming.defaults?.alphaDeg) || base.defaults.alphaDeg,
    },
    nodes: [],
    drives: {},
    grounds: [],
    inputTorque: Number(incoming.inputTorque) || base.inputTorque,
    nextId: Number(incoming.nextId) || 1,
  };

  for (const raw of incoming.nodes) {
    if (!raw || !raw.id) continue;
    // v1 called a same-shaft link "compound"; v2 called an internal one "annulus".
    const link = raw.link === 'compound' ? 'shaft' : raw.link === 'annulus' ? 'internal' : raw.link;
    if (raw.kind === 'planetary') {
      const zSun = Number(raw.zSun) || 24;
      const zPlanet = Number(raw.zPlanet) || 18;
      model.nodes.push({
        id: raw.id, kind: 'planetary', name: raw.name || raw.id,
        zSun, zPlanet, zRing: Number(raw.zRing) || ringTeeth(zSun, zPlanet),
        planets: Number(raw.planets) || 3,
        parent: raw.parent || null,
        link: raw.parent ? 'shaft' : null,
        attach: PLANET_ATTACH[raw.attach] ? raw.attach : 'none',
        angle: Number(raw.angle) || 0,
        ...(Number(raw.m) ? { m: Number(raw.m) } : {}),
      });
      continue;
    }
    model.nodes.push({
      id: raw.id, kind: 'gear', name: raw.name || raw.id,
      z: Number(raw.z) || 20,
      parent: raw.parent || null,
      link: raw.parent ? (LINKS[link] ? link : 'mesh') : null,
      angle: Number(raw.angle) || 0,
      ...(['sun', 'ring', 'carrier'].includes(raw.parentMember) ? { parentMember: raw.parentMember } : {}),
      ...(Number(raw.m) ? { m: Number(raw.m) } : {}),
      ...(Number.isFinite(Number(raw.x)) && Number(raw.x) !== 0 ? { x: Number(raw.x) } : {}),
      ...(Number(raw.distance) ? { distance: Number(raw.distance) } : {}),
    });
  }
  if (!model.nodes.length) return createTrain();
  // An orphaned node would be invisible and unsolvable, so re-root it rather
  // than dropping it — a saved train should never come back smaller.
  for (const node of model.nodes) {
    if (node.parent && !model.nodes.some((p) => p.id === node.parent)) {
      node.parent = null;
      node.link = null;
    }
  }

  const known = new Set(bodies(model).map((b) => b.id));
  for (const [id, rpm] of Object.entries(incoming.drives || {})) {
    if (known.has(id) && Number.isFinite(Number(rpm))) model.drives[id] = Number(rpm);
  }
  for (const id of incoming.grounds || []) if (known.has(id)) model.grounds.push(id);

  const maxId = Math.max(0, ...model.nodes.map((n) => Number(String(n.id).slice(1)) || 0));
  model.nextId = Math.max(model.nextId, maxId + 1);
  return model;
}

/** A worked example per link type, for the teaching panel and the presets. */
export const PRESETS = {
  simple: {
    label: 'Simple train',
    hint: 'One mesh. The classic 3:1 reduction.',
    build: () => ({
      ...createTrain(),
      nodes: [
        { id: 'g1', kind: 'gear', name: 'Pinion', z: 18, parent: null, link: null, angle: 0 },
        { id: 'g2', kind: 'gear', name: 'Wheel', z: 54, parent: 'g1', link: 'mesh', angle: 0 },
      ],
      drives: { g1: DEFAULT_RPM },
      nextId: 3,
    }),
  },
  idler: {
    label: 'Idler',
    hint: 'The middle gear changes the direction and nothing else.',
    build: () => createTrain(),
  },
  compound: {
    label: 'Compound train',
    hint: 'Two stages on one countershaft. The reductions multiply.',
    build: () => ({
      ...createTrain(),
      nodes: [
        { id: 'g1', kind: 'gear', name: 'Input', z: 18, parent: null, link: null, angle: 0 },
        { id: 'g2', kind: 'gear', name: 'Counter A', z: 54, parent: 'g1', link: 'mesh', angle: 0 },
        { id: 'g3', kind: 'gear', name: 'Counter B', z: 18, parent: 'g2', link: 'shaft', angle: 0 },
        { id: 'g4', kind: 'gear', name: 'Output', z: 54, parent: 'g3', link: 'mesh', angle: -50 },
      ],
      drives: { g1: DEFAULT_RPM },
      nextId: 5,
    }),
  },
  ring: {
    label: 'Ring drive',
    hint: 'A pinion inside a ring gear: same direction, and quieter than an external pair.',
    build: () => ({
      ...createTrain(),
      nodes: [
        { id: 'g1', kind: 'gear', name: 'Pinion', z: 18, parent: null, link: null, angle: 0 },
        { id: 'g2', kind: 'gear', name: 'Ring', z: 72, parent: 'g1', link: 'internal', angle: 0 },
      ],
      drives: { g1: DEFAULT_RPM },
      nextId: 3,
    }),
  },
  planetary: {
    label: 'Planetary set',
    hint: 'Ring held, sun driven, carrier out: 1 + z_ring/z_sun.',
    build: () => ({
      version: MODEL_VERSION,
      defaults: { m: 2, alphaDeg: 20 },
      nodes: [{
        id: 'p1', kind: 'planetary', name: 'Epicyclic',
        zSun: 24, zPlanet: 18, zRing: 60, planets: 3,
        parent: null, link: null, attach: 'none', angle: 0,
      }],
      drives: { 'p1.sun': DEFAULT_RPM },
      grounds: ['p1.ring'],
      inputTorque: 5,
      nextId: 2,
    }),
  },
  differential: {
    label: 'Differential',
    hint: 'Nothing held: two degrees of freedom, like a car axle.',
    build: () => ({
      version: MODEL_VERSION,
      defaults: { m: 2, alphaDeg: 20 },
      nodes: [{
        id: 'p1', kind: 'planetary', name: 'Differential',
        zSun: 30, zPlanet: 15, zRing: 60, planets: 3,
        parent: null, link: null, attach: 'none', angle: 0,
      }],
      drives: { 'p1.carrier': DEFAULT_RPM },
      grounds: [],
      inputTorque: 5,
      nextId: 2,
    }),
  },
};

export { ringTeeth, planetTeeth, centreDistance };

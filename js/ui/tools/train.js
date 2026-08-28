/**
 * The gear train designer — the main tool.
 *
 * Every gear after the first hangs off one already in the train, by a named
 * relationship. Dragging a gear swings it *around* its parent: the pointer
 * chooses the angle, the tooth counts choose the distance. That is not a
 * simplification, it is the actual constraint — two meshing gears can only be
 * m·(z₁ + z₂)/2 apart — and building it into the interaction means the picture
 * and the arithmetic can never disagree.
 */

import { el, toast } from '../dom.js';
import {
  section, numberField, sliderField, toggleField, selectField, chipField,
  stat, statInput, bannerList, buttonRow, button, rpmStep, table,
} from '../widgets.js';
import { buildTrainScene } from '../gear-svg.js';
import { explainStack } from '../explain.js';
import {
  LINKS, PRESETS,
  nodeById, childrenOf, bodies, geometryOf, planetarySpec, solveTrain,
  addGear, addPlanetary, removeNode, updateNode, setDrive, toggleGround,
  setSoleDrive, setParent, reparentOptions,
} from '../../train.js';
import { MEMBER_LABEL } from '../../planetary.js';
import { layoutTrain, angleTowards, snapAngle, coordinateTable, originNode } from '../../layout.js';
import { trainPhases } from '../../phase.js';
import { centreDistance, contactRatio } from '../../gearmath.js';
import { nearestModule } from '../../modules.js';
import { fmtNum, fmtRatio, fmtDirection, reduceRatio } from '../../format.js';
import { downloadSvg, downloadPng, downloadTrainDxf } from '../export.js';

export const meta = { id: 'train', label: 'Gear train', short: 'Train' };

export function render(ctx) {
  const { state, stage, sidebar, readout, banners, explainHost, update } = ctx;
  const model = state.train;
  const layout = layoutTrain(model);
  const result = solveTrain(model);
  const list = bodies(model);

  const selectedId = nodeById(model, state.selectedId) ? state.selectedId : model.nodes[0]?.id;
  const selected = nodeById(model, selectedId);

  /* -- the drawing ----------------------------------------------------- */

  const scene = buildTrainScene(model, layout, result, {
    zoom: state.view.zoom,
    selectedId,
    showPitch: state.view.showPitch,
    showLabels: state.view.showLabels,
  });
  stage.appendChild(scene.svg);
  attachPointer(scene, model, layout, update, selectedId);

  /* -- the numbers ----------------------------------------------------- */

  const output = pickOutput(result, selectedId);
  const reference = result.bodies.find((b) => b.id === result.referenceId);

  readout.append(
    statInput('Input', model.drives?.[result.referenceId] ?? reference?.rpm ?? 0, (rpm) => update((draft) => {
      draft.train = setDrive(draft.train, result.referenceId, rpm);
    }), {
      unit: 'rpm', step: rpmStep(model.drives?.[result.referenceId] ?? reference?.rpm ?? 0),
      min: -100000, max: 100000, key: 'input-rpm',
      note: reference ? `${reference.label} — type here to change it` : 'nothing driven yet',
      info: 'The speed the train is driven at. Every other speed follows from it. Negative runs it backwards.',
    }),
    stat('Output', output && Number.isFinite(output.rpm) ? `${fmtNum(output.rpm, 4)}` : '—', {
      note: output ? `${output.label} · rpm · ${fmtDirection(output.rpm)}` : '—',
    }),
    stat('Overall ratio', output?.ratio ? fmtRatio(output.ratio) : '—', {
      accent: true,
      note: output?.reverses ? 'output turns the other way' : 'output turns the same way',
      info: 'Input speed divided by output speed. Above 1 is a reduction: slower, and stronger by the same factor.',
    }),
    stat('Output torque', output?.torque ? `${fmtNum(Math.abs(output.torque), 4)}` : '—', {
      note: `N·m from ${fmtNum(model.inputTorque, 3)} N·m in`,
      info: 'Lossless: power in equals power out, so torque rises exactly as speed falls. Real gears lose 1–3% per stage. Valid while this shaft is the only one taking power out.',
    }),
    stat('Gears', String(countGears(model)), {
      note: `${layout.planeCount} plane${layout.planeCount === 1 ? '' : 's'} · ${fmtNum(layout.bounds.width, 3)} × ${fmtNum(layout.bounds.height, 3)} mm`,
    }),
  );

  /* -- what is wrong with it ------------------------------------------- */

  const problems = [...result.problems];
  for (const clash of layout.collisions) {
    problems.push({
      level: 'error',
      text: `${nameOf(model, clash.a)} and ${nameOf(model, clash.b)} overlap by ${fmtNum(clash.overlap, 3)} mm, and they are in the same plane. Swing one of them round, or put it on a shaft so it sits beside the other rather than into it.`,
    });
  }
  banners.append(...bannerList(problems, { emptyText: 'This train will run as drawn.' }));

  /* -- the sidebar ----------------------------------------------------- */

  sidebar.append(
    presetSection(update),
    trainDefaults(model, update),
    gearListSection(model, result, selectedId, update),
    selected ? selectedSection(model, selected, result, update) : null,
    geometrySection(model, layout, selectedId, update),
    addSection(model, selectedId, update),
    driveSection(model, list, result, selectedId, update),
    viewSection(state, update),
    exportSection(scene, model, layout, result, state),
  );

  /* -- the teaching panel ---------------------------------------------- */

  explainHost.append(...explainStack(explainPanels(model, layout, result, output)));

  return {
    frame: (seconds) => scene.apply(trainPhases(model, layout, result.speeds, seconds), result),
  };
}

/**
 * What the numbers you typed actually produced.
 *
 * Teeth and module are the inputs; the diameters are what get measured, bought
 * and cut, and they are the first thing anyone asks for. Shown here rather than
 * only in the single-gear tool, because the point of this tool is watching one
 * change ripple through everything else.
 */
function dimensionList(model, node) {
  const g = geometryOf(model, node);
  const rows = [
    ['Pitch Ø', g.d, 'd = m·z — where the gears actually roll on each other'],
    ['Tip Ø', g.da, g.internal ? 'the smallest hole' : 'the blank you start from'],
    ['Root Ø', g.df, 'the bottom of the tooth space'],
    ['Base Ø', g.db, 'the circle the involute unwinds from'],
    ['Tooth height', g.wholeDepth, 'addendum plus dedendum'],
  ];
  return el('dl', { class: 'dims' }, rows.flatMap(([label, value, hint]) => [
    el('dt', { title: hint, text: label }),
    el('dd', { class: 'value', text: `${fmtNum(value, 5)} mm` }),
  ]));
}

/**
 * Where everything is, and how big it is.
 *
 * The origin is the driving gear, because that is the shaft a build starts
 * from: every other centre is given as an offset from it, in millimetres,
 * x right and y up. `a` is the distance to that gear's parent, which for a mesh
 * is the centre distance you would set on a machine.
 *
 * Positions are derived from the tooth counts rather than stored, so the
 * measured distance and the one m·(z₁ + z₂)/2 demands are the same number. The
 * table shows the measured one; a mismatch would mean the drawing had come
 * adrift from the arithmetic, and there is a test that says it cannot.
 */
function geometrySection(model, layout, selectedId, update) {
  const origin = originNode(model);
  const rows = coordinateTable(model, layout, origin);
  const originName = rows.find((r) => r.id === origin)?.name || '—';

  const body = rows.map((row) => {
    const node = nodeById(model, row.id);
    const diameter = node.kind === 'planetary'
      ? planetarySpec(model, node).zRing * planetarySpec(model, node).m
      : geometryOf(model, node).d;
    return {
      _id: row.id,
      name: row.name,
      z: node.kind === 'planetary' ? `${planetarySpec(model, node).zSun}/${planetarySpec(model, node).zRing}` : String(node.z),
      dia: fmtNum(diameter, 5),
      x: fmtNum(row.x, 5),
      y: fmtNum(row.y, 5),
      a: row.centreDistance === null ? '—' : fmtNum(row.centreDistance, 5),
    };
  });

  return section('Positions and sizes', [
    el('p', {
      class: 'field__hint',
      text: `Millimetres from the centre of ${originName}, x right and y up. “Ø” is the pitch diameter — a ring gear shows sun/ring. “a” is the centre distance to the gear it hangs off.`,
    }),
    table([
      { key: 'name', label: 'Gear' },
      { key: 'z', label: 'z', num: true },
      { key: 'dia', label: 'Ø', num: true },
      { key: 'x', label: 'X', num: true },
      { key: 'y', label: 'Y', num: true },
      { key: 'a', label: 'a', num: true },
    ], body, {
      selectedIndex: body.findIndex((r) => r._id === selectedId),
      onRowClick: (row) => update((draft) => { draft.selectedId = row._id; }),
    }),
  ], {
    key: 'geometry',
    info: 'Everything a build needs: where each shaft goes relative to the input, and how far apart each meshing pair sits. Click a row to select that gear.',
  });
}

/* ------------------------------------------------------------ dragging -- */

/*
 * Click to select, drag to swing a gear around its parent.
 *
 * Only the angle is ever written back. The distance is not the user's to
 * choose, so it is not offered — a gear dragged across the panel orbits its
 * parent and stays in mesh the whole way.
 *
 * The move and release handlers live on `window` and read a module-level
 * snapshot rather than closing over one render's variables. Every edit
 * re-renders the tool, which replaces the SVG the drag started on, so anything
 * bound to that element — including pointer capture — would be thrown away on
 * the first movement.
 */

let drag = null;
let live = null;

function attachPointer(scene, model, layout, update, selectedId) {
  live = { scene, model, layout, update, selectedId };
  scene.svg.style.touchAction = 'none';
  scene.svg.addEventListener('pointerdown', onPointerDown);
}

function onPointerDown(event) {
  if (!live) return;
  const holder = event.target.closest('[data-node]');
  if (!holder) return;
  const nodeId = holder.dataset.node;
  const node = nodeById(live.model, nodeId);
  if (!node) return;

  if (nodeId !== live.selectedId) live.update((draft) => { draft.selectedId = nodeId; });
  if (!node.parent || node.link === 'shaft') return;          // nothing to swing

  drag = { nodeId, parentId: node.parent };
  event.preventDefault();
}

function pointerToModel(event) {
  const ctm = live?.scene.svg.getScreenCTM();
  if (!ctm) return null;
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
  return { x: live.scene.unpx(point.x), y: live.scene.unpy(point.y) };
}

function onPointerMove(event) {
  if (!drag || !live) return;
  const anchor = live.layout.positions[drag.parentId];
  const point = pointerToModel(event);
  if (!anchor || !point) return;

  // Free rotation while shift is held; a tidy 5° grid otherwise.
  //
  // Applied straight away rather than deferred to the next animation frame.
  // Pointer moves are already coalesced to one per frame by the browser, and
  // an rAF-based throttle jams permanently the moment a frame does not
  // arrive — which is exactly what happens in a background tab.
  const angle = Math.round(snapAngle(angleTowards(anchor, point), event.shiftKey ? 0 : 5) * 10) / 10;
  const node = nodeById(live.model, drag.nodeId);
  if (node && Number(node.angle) === angle) return;
  live.update((draft) => {
    draft.train = updateNode(draft.train, drag.nodeId, { angle });
  });
}

const onPointerUp = () => { drag = null; };

if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

/* ------------------------------------------------------------- sidebar -- */

function presetSection(update) {
  return section('Start from', [
    el('div', { class: 'chipset' }, Object.entries(PRESETS).map(([id, preset]) => el('button', {
      class: 'chip', type: 'button', title: preset.hint, text: preset.label,
      on: {
        click: () => update((draft) => {
          draft.train = preset.build();
          draft.selectedId = draft.train.nodes[0].id;
          toast(preset.hint);
        }),
      },
    }))),
  ], { key: 'presets', info: 'Worked examples. Each one is a real arrangement you can then pull apart.' });
}

function trainDefaults(model, update) {
  const snapped = nearestModule(model.defaults.m, 'I');
  return section('Train defaults', [
    numberField('Module', model.defaults.m, (value) => update((draft) => {
      draft.train = { ...draft.train, defaults: { ...draft.train.defaults, m: value } };
    }), {
      min: 0.1, max: 50, step: 0.25, unit: 'mm',
      info: 'Tooth size. Pitch diameter is module × teeth, so the module sets how big everything is without changing a single ratio.',
      hint: snapped.standard
        ? `${model.defaults.m} is ISO 54 series ${snapped.series}.`
        : `Not a standard module. Nearest stocked is ${snapped.value} mm (${fmtNum(snapped.deviationPct, 3)}% away).`,
    }),
    !snapped.standard ? buttonRow([
      button(`Snap to ${snapped.value} mm`, () => update((draft) => {
        draft.train = { ...draft.train, defaults: { ...draft.train.defaults, m: snapped.value } };
      }), { small: true }),
    ]) : null,
    selectField('Pressure angle', [
      { value: 14.5, label: '14.5° — old imperial stock' },
      { value: 20, label: '20° — the modern standard' },
      { value: 25, label: '25° — stronger, noisier' },
    ], model.defaults.alphaDeg, (value) => update((draft) => {
      draft.train = { ...draft.train, defaults: { ...draft.train.defaults, alphaDeg: Number(value) } };
    }), {
      info: 'The angle the tooth flanks push at. Steeper means a stronger tooth and fewer teeth before undercut, at the cost of more force trying to shove the shafts apart.',
    }),
  ], { key: 'defaults' });
}

/**
 * The gear list, and the fastest way to say what each shaft is doing.
 *
 * Every row carries its own Drive and Hold buttons rather than making you
 * select the gear, scroll to another panel and pick it from a dropdown. A
 * planetary set gets a row per shaft, because a set has three of them and which
 * one you hold is the entire character of the thing.
 */
function gearListSection(model, result, selectedId, update) {
  const rows = [];

  for (const node of model.nodes) {
    const isSet = node.kind === 'planetary';
    const spec = isSet ? planetarySpec(model, node) : null;
    const parent = node.parent ? nodeById(model, node.parent) : null;

    rows.push(el('div', {
      class: `node-group${node.id === selectedId ? ' is-selected' : ''}`,
    }, [
      el('button', {
        class: 'node', type: 'button',
        'aria-selected': node.id === selectedId ? 'true' : 'false',
        title: 'Select this gear',
        on: { click: () => update((draft) => { draft.selectedId = node.id; }) },
      }, [
        el('span', {
          class: 'node__swatch',
          style: { background: `var(--plane-${node.id === selectedId ? 2 : 0})` },
        }),
        el('span', { class: 'node__name' }, [
          el('span', { text: node.name || node.id }),
          parent ? el('span', {
            class: 'node__from',
            text: `${LINKS[node.link]?.short || 'on'} ${parent.name || parent.id}`,
          }) : el('span', { class: 'node__from', text: 'root' }),
        ]),
        el('span', { class: 'node__meta' }, [
          el('span', { text: isSet ? `${spec.zSun}/${spec.zPlanet}/${spec.zRing}` : `z${node.z}` }),
          el('span', {
            class: 'node__dia',
            text: isSet
              ? `Ø${fmtNum(spec.zRing * spec.m, 4)}`
              : `Ø${fmtNum(geometryOf(model, node).d, 4)}`,
          }),
        ]),
      ]),

      isSet
        ? el('div', { class: 'node-members' }, ['sun', 'ring', 'carrier'].map((member) =>
          shaftRow(model, result, `${node.id}.${member}`, MEMBER_LABEL[member], update)))
        : shaftRow(model, result, node.id, null, update),
    ]));
  }

  return section(`Gears (${model.nodes.length})`, [el('div', { class: 'node-list' }, rows)], {
    key: 'gears',
    info: 'Drive makes that shaft the input and moves the drive off whatever had it. Hold bolts it to the casing. A planetary set has three shafts, so it gets three rows.',
  });
}

/** One shaft: its speed, and the two things you can do to it. */
function shaftRow(model, result, bodyId, label, update) {
  const rpm = result.speeds?.[bodyId];
  const driven = model.drives?.[bodyId] !== undefined;
  const held = (model.grounds || []).includes(bodyId);

  return el('div', { class: 'shaft-row' }, [
    label ? el('span', { class: 'shaft-row__name', text: label }) : null,
    el('span', {
      class: 'shaft-row__speed value',
      text: Number.isFinite(rpm) ? `${fmtNum(rpm, 4)} rpm` : '— rpm',
    }),
    button('Drive', () => update((draft) => {
      draft.train = driven
        ? setDrive(draft.train, bodyId, null)
        : setSoleDrive(draft.train, bodyId);
      draft.selectedId = bodyId.split('.')[0];
    }), {
      small: true, pressed: driven, key: `drive:${bodyId}`,
      title: driven ? 'Stop driving this shaft' : 'Drive the train from this shaft',
    }),
    button('Hold', () => update((draft) => {
      draft.train = toggleGround(draft.train, bodyId);
      draft.selectedId = bodyId.split('.')[0];
    }), {
      small: true, pressed: held, key: `hold:${bodyId}`,
      title: held ? 'Release it from the casing' : 'Bolt this shaft to the casing',
    }),
  ]);
}

function selectedSection(model, node, result, update) {
  const isSet = node.kind === 'planetary';
  const parent = nodeById(model, node.parent);
  const patch = (values) => update((draft) => { draft.train = updateNode(draft.train, node.id, values); });

  const fields = [
    el('div', { class: 'field' }, [
      el('div', { class: 'field__label', text: 'Name' }),
      el('input', {
        class: 'input', type: 'text', value: node.name || node.id,
        style: { fontFamily: 'var(--font)' },
        on: { change: (event) => patch({ name: event.target.value.slice(0, 28) || node.id }) },
      }),
    ]),
  ];

  if (isSet) {
    const spec = planetarySpec(model, node);
    fields.push(
      numberField('Sun teeth', spec.zSun, (z) => patch({ zSun: z }), { min: 8, max: 200, step: 1, integer: true }),
      numberField('Planet teeth', spec.zPlanet, (z) => patch({ zPlanet: z }), {
        min: 8, max: 200, step: 1, integer: true,
        hint: `Ring follows: z_ring = z_sun + 2·z_planet = ${spec.zRing}`,
      }),
      numberField('Planets', spec.planets, (n) => patch({ planets: n }), {
        min: 1, max: 8, step: 1, integer: true,
        info: 'How many planets are fitted. They share the load and cancel the side force on the bearings, but they can only be spaced evenly if (z_sun + z_ring) divides by their number.',
      }),
      numberField('Module override', node.m ?? model.defaults.m, (m) => patch({ m }), { min: 0.1, max: 50, step: 0.25, unit: 'mm' }),
    );
  } else {
    fields.push(
      numberField('Teeth', node.z, (z) => patch({ z }), {
        min: 6, max: 300, step: 1, integer: true,
        info: 'Everything follows from this and the module: the diameter, the ratio, and where the next gear has to sit.',
      }),
      numberField('Profile shift', node.x ?? 0, (x) => patch({ x }), {
        min: -1, max: 1.2, step: 0.05,
        info: 'Cuts the tooth from further out on the rack. A positive shift fattens the root of a small pinion and cures undercut; it also pushes the centres apart.',
      }),
      numberField('Module override', node.m ?? model.defaults.m, (m) => patch({ m }), {
        min: 0.1, max: 50, step: 0.25, unit: 'mm',
        hint: 'Two gears can only mesh at the same module.',
      }),
    );
  }

  if (parent) {
    const options = reparentOptions(model, node.id);
    if (options.length) {
      fields.push(selectField('Hangs off', options.map((other) => ({
        value: other.id, label: other.name || other.id,
      })), node.parent, (value) => update((draft) => {
        draft.train = setParent(draft.train, node.id, value, node.link);
      }), {
        key: 'parent',
        info: 'Which gear this one takes its drive from. Moving it re-plumbs the train — the ratios follow immediately. A gear cannot hang off itself or off anything hanging off it.',
      }));
    }

    if (!isSet && parent.kind !== 'planetary') {
      fields.push(chipField('Attached by', Object.values(LINKS).map((link) => ({
        value: link.id, label: link.label, title: link.summary,
      })), node.link, (value) => patch({ link: value }), {
        info: 'How this gear takes its drive from the one before it.',
      }));
      fields.push(el('p', { class: 'field__hint', text: LINKS[node.link]?.detail || '' }));
    }
    if (parent.kind === 'planetary') {
      fields.push(selectField('On which shaft', ['sun', 'ring', 'carrier'].map((member) => ({
        value: member, label: `${parent.name || parent.id} ${member}`,
      })), node.parentMember || 'carrier', (value) => patch({ parentMember: value }), {
        info: 'A planetary set has three shafts on one axis, so a gear hung off it has to say which one it is bolted to.',
      }));
    }
    if (node.link !== 'shaft' && parent.kind !== 'planetary') {
      fields.push(sliderField('Angle round the parent', Number(node.angle) || 0, (angle) => patch({ angle }), {
        min: -180, max: 180, step: 1, format: (v) => `${v}°`,
        info: 'Where this gear sits around its parent. The distance is fixed by the tooth counts — this is the only part of the position that is yours.',
      }));
    }
    if (node.link === 'belt') {
      fields.push(numberField('Belt centre distance', node.distance ?? 0, (distance) => patch({ distance }), {
        min: 0, max: 2000, step: 5, unit: 'mm',
        hint: 'Zero picks a sensible distance automatically. A belt is the one link where the distance is free.',
      }));
    }
  }

  if (!isSet) {
    fields.push(dimensionList(model, node));
  }

  if (node.parent) {
    fields.push(buttonRow([
      button('Remove this gear and anything on it', () => update((draft) => {
        draft.train = removeNode(draft.train, node.id);
        draft.selectedId = draft.train.nodes[0].id;
      }), { danger: true, small: true }),
    ]));
  }

  return section(`Selected — ${node.name || node.id}`, fields, { key: 'selected' });
}

function addSection(model, selectedId, update) {
  const node = nodeById(model, selectedId);
  const canMesh = node && node.kind !== 'planetary';

  return section('Add', [
    el('p', { class: 'field__hint', text: `Attached to ${node?.name || selectedId}.` }),
    el('div', { class: 'chipset' }, [
      ...Object.values(LINKS).map((link) => el('button', {
        class: 'chip', type: 'button', title: link.summary,
        text: link.label,
        disabled: !canMesh && link.id !== 'shaft' ? true : null,
        on: {
          click: () => update((draft) => {
            const { model: next, id } = addGear(draft.train, selectedId, link.id, {
              z: link.id === 'internal' ? Math.max(40, (node?.z || 20) + 24) : 20,
              angle: nextFreeAngle(draft.train, selectedId),
            });
            draft.train = next;
            draft.selectedId = id;
          }),
        },
      })),
      el('button', {
        class: 'chip', type: 'button', title: 'A sun, a ring and planets on a carrier — three shafts on one axis.',
        text: 'Planetary set',
        on: {
          click: () => update((draft) => {
            const { model: next, id } = addPlanetary(draft.train, selectedId, 'sun');
            draft.train = next;
            draft.selectedId = id;
          }),
        },
      }),
    ]),
  ], { key: 'add', info: 'Every gear hangs off one already in the train, so the drawing can never show a mesh that could not exist.' });
}

function driveSection(model, list, result, selectedId, update) {
  const driveable = list.filter((body) => body.driveable);
  const current = driveable.find((body) => body.nodeId === selectedId) || driveable[0];
  if (!current) return null;

  const rpm = model.drives?.[current.id];
  const held = (model.grounds || []).includes(current.id);

  return section('Drive and hold', [
    el('p', {
      class: 'field__hint',
      text: 'The Drive button in the gear list moves the input to that shaft. This panel adds a second one, which is what a differential needs.',
    }),
    selectField('Shaft', driveable.map((body) => ({ value: body.id, label: body.label })), current.id,
      (value) => update((draft) => { draft.selectedId = value.split('.')[0]; }), { key: 'drive-shaft' }),

    numberField('Driven at', rpm ?? '', (value) => update((draft) => {
      draft.train = setDrive(draft.train, current.id, value);
    }), {
      unit: 'rpm', step: rpmStep(rpm), min: -100000, max: 100000,
      info: 'Negative means the other way round. Every other speed in the train follows from this one.',
    }),

    buttonRow([
      rpm !== undefined ? button('Stop driving this shaft', () => update((draft) => {
        draft.train = setDrive(draft.train, current.id, null);
      }), { small: true }) : null,
      button(held ? 'Release from the casing' : 'Hold to the casing', () => update((draft) => {
        draft.train = toggleGround(draft.train, current.id);
      }), { small: true, primary: held }),
    ].filter(Boolean)),

    el('p', {
      class: 'field__hint',
      text: result.status === 'underdetermined'
        ? `${result.dof} more shaft${result.dof === 1 ? '' : 's'} must be driven or held before the speeds are decided.`
        : result.status === 'inconsistent'
          ? 'These constraints contradict each other.'
          : 'Every speed in this train is decided.',
    }),

    numberField('Input torque', model.inputTorque, (value) => update((draft) => {
      draft.train = { ...draft.train, inputTorque: value };
    }), { unit: 'N·m', min: 0, max: 100000, step: 1, key: 'input-torque' }),
  ], { key: 'drive' });
}

function viewSection(state, update) {
  return section('View', [
    sliderField('Zoom', state.view.zoom, (zoom) => update((draft) => { draft.view.zoom = zoom; }), {
      min: 0.4, max: 3, step: 0.1, format: (v) => `${Math.round(v * 100)}%`,
    }),
    toggleField('Animate', state.view.animate, (value) => update((draft) => { draft.view.animate = value; })),
    sliderField('Animation speed', state.view.speed, (speed) => update((draft) => { draft.view.speed = speed; }), {
      min: 0.05, max: 4, step: 0.05, format: (v) => `${v.toFixed(2)}×`,
      info: 'Real speed would be a blur, so the animation is slowed. The ratios between the gears are exact whatever this is set to.',
    }),
    toggleField('Pitch circles', state.view.showPitch, (value) => update((draft) => { draft.view.showPitch = value; }), {
      info: 'The circles that actually roll on each other. Two gears mesh when their pitch circles touch — the teeth only stop them slipping.',
    }),
    toggleField('Labels and speeds', state.view.showLabels, (value) => update((draft) => { draft.view.showLabels = value; })),
  ], { key: 'view' });
}

function exportSection(scene, model, layout, result, state) {
  return section('Export', [
    buttonRow([
      button('SVG', () => downloadSvg(scene.svg, 'gear-train'), { small: true }),
      button('PNG', () => downloadPng(scene.svg, 'gear-train'), { small: true }),
      button('DXF', () => downloadTrainDxf(model, layout, {
        phases: trainPhases(model, layout, result.speeds, 0),
        bore: 4,
      }), { small: true, title: 'Every gear at its real centre, 1:1 in millimetres' }),
    ]),
    el('p', {
      class: 'field__hint',
      text: 'The DXF is the real thing: every gear at its true centre distance, in millimetres, one layer per feature.',
    }),
  ], { key: 'export' });
}

/* ------------------------------------------------------------ teaching -- */

function explainPanels(model, layout, result, output) {
  const panels = [];
  const firstMesh = model.nodes.find((node) => node.link === 'mesh' || node.link === 'internal');
  const parent = firstMesh ? nodeById(model, firstMesh.parent) : null;

  if (firstMesh && parent && parent.kind !== 'planetary') {
    const reduced = reduceRatio(firstMesh.z, parent.z);
    const external = firstMesh.link === 'mesh';
    panels.push({
      title: 'Why a gear pair changes speed',
      plain: [
        'Two meshing gears roll on each other without slipping, so the rim of one travels exactly as far as the rim of the other. The big one therefore turns more slowly, in proportion to how many teeth it has.',
        external
          ? 'They also turn opposite ways, because they are pushing on each other from outside. That is a property of every external mesh, and it is why a train of three gears comes out turning the same way it went in.'
          : 'A pinion inside a ring turns the same way as the ring, because it is pushing from the inside rather than against the outside.',
      ],
      formula: 'n₂ = ∓ n₁ · z₁ / z₂\n\n  n  speed, rpm\n  z  number of teeth\n  −  external mesh (reverses)\n  +  internal mesh or belt (keeps direction)',
      worked: [
        `${parent.name || parent.id}: z₁ = ${parent.z} teeth at ${fmtNum(result.speeds[parent.id] ?? 0, 4)} rpm`,
        `${firstMesh.name || firstMesh.id}: z₂ = ${firstMesh.z} teeth`,
        '',
        `n₂ = ${external ? '−' : '+'} ${fmtNum(result.speeds[parent.id] ?? 0, 4)} × ${parent.z} / ${firstMesh.z}`,
        `   = ${fmtNum(result.speeds[firstMesh.id] ?? 0, 4)} rpm`,
        '',
        `In lowest terms the pair is ${reduced.a} : ${reduced.b}${reduced.divisor === 1 ? ' — a hunting pair, so every tooth eventually meets every tooth and wear spreads evenly.' : `, sharing a factor of ${reduced.divisor}, so the same teeth keep meeting.`}`,
      ].join('\n'),
    });
  }

  panels.push({
    title: 'How the whole train is solved',
    plain: [
      'Speeds are not passed down the train one gear at a time. Every relationship is written as an equation and the whole set is solved at once.',
      'That is what lets the tool say "you have not said enough yet" instead of inventing a number: a planetary set couples three shafts through one mesh, so it has two degrees of freedom, and until two of them are pinned down there genuinely is no single answer.',
    ],
    formula: 'One equation per relationship, one unknown per shaft:\n\n  mesh      z₁·n₁ + z₂·n₂ = 0\n  ring      z₁·n₁ − z₂·n₂ = 0\n  shaft     n₁ − n₂ = 0\n  planetary z_s·n_s + z_r·n_r − (z_s + z_r)·n_c = 0\n  driven    n = the stated speed\n  held      n = 0',
    worked: [
      ...result.rows.map((row) => `  ${row.text}`),
      '',
      `${result.rows.length} equations, ${result.system.ids.length} unknowns, rank ${result.rank} → ${describeStatus(result)}`,
      '',
      ...result.bodies
        .filter((body) => Number.isFinite(body.rpm))
        .map((body) => `  ${body.label.padEnd(22)} ${fmtNum(body.rpm, 5).padStart(10)} rpm`),
    ].join('\n'),
  });

  if (output && Number.isFinite(output.ratio)) {
    panels.push({
      title: 'Speed, torque and power',
      plain: [
        'Gears do not create power, they trade speed for turning force. Whatever a shaft gives up in speed it gains in torque, in exactly the same proportion.',
        'These figures assume no losses. A real spur stage gives back about 1–2% per mesh, so a three-stage box arrives at roughly 95% of what went in.',
      ],
      formula: 'P = T · ω,  and P is the same all the way through\n\n  ⇒  T_out = T_in · (n_in / n_out)\n\n  T  torque, N·m\n  n  speed, rpm',
      worked: [
        `n_in  = ${fmtNum(result.referenceRpm ?? 0, 5)} rpm`,
        `n_out = ${fmtNum(output.rpm, 5)} rpm`,
        `ratio = ${fmtNum(result.referenceRpm ?? 0, 5)} / ${fmtNum(output.rpm, 5)} = ${fmtNum(output.ratio, 5)}`,
        '',
        `T_out = ${fmtNum(model.inputTorque, 4)} × ${fmtNum(output.ratio, 5)}`,
        `      = ${fmtNum(output.torque, 5)} N·m`,
        '',
        `Power both ends: ${fmtNum(Math.abs((result.referenceRpm ?? 0) * model.inputTorque * Math.PI / 30), 4)} W in, ${fmtNum(Math.abs(output.rpm * output.torque * Math.PI / 30), 4)} W out.`,
      ].join('\n'),
    });
  }

  const meshed = model.nodes.find((node) => node.link === 'mesh');
  if (meshed) {
    const a = nodeById(model, meshed.parent);
    if (a && a.kind !== 'planetary') {
      const ga = geometryOf(model, a);
      const gb = geometryOf(model, meshed);
      const distance = centreDistance({ m: ga.m, z1: a.z, z2: meshed.z });
      panels.push({
        title: 'Where the gears have to sit',
        plain: [
          'The centre distance is not a choice. Two gears mesh when their pitch circles touch, so the shafts are exactly the sum of the pitch radii apart — and that follows from the module and the tooth counts alone.',
          'That is why dragging a gear in this tool swings it around its parent rather than away from it, and why the exported DXF can be cut and bolted together without further arithmetic.',
        ],
        formula: 'a = m · (z₁ + z₂) / 2      external\na = m · (z₂ − z₁) / 2      pinion inside a ring\n\nd  = m · z          pitch diameter\nd_b = d · cos α     base circle, where the involute starts',
        worked: [
          `m = ${fmtNum(ga.m, 4)} mm, z₁ = ${a.z}, z₂ = ${meshed.z}`,
          '',
          `a = ${fmtNum(ga.m, 4)} × (${a.z} + ${meshed.z}) / 2`,
          `  = ${fmtNum(distance, 5)} mm`,
          '',
          `d₁ = ${fmtNum(ga.d, 5)} mm    d₂ = ${fmtNum(gb.d, 5)} mm`,
          `contact ratio = ${fmtNum(contactRatio(ga, gb), 4)} tooth pairs in mesh on average`,
        ].join('\n'),
      });
    }
  }

  const set = model.nodes.find((node) => node.kind === 'planetary');
  if (set) {
    const spec = planetarySpec(model, set);
    panels.push({
      title: 'The planetary set',
      plain: [
        'Stand on the carrier and an epicyclic set looks like an ordinary train running from the sun to the ring. That single change of viewpoint is the whole of the theory, and it gives one equation relating all three shafts.',
        'Note what is missing from it: the planets. They set where the ring has to be, and they share the load, but they contribute nothing at all to the ratio.',
      ],
      formula: 'z_sun·n_sun + z_ring·n_ring = (z_sun + z_ring)·n_carrier\n\nz_ring = z_sun + 2·z_planet\n\nEqual spacing needs (z_sun + z_ring) ÷ planets to be a whole number.',
      worked: [
        `z_sun = ${spec.zSun}, z_planet = ${spec.zPlanet}, z_ring = ${spec.zSun} + 2×${spec.zPlanet} = ${spec.zRing}`,
        '',
        `${spec.zSun}·(${fmtNum(result.speeds[`${set.id}.sun`] ?? 0, 4)}) + ${spec.zRing}·(${fmtNum(result.speeds[`${set.id}.ring`] ?? 0, 4)}) = ${spec.zSun + spec.zRing}·(${fmtNum(result.speeds[`${set.id}.carrier`] ?? 0, 4)})`,
        '',
        `Assembly: (${spec.zSun} + ${spec.zRing}) ÷ ${spec.planets} = ${fmtNum((spec.zSun + spec.zRing) / spec.planets, 5)}`,
        `Planet spin: ${fmtNum(result.speeds[`${set.id}.planet`] ?? 0, 4)} rpm about its own axis, while orbiting at ${fmtNum(result.speeds[`${set.id}.carrier`] ?? 0, 4)} rpm.`,
      ].join('\n'),
    });
  }

  return panels;
}

/* -------------------------------------------------------------- helpers -- */

const describeStatus = (result) => ({
  unique: 'one answer',
  underdetermined: `${result.dof} degree${result.dof === 1 ? '' : 's'} of freedom left`,
  inconsistent: 'no answer — the constraints contradict each other',
}[result.status]);

const countGears = (model) =>
  model.nodes.reduce((total, node) => total + (node.kind === 'planetary' ? 2 + (planetaryCount(node)) : 1), 0);

const planetaryCount = (node) => Math.max(1, node.planets ?? 3);

function nameOf(model, nodeId) {
  const node = nodeById(model, nodeId);
  return node?.name || nodeId;
}

/**
 * The shaft whose numbers the readout shows.
 *
 * The selected gear, by preference — but a held ring is nobody's output, and
 * neither is a planet's own spin, so a turning shaft wins over a stationary
 * one. Otherwise the reading for a planetary set would be a permanent dash.
 */
function pickOutput(result, selectedId) {
  const turning = (body) => Number.isFinite(body.rpm) && Math.abs(body.rpm) > 1e-9;
  const usable = result.bodies.filter((body) => body.id !== result.referenceId && body.member !== 'planet');

  const mine = usable.filter((body) => body.nodeId === selectedId);
  return mine.find(turning) || mine[0]
    || [...usable].reverse().find(turning) || usable[usable.length - 1] || null;
}

/** Somewhere the new gear will not land on top of an existing sibling. */
function nextFreeAngle(model, parentId) {
  const taken = childrenOf(model, parentId).map((child) => Number(child.angle) || 0);
  for (let angle = 0; angle < 360; angle += 30) {
    if (taken.every((used) => Math.abs(((angle - used + 540) % 360) - 180) > 45)) return angle > 180 ? angle - 360 : angle;
  }
  return 0;
}

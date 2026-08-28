/**
 * The planetary set designer.
 *
 * A planetary set is the one arrangement most people can describe but not
 * predict, because it has two degrees of freedom instead of one: the answer
 * depends on which member you hold as much as on the tooth counts. So this tool
 * is built around that choice — pick what is held, pick what drives, and every
 * one of the six possibilities is shown at once with the ratio it gives.
 *
 * Under the hood it is an ordinary one-node train, solved by the same solver as
 * the main tool. Nothing here has its own arithmetic.
 */

import { el } from '../dom.js';
import {
  section, numberField, chipField, toggleField, sliderField,
  stat, bannerList, buttonRow, button, table, rpmStep,
} from '../widgets.js';
import { buildTrainScene } from '../gear-svg.js';
import { explainStack } from '../explain.js';
import { MODEL_VERSION, solveTrain } from '../../train.js';
import { layoutTrain } from '../../layout.js';
import { trainPhases } from '../../phase.js';
import {
  ringTeeth, configurations, assemblyCondition, possiblePlanetCounts,
  neighbourClearance, torqueSplit, MEMBER_LABEL,
} from '../../planetary.js';
import { fmtNum, fmtRatio, fmtDirection } from '../../format.js';
import { downloadSvg, downloadPng, downloadTrainDxf } from '../export.js';

export const meta = { id: 'planetary', label: 'Planetary set', short: 'Planetary' };

const MEMBERS = ['sun', 'ring', 'carrier'];

/** The tool's settings as an ordinary train, so the shared solver can run it. */
export function planetaryModel(p) {
  const zRing = ringTeeth(p.zSun, p.zPlanet);
  return {
    version: MODEL_VERSION,
    defaults: { m: p.m, alphaDeg: 20 },
    nodes: [{
      id: 'p1', kind: 'planetary', name: 'Epicyclic',
      zSun: p.zSun, zPlanet: p.zPlanet, zRing, planets: p.planets,
      parent: null, link: null, attach: 'none', angle: 0,
    }],
    drives: { [`p1.${p.input}`]: p.inputRpm },
    grounds: p.fixed === 'none' || p.fixed === p.input ? [] : [`p1.${p.fixed}`],
    inputTorque: p.inputTorque,
    nextId: 2,
  };
}

export function render(ctx) {
  const { state, stage, sidebar, readout, banners, explainHost, update } = ctx;
  const p = state.planetary;
  const zRing = ringTeeth(p.zSun, p.zPlanet);
  const model = planetaryModel(p);
  const layout = layoutTrain(model);
  const result = solveTrain(model);

  const output = MEMBERS.find((member) => member !== p.input && member !== p.fixed) || 'carrier';
  const outputRpm = result.speeds?.[`p1.${output}`];
  const ratio = Number.isFinite(outputRpm) && outputRpm !== 0 ? p.inputRpm / outputRpm : null;
  const torques = torqueSplit({ zSun: p.zSun, zRing, member: p.input, torque: p.inputTorque });

  /* -- drawing --------------------------------------------------------- */

  const scene = buildTrainScene(model, layout, result, {
    zoom: state.view.zoom,
    showPitch: state.view.showPitch,
    showLabels: state.view.showLabels,
  });
  stage.appendChild(scene.svg);

  /* -- numbers --------------------------------------------------------- */

  readout.append(
    stat('Ratio', ratio ? fmtRatio(ratio) : '—', {
      accent: true,
      note: `${MEMBER_LABEL[p.input]} in → ${MEMBER_LABEL[output]} out${p.fixed === 'none' ? '' : `, ${MEMBER_LABEL[p.fixed].toLowerCase()} held`}`,
      info: 'Input speed divided by output speed. The planets never appear in this number — only the sun and the ring do.',
    }),
    stat('Output speed', Number.isFinite(outputRpm) ? fmtNum(outputRpm, 4) : '—', {
      note: `rpm · ${fmtDirection(outputRpm)}`,
    }),
    stat('Output torque', ratio ? fmtNum(Math.abs(torques[output]), 4) : '—', {
      note: `N·m · lossless`,
      info: 'The three torques are always in the ratio z_sun : z_ring : −(z_sun + z_ring), and they sum to zero. The carrier always takes the opposite sign, because it carries the reaction of both.',
    }),
    stat('Planet spin', Number.isFinite(result.speeds?.['p1.planet']) ? fmtNum(result.speeds['p1.planet'], 4) : '—', {
      note: `rpm about its own axis, orbiting at ${fmtNum(result.speeds?.['p1.carrier'] ?? 0, 4)} rpm`,
    }),
    stat('Tooth counts', `${p.zSun} / ${p.zPlanet} / ${zRing}`, {
      note: 'sun / planet / ring',
    }),
  );

  /* -- warnings -------------------------------------------------------- */

  const problems = [...result.problems];
  if (p.fixed === p.input) {
    problems.push({ level: 'error', text: `The ${p.input} cannot be driven and held at the same time. Pick a different member to hold.` });
  }
  if (p.fixed === 'none') {
    problems.push({
      level: 'warn',
      text: 'With nothing held this is a differential, not a gearbox: two shafts are free, so one input does not decide the output. It is exactly how a car axle lets the outside wheel run faster round a corner.',
    });
  }
  banners.append(...bannerList(problems, { emptyText: 'This set can be built and will give the ratio shown.' }));

  /* -- sidebar --------------------------------------------------------- */

  const patch = (values) => update((draft) => { Object.assign(draft.planetary, values); });
  const gap = neighbourClearance({ m: p.m, zSun: p.zSun, zPlanet: p.zPlanet, count: p.planets });
  const assembly = assemblyCondition(p.zSun, zRing, p.planets);
  const counts = possiblePlanetCounts(p.zSun, zRing);

  sidebar.append(
    section('Teeth', [
      numberField('Sun', p.zSun, (zSun) => patch({ zSun }), {
        min: 8, max: 200, step: 1, integer: true,
        info: 'The central gear. Together with the ring it sets every ratio the set can give.',
      }),
      numberField('Planet', p.zPlanet, (zPlanet) => patch({ zPlanet }), {
        min: 8, max: 200, step: 1, integer: true,
        hint: `Ring is not free: z_ring = ${p.zSun} + 2 × ${p.zPlanet} = ${zRing}`,
        info: 'The planet has to exactly span the gap between the sun and the ring, so choosing it chooses the ring.',
      }),
      numberField('Module', p.m, (m) => patch({ m }), { min: 0.2, max: 20, step: 0.25, unit: 'mm' }),
      numberField('Planets fitted', p.planets, (planets) => patch({ planets }), {
        min: 1, max: 8, step: 1, integer: true,
        hint: counts.length ? `Even spacing is possible with ${counts.join(', ')} planets.` : 'No planet count spaces evenly with these teeth.',
      }),
      el('p', { class: 'field__hint', text: assembly.text }),
      gap.ok
        ? el('p', { class: 'field__hint', text: `${fmtNum(gap.clearance, 3)} mm between neighbouring planet tips.` })
        : null,
    ], { key: 'teeth' }),

    section('Which member does what', [
      chipField('Driven', MEMBERS.map((member) => ({ value: member, label: MEMBER_LABEL[member] })),
        p.input, (input) => patch({ input, fixed: p.fixed === input ? 'none' : p.fixed })),
      chipField('Held to the casing', [...MEMBERS, 'none'].map((member) => ({
        value: member, label: member === 'none' ? 'Nothing' : MEMBER_LABEL[member],
      })), p.fixed, (fixed) => patch({ fixed })),
      el('p', {
        class: 'field__hint',
        text: p.fixed === 'none'
          ? 'Two shafts free: a differential.'
          : `${MEMBER_LABEL[output]} is the output.`,
      }),
      numberField('Input speed', p.inputRpm, (inputRpm) => patch({ inputRpm }), { unit: 'rpm', step: rpmStep(p.inputRpm), min: -100000, max: 100000 }),
      numberField('Input torque', p.inputTorque, (inputTorque) => patch({ inputTorque }), { unit: 'N·m', min: 0, max: 100000, step: 1 }),
    ], { key: 'members', info: 'Hold one member, drive another, and the third is the output. Which one you hold changes the ratio completely — that is the whole character of an epicyclic set.' }),

    section('Every way of driving this set', [
      configurationTable(p, zRing, patch),
    ], { key: 'configurations', info: 'The same three gears give six different ratios depending on what is held and what is driven. Click a row to set it up.' }),

    section('Torque split', [
      table(
        [{ key: 'member', label: 'Member' }, { key: 'share', label: 'Teeth', num: true }, { key: 'torque', label: 'N·m', num: true }],
        MEMBERS.map((member) => ({
          member: MEMBER_LABEL[member],
          share: member === 'carrier' ? `−${p.zSun + zRing}` : String(member === 'sun' ? p.zSun : zRing),
          torque: fmtNum(torques[member], 4),
        })),
      ),
      el('p', { class: 'field__hint', text: 'The three sum to zero. The casing takes whatever the held member reacts against.' }),
    ], { key: 'torque' }),

    section('View', [
      sliderField('Zoom', state.view.zoom, (zoom) => update((draft) => { draft.view.zoom = zoom; }), {
        min: 0.4, max: 3, step: 0.1, format: (v) => `${Math.round(v * 100)}%`,
      }),
      toggleField('Animate', state.view.animate, (value) => update((draft) => { draft.view.animate = value; })),
      sliderField('Animation speed', state.view.speed, (speed) => update((draft) => { draft.view.speed = speed; }), {
        min: 0.05, max: 4, step: 0.05, format: (v) => `${v.toFixed(2)}×`,
      }),
      toggleField('Pitch circles', state.view.showPitch, (value) => update((draft) => { draft.view.showPitch = value; })),
      toggleField('Labels and speeds', state.view.showLabels, (value) => update((draft) => { draft.view.showLabels = value; })),
    ], { key: 'view' }),

    section('Export', [
      buttonRow([
        button('SVG', () => downloadSvg(scene.svg, 'planetary'), { small: true }),
        button('PNG', () => downloadPng(scene.svg, 'planetary'), { small: true }),
        button('DXF', () => downloadTrainDxf(model, layout, {
          phases: trainPhases(model, layout, result.speeds, 0), name: 'planetary', bore: 4,
        }), { small: true }),
        button('Open in the train designer', () => update((draft) => {
          draft.train = planetaryModel(draft.planetary);
          draft.selectedId = 'p1';
          draft.tool = 'train';
        }), { small: true, primary: true }),
      ]),
    ], { key: 'export' }),
  );

  /* -- teaching -------------------------------------------------------- */

  explainHost.append(...explainStack([
    {
      title: 'Why an epicyclic set behaves the way it does',
      plain: [
        'Stand on the carrier and ride round with the planets. From there the carrier is not moving, and what you see is an ordinary gear train running from the sun, through a planet acting as an idler, to the ring. That single change of viewpoint is all the theory there is.',
        'Translate it back to someone standing on the casing and you get one equation relating all three shafts. Notice what is not in it: the planets. They set where the ring has to be and they share the load between them, but they contribute nothing whatever to the ratio.',
      ],
      formula: [
        'Relative to the carrier:',
        '',
        '  (n_sun − n_carrier) / (n_ring − n_carrier) = − z_ring / z_sun',
        '',
        'which rearranges to the form used everywhere below:',
        '',
        '  z_sun·n_sun + z_ring·n_ring = (z_sun + z_ring)·n_carrier',
      ].join('\n'),
      worked: [
        `z_sun = ${p.zSun}, z_ring = ${zRing}`,
        '',
        `${p.zSun} × (${fmtNum(result.speeds?.['p1.sun'] ?? 0, 5)}) + ${zRing} × (${fmtNum(result.speeds?.['p1.ring'] ?? 0, 5)})`,
        `   = ${fmtNum(p.zSun * (result.speeds?.['p1.sun'] ?? 0) + zRing * (result.speeds?.['p1.ring'] ?? 0), 5)}`,
        '',
        `${p.zSun + zRing} × (${fmtNum(result.speeds?.['p1.carrier'] ?? 0, 5)}) = ${fmtNum((p.zSun + zRing) * (result.speeds?.['p1.carrier'] ?? 0), 5)}`,
        '',
        ratio
          ? `Ratio ${MEMBER_LABEL[p.input]} → ${MEMBER_LABEL[output]} = ${fmtNum(p.inputRpm, 5)} / ${fmtNum(outputRpm, 5)} = ${fmtRatio(ratio)}`
          : 'With nothing held there is no single ratio — two shafts are still free.',
      ].join('\n'),
    },
    {
      title: 'Why most tooth counts will not assemble',
      plain: [
        'Planets have to be spaced evenly, or the set is out of balance and the carrier bearings take the difference. But a planet can only be dropped in where the sun has a space and the ring has a space at the same time, and those two patterns only line up at particular angles.',
        'Work through the arithmetic and it comes down to one condition, which quietly rules out most of the tooth counts people first try.',
      ],
      formula: '(z_sun + z_ring) ÷ number of planets  must be a whole number\n\nand neighbouring planets must clear each other:\n\n  2·r_carrier·sin(π/n)  >  m·(z_planet + 2)',
      worked: [
        `(${p.zSun} + ${zRing}) ÷ ${p.planets} = ${fmtNum((p.zSun + zRing) / p.planets, 6)}   → ${assembly.ok ? 'a whole number, so it assembles' : 'not a whole number, so it does not'}`,
        '',
        `Planet centres sit ${fmtNum((p.m * (p.zSun + p.zPlanet)) / 2, 5)} mm from the axis.`,
        `Adjacent centres are ${fmtNum(gap.spacing, 5)} mm apart; a planet is ${fmtNum(gap.tipDiameter, 5)} mm across the tips.`,
        `Clearance = ${fmtNum(gap.clearance, 4)} mm   → ${gap.ok ? 'they fit' : 'they collide'}`,
        '',
        counts.length ? `Planet counts that would assemble: ${counts.join(', ')}` : 'No planet count assembles with these teeth.',
      ].join('\n'),
    },
    {
      title: 'Torque, and why the carrier always takes the most',
      plain: [
        'A lossless gearset cannot store energy, so the three torques must balance. They divide in proportion to the teeth on the sun and the ring, and the carrier gets the sum of both — with the opposite sign, because it is holding the other two apart.',
        'This is why the carrier is always the heavy shaft in a real epicyclic gearbox, and why the ring is usually the one bolted to the casing: it is the member you would otherwise have to build a very stiff shaft for.',
      ],
      formula: 'T_sun : T_ring : T_carrier = z_sun : z_ring : −(z_sun + z_ring)\n\nT_sun + T_ring + T_carrier = 0',
      worked: [
        `${p.zSun} : ${zRing} : −${p.zSun + zRing}`,
        '',
        `Driving the ${p.input} at ${fmtNum(p.inputTorque, 4)} N·m:`,
        `  sun     ${fmtNum(torques.sun, 5).padStart(10)} N·m`,
        `  ring    ${fmtNum(torques.ring, 5).padStart(10)} N·m`,
        `  carrier ${fmtNum(torques.carrier, 5).padStart(10)} N·m`,
        `  sum     ${fmtNum(torques.sun + torques.ring + torques.carrier, 5).padStart(10)} N·m`,
        '',
        `Each of the ${p.planets} planets carries about ${fmtNum(Math.abs(torques.sun) / p.planets, 4)} N·m of the sun's share — which is the real reason for fitting more than one.`,
      ].join('\n'),
    },
  ]));

  return {
    frame: (seconds) => scene.apply(trainPhases(model, layout, result.speeds, seconds), result),
  };
}

function configurationTable(p, zRing, patch) {
  const rows = configurations(p.zSun, zRing);
  const selected = rows.findIndex((row) => row.fixed === p.fixed && row.input === p.input);

  return table(
    [
      { key: 'held', label: 'Held' },
      { key: 'drive', label: 'In → out' },
      { key: 'ratio', label: 'Ratio', num: true },
      { key: 'direction', label: 'Turns' },
    ],
    rows.map((row) => ({
      held: MEMBER_LABEL[row.fixed],
      drive: `${MEMBER_LABEL[row.input]} → ${MEMBER_LABEL[row.output]}`,
      ratio: fmtRatio(row.reduction),
      direction: row.reverses ? 'opposite' : 'same',
      _row: row,
    })),
    {
      selectedIndex: selected,
      onRowClick: (row) => patch({ fixed: row._row.fixed, input: row._row.input }),
    },
  );
}

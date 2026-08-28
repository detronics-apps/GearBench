/**
 * The ratio solver.
 *
 * Working forwards is arithmetic. The question people actually have is
 * backwards — *I need 12.5 : 1, what do I cut?* — and because tooth counts are
 * whole numbers an exact answer usually does not exist. So this offers a
 * shortlist of real gears, says how far each one misses by, and will drop the
 * chosen one straight into the train designer.
 */

import { el, toast } from '../dom.js';
import {
  section, numberField, chipField, stat, bannerList, buttonRow, button, table,
} from '../widgets.js';
import { buildTrainScene } from '../gear-svg.js';
import { explainStack } from '../explain.js';
import { MODEL_VERSION, DEFAULT_RPM, solveTrain } from '../../train.js';
import { layoutTrain } from '../../layout.js';
import { trainPhases } from '../../phase.js';
import { findPairs, findCompound, findPlanetary } from '../../ratios.js';
import { ringTeeth } from '../../planetary.js';
import { fmtNum, fmtRatio, fmtPct, reduceRatio } from '../../format.js';

export const meta = { id: 'ratio', label: 'Ratio solver', short: 'Ratio' };

const MODES = [
  { value: 'single', label: 'One pair', hint: 'A single mesh. Simple, but limited to about 7:1 before the wheel gets silly.' },
  { value: 'compound', label: 'Two stages', hint: 'Two meshes on a countershaft. The ratios multiply, so big reductions become buildable.' },
  { value: 'planetary', label: 'Planetary', hint: 'A sun, planets and a held ring: 1 + z_ring/z_sun, in-line and compact.' },
];

export function render(ctx) {
  const { state, stage, sidebar, readout, banners, explainHost, update } = ctx;
  const r = state.ratio;
  const patch = (values) => update((draft) => { Object.assign(draft.ratio, values); });

  const results = solve(r);
  const chosen = results[0] || null;

  /* -- preview --------------------------------------------------------- */

  const model = chosen ? modelFor(r.mode, chosen) : null;
  const layout = model ? layoutTrain(model) : null;
  const result = model ? solveTrain(model) : null;
  const scene = model
    ? buildTrainScene(model, layout, result, {
      zoom: state.view.zoom, showPitch: state.view.showPitch, showLabels: state.view.showLabels,
    })
    : null;

  if (scene) stage.appendChild(scene.svg);
  else stage.appendChild(el('p', { class: 'muted', text: 'Nothing within the tooth limits reaches that ratio. Widen the range, or split it over two stages.' }));

  /* -- numbers --------------------------------------------------------- */

  readout.append(
    stat('Target', fmtRatio(r.target), { note: 'what you asked for' }),
    stat('Best available', chosen ? fmtRatio(chosen.ratio) : '—', {
      accent: true,
      note: chosen ? describe(r.mode, chosen) : 'no candidate in range',
    }),
    stat('Error', chosen ? fmtPct(chosen.errorPct, 3) : '—', {
      note: chosen?.exact ? 'exact' : 'off the target',
      info: 'Whole tooth counts rarely land on an arbitrary ratio. What matters is whether the miss is small enough for the job — a clock cannot take 0.1%, a conveyor will not notice 3%.',
    }),
    stat('Teeth to cut', chosen ? String(chosen.teeth) : '—', {
      note: 'total across the gearset',
      info: 'Between two equally accurate answers, the smaller gearbox wins. That is the second sort key.',
    }),
  );

  /* -- warnings -------------------------------------------------------- */

  const problems = [];
  if (!results.length) {
    problems.push({ level: 'warn', text: `Nothing between ${r.minTeeth} and ${r.maxTeeth} teeth gets within reach of ${fmtRatio(r.target)}. Try two stages, or allow more teeth.` });
  } else if (chosen && !chosen.exact && Math.abs(chosen.errorPct) > 1) {
    problems.push({ level: 'warn', text: `The closest available is ${fmtPct(chosen.errorPct, 3)} off. If that matters, two stages will usually get much closer than one.` });
  } else if (chosen?.exact) {
    problems.push({ level: 'ok', text: `${fmtRatio(r.target)} is available exactly with these tooth counts.` });
  }
  if (r.mode === 'planetary' && r.target <= 2) {
    problems.push({ level: 'info', text: 'A planetary set with the ring held always reduces by more than 2:1, because the ring must have more teeth than the sun.' });
  }
  banners.append(...bannerList(problems));

  /* -- sidebar --------------------------------------------------------- */

  sidebar.append(
    section('What do you need', [
      numberField('Target ratio', r.target, (target) => patch({ target }), {
        min: 0.05, max: 10000, step: 0.5,
        info: 'Input speed divided by output speed. 12.5 means the output turns twelve and a half times more slowly, and twelve and a half times harder.',
      }),
      chipField('Arrangement', MODES, r.mode, (mode) => patch({ mode })),
      el('p', { class: 'field__hint', text: MODES.find((mode) => mode.value === r.mode)?.hint || '' }),
      numberField('Fewest teeth', r.minTeeth, (minTeeth) => patch({ minTeeth }), {
        min: 6, max: 60, step: 1, integer: true,
        hint: 'Below about 17 a 20° gear undercuts unless it is profile-shifted.',
      }),
      numberField('Most teeth', r.maxTeeth, (maxTeeth) => patch({ maxTeeth }), {
        min: 20, max: 200, step: 5, integer: true,
        hint: 'The practical limit is usually how big a blank you can hold.',
      }),
      r.mode === 'planetary' ? numberField('Planets', r.planets, (planets) => patch({ planets }), {
        min: 2, max: 6, step: 1, integer: true,
        hint: 'More planets share the load, but far fewer tooth counts will assemble.',
      }) : null,
    ], { key: 'target' }),

    section(`Candidates (${results.length})`, [
      resultsTable(r.mode, results, (row) => {
        patch({});
        update((draft) => {
          draft.ratio = { ...draft.ratio };
          draft.train = modelFor(draft.ratio.mode, row._result);
          draft.selectedId = draft.train.nodes[0].id;
          draft.tool = 'train';
          toast(`Loaded ${describe(draft.ratio.mode, row._result)} into the train designer`);
        });
      }),
    ], { key: 'candidates', info: 'Closest first; between equal errors, the one with fewer teeth. Click a row to open it in the train designer.' }),

    chosen ? section('Use it', [
      buttonRow([
        button('Open in the train designer', () => update((draft) => {
          draft.train = modelFor(draft.ratio.mode, chosen);
          draft.selectedId = draft.train.nodes[0].id;
          draft.tool = 'train';
        }), { primary: true, small: true }),
      ]),
    ], { key: 'use' }) : null,
  );

  /* -- teaching -------------------------------------------------------- */

  explainHost.append(...explainStack(panels(r, chosen, results)));

  return scene && result
    ? { frame: (seconds) => scene.apply(trainPhases(model, layout, result.speeds, seconds), result) }
    : null;
}

/* -------------------------------------------------------------- solving -- */

function solve(r) {
  const options = { minTeeth: r.minTeeth, maxTeeth: r.maxTeeth, limit: 14 };
  if (r.mode === 'compound') return findCompound(r.target, { ...options, maxTeeth: Math.min(r.maxTeeth, 90) });
  if (r.mode === 'planetary') {
    return findPlanetary(r.target, {
      minSun: r.minTeeth, maxSun: Math.min(r.maxTeeth, 70), maxRing: r.maxTeeth * 2,
      planets: r.planets, limit: 14,
    });
  }
  return findPairs(r.target, { ...options, tolerancePct: 8 });
}

const describe = (mode, item) => (mode === 'planetary'
  ? `sun ${item.zSun}, planet ${item.zPlanet}, ring ${item.zRing}`
  : item.stages.map((stage) => `${stage.z1}:${stage.z2}`).join(' then '));

/** Turn a candidate into a real train, so the preview is the actual thing. */
function modelFor(mode, item) {
  const base = { version: MODEL_VERSION, defaults: { m: 2, alphaDeg: 20 }, grounds: [], inputTorque: 5 };

  if (mode === 'planetary') {
    return {
      ...base,
      nodes: [{
        id: 'p1', kind: 'planetary', name: 'Epicyclic',
        zSun: item.zSun, zPlanet: item.zPlanet, zRing: ringTeeth(item.zSun, item.zPlanet),
        planets: item.planets, parent: null, link: null, attach: 'none', angle: 0,
      }],
      drives: { 'p1.sun': DEFAULT_RPM },
      grounds: ['p1.ring'],
      nextId: 2,
    };
  }

  const nodes = [{ id: 'g1', kind: 'gear', name: 'Input', z: item.stages[0].z1, parent: null, link: null, angle: 0 }];
  let previous = 'g1';
  let next = 2;
  item.stages.forEach((stage, index) => {
    if (index > 0) {
      nodes.push({ id: `g${next}`, kind: 'gear', name: `Counter ${index}`, z: stage.z1, parent: previous, link: 'shaft', angle: 0 });
      previous = `g${next}`;
      next += 1;
    }
    nodes.push({
      id: `g${next}`, kind: 'gear',
      name: index === item.stages.length - 1 ? 'Output' : `Wheel ${index + 1}`,
      z: stage.z2, parent: previous, link: 'mesh', angle: index === 0 ? 0 : -55,
    });
    previous = `g${next}`;
    next += 1;
  });

  return { ...base, nodes, drives: { g1: DEFAULT_RPM }, nextId: next };
}

function resultsTable(mode, results, onPick) {
  if (!results.length) return el('p', { class: 'muted', text: 'Nothing in range.' });

  const columns = mode === 'planetary'
    ? [
      { key: 'teeth', label: 'Sun / planet / ring' },
      { key: 'ratio', label: 'Ratio', num: true },
      { key: 'error', label: 'Error', num: true },
    ]
    : [
      { key: 'teeth', label: 'Teeth' },
      { key: 'ratio', label: 'Ratio', num: true },
      { key: 'error', label: 'Error', num: true },
      { key: 'note', label: '' },
    ];

  return table(columns, results.map((item) => ({
    teeth: mode === 'planetary'
      ? `${item.zSun} / ${item.zPlanet} / ${item.zRing}`
      : item.stages.map((stage) => `${stage.z1}:${stage.z2}`).join('  ×  '),
    ratio: fmtNum(item.ratio, 6),
    error: item.exact ? 'exact' : fmtPct(item.errorPct, 3),
    note: item.hunting ? 'hunting' : '',
    _result: item,
  })), { onRowClick: onPick, selectedIndex: 0 });
}

/* ------------------------------------------------------------- teaching -- */

function panels(r, chosen, results) {
  const out = [{
    title: 'Why an exact ratio is usually not available',
    plain: [
      'A gear ratio is a fraction of two whole numbers. Most ratios anyone actually wants — 12.5, π, 60/17 — are not, or need tooth counts nobody would cut, so the honest answer is a shortlist with the error next to each entry rather than a single number.',
      'Between two equally accurate options the smaller gearset wins: less metal, less inertia, a smaller housing.',
    ],
    formula: 'ratio = z₂ / z₁                     one pair\nratio = (z₂/z₁) · (z₄/z₃)          two stages, multiplied\nratio = 1 + z_ring / z_sun         planetary, ring held\n\nerror = (achieved − target) / target',
    worked: chosen
      ? [
        `Target ${fmtNum(r.target, 6)}`,
        '',
        r.mode === 'planetary'
          ? `1 + ${chosen.zRing}/${chosen.zSun} = ${fmtNum(chosen.ratio, 8)}`
          : `${chosen.stages.map((stage) => `${stage.z2}/${stage.z1}`).join(' × ')} = ${fmtNum(chosen.ratio, 8)}`,
        '',
        `error = (${fmtNum(chosen.ratio, 8)} − ${fmtNum(r.target, 6)}) / ${fmtNum(r.target, 6)} = ${fmtPct(chosen.errorPct, 4)}`,
        '',
        `${results.length} arrangements searched within ${r.minTeeth}–${r.maxTeeth} teeth.`,
      ].join('\n')
      : `Nothing between ${r.minTeeth} and ${r.maxTeeth} teeth comes close to ${fmtNum(r.target, 6)}.`,
  }];

  if (r.mode !== 'planetary' && chosen) {
    const reduced = reduceRatio(chosen.stages[0].z2, chosen.stages[0].z1);
    out.push({
      title: 'Hunting pairs, and why they wear better',
      plain: [
        'If the two tooth counts share a factor, the same pairs of teeth keep meeting: tooth 1 always lands on tooth 1, 11, 21 and nothing else. Any manufacturing error on one tooth is hammered into the same few partners for the life of the gearbox.',
        'Make the counts share no factor and every tooth eventually meets every tooth, so errors and wear are spread all the way round. That is a hunting pair, and it is worth a tooth of ratio error to get one.',
      ],
      formula: 'hunting  ⇔  gcd(z₁, z₂) = 1\n\nTeeth meet again after  lcm(z₁, z₂) / z₁  turns of the pinion.',
      worked: [
        `${chosen.stages[0].z1} and ${chosen.stages[0].z2}: gcd = ${reduced.divisor}`,
        reduced.divisor === 1
          ? `A hunting pair — the pinion has to turn ${chosen.stages[0].z2} times before a tooth meets its first partner again.`
          : `Not hunting: in lowest terms ${reduced.a} : ${reduced.b}, so the pinion repeats after only ${chosen.stages[0].z2 / reduced.divisor} turns.`,
      ].join('\n'),
    });
  }

  if (r.mode === 'compound' && chosen) {
    out.push({
      title: 'Why two stages beat one',
      plain: [
        'A single pair is limited by geometry, not by arithmetic. Ten to one from a 12-tooth pinion means a 120-tooth wheel — nearly a foot across at module 2, with all the inertia and housing that implies.',
        'Split it over two meshes and the ratios multiply, so 10:1 becomes two stages of about 3.2:1. The gears get dramatically smaller, and the countershaft that carries the middle two is one part.',
      ],
      formula: 'ratio = (z₂/z₁) · (z₄/z₃)\n\nGears 2 and 3 are on one shaft, so n₂ = n₃ and the reductions simply multiply.',
      worked: [
        ...chosen.stages.map((stage, index) => `stage ${index + 1}: ${stage.z2}/${stage.z1} = ${fmtNum(stage.z2 / stage.z1, 6)}`),
        '',
        `overall = ${chosen.stages.map((stage) => fmtNum(stage.z2 / stage.z1, 5)).join(' × ')} = ${fmtNum(chosen.ratio, 7)}`,
        '',
        `Largest wheel: ${Math.max(...chosen.stages.map((stage) => stage.z2))} teeth, against ${Math.round(r.minTeeth * r.target)} for a single pair off the same pinion.`,
      ].join('\n'),
    });
  }

  return out;
}

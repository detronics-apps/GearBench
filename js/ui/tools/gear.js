/**
 * One gear, dimensioned — the tool you reach for when you have to cut, print or
 * order a specific part, and the place the involute is explained.
 */

import { el } from '../dom.js';
import {
  section, numberField, selectField, toggleField, chipField,
  stat, bannerList, buttonRow, button, table,
} from '../widgets.js';
import { renderSingleGear } from '../gear-svg.js';
import { explainStack } from '../explain.js';
import { gearGeometry, involute, minTeethNoUndercut, minProfileShift, DEG } from '../../gearmath.js';
import { measuredToothThickness, gearOutline, pointedRadius } from '../../involute.js';
import { nearestModule, nearestDP, dpFromModule, SERIES } from '../../modules.js';
import { BORE_TYPES, boreOutline, resolveBore, boreProblems, keyForBore, splineForBore } from '../../bore.js';
import { fmtNum, fmtMm, fmtDeg, fmtPct } from '../../format.js';
import { downloadSvg, downloadPng, downloadGearDxf } from '../export.js';

export const meta = { id: 'gear', label: 'Single gear', short: 'Gear' };

export function render(ctx) {
  const { state, stage, sidebar, readout, banners, explainHost, update } = ctx;
  const g = state.gear;
  const geometry = gearGeometry({
    m: g.m, z: g.z, alphaDeg: g.alphaDeg, x: g.x, internal: g.internal,
  });
  const patch = (values) => update((draft) => { Object.assign(draft.gear, values); });

  const boreSpec = {
    type: g.boreType,
    diameter: g.bore,
    slotWidth: g.boreSlotWidth,
    slotDepth: g.boreSlotDepth,
    count: g.boreCount,
    majorDiameter: g.boreMajor,
  };
  const bore = resolveBore(boreSpec);
  const borePoints = g.bore > 0 ? boreOutline(boreSpec, { steps: 40 }) : null;

  /* -- drawing --------------------------------------------------------- */

  const drawing = renderSingleGear(geometry, {
    boreProfile: borePoints,
    caption: `${g.internal ? 'Ring gear' : 'Spur gear'} · module ${fmtNum(g.m, 4)} · ${g.z} teeth · ${fmtNum(g.alphaDeg, 4)}° pressure angle${g.x ? ` · shift ${fmtNum(g.x, 3)}` : ''}`,
  });
  stage.appendChild(drawing);

  /* -- numbers --------------------------------------------------------- */

  readout.append(
    stat('Pitch diameter', fmtNum(geometry.d, 5), {
      accent: true, note: 'mm · d = m · z',
      info: 'The circle that actually rolls. Two gears mesh when their pitch circles touch, so this is the number that decides where the shafts go.',
    }),
    stat('Tip diameter', fmtNum(geometry.da, 5), { note: 'mm · the blank you start from' }),
    stat('Root diameter', fmtNum(geometry.df, 5), { note: 'mm · the bottom of the tooth space' }),
    stat('Base diameter', fmtNum(geometry.db, 5), {
      note: 'mm · d · cos α',
      info: 'The circle the involute unwinds from. There is no tooth flank inside it at all — below the base circle the profile just runs straight.',
    }),
    stat('Tooth thickness', fmtNum(geometry.toothThickness, 5), {
      note: 'mm · arc, on the pitch circle',
      info: 'Half the circular pitch when there is no profile shift, so a tooth and a space are the same width — which is why any two gears of the same module mesh.',
    }),
  );

  /* -- warnings -------------------------------------------------------- */

  const problems = [];
  if (geometry.undercut) {
    problems.push({
      level: 'warn',
      text: `At ${g.z} teeth and ${fmtNum(g.alphaDeg, 3)}° the cutter undercuts the flank: it carves into the root of the tooth on its way past, thinning exactly the part that carries the bending. Below ${Math.ceil(geometry.zMin)} teeth you need a profile shift of at least ${fmtNum(geometry.xMin, 3)}.`,
    });
  }
  if (geometry.pointed) {
    problems.push({
      level: 'warn',
      text: `The flanks meet before they reach the tip circle, so the teeth come to a knife edge at ${fmtMm(pointedRadius(geometry) * 2, 4)} diameter. Reduce the profile shift or take some addendum off.`,
    });
  }
  if (g.internal && g.z < 20) {
    problems.push({
      level: 'warn',
      text: `A ${g.z}-tooth ring leaves almost nothing to run inside it: the pinion would need fewer than ${Math.max(1, g.z - 10)} teeth to clear the ring tooth on the way in. Ring gears are normally 40 teeth and up.`,
    });
  }
  if (geometry.tipThickness > 0 && geometry.tipThickness < 0.25 * geometry.m) {
    problems.push({
      level: 'warn',
      text: `Only ${fmtMm(geometry.tipThickness, 3)} of tooth left at the tip. Under about a quarter of a module the tip will not survive hardening or a knock.`,
    });
  }
  if (!nearestModule(g.m, 'any').standard) {
    const snap = nearestModule(g.m, 'I');
    problems.push({
      level: 'info',
      text: `Module ${fmtNum(g.m, 4)} is not an ISO 54 preferred size, so no standard cutter exists for it. The nearest stocked module is ${snap.value} mm, ${fmtPct(-snap.deviationPct, 3)} away.`,
    });
  }
  // A keyway cut through into the tooth roots is the failure people do not
  // see coming, so it is reported beside the geometry warnings, not hidden in
  // the bore panel.
  if (g.bore > 0) problems.push(...boreProblems(boreSpec, geometry));

  banners.append(...bannerList(problems, { emptyText: 'A sound, standard, cuttable gear.' }));

  /* -- sidebar --------------------------------------------------------- */

  const snapped = nearestModule(g.m, g.series);
  const dp = nearestDP(dpFromModule(g.m));

  sidebar.append(
    section('The gear', [
      numberField('Module', g.m, (m) => patch({ m }), {
        min: 0.1, max: 50, step: 0.25, unit: 'mm',
        info: 'Tooth size, in millimetres of pitch diameter per tooth. Everything scales with it and no ratio changes.',
        hint: `${dpFromModule(g.m).toFixed(3)} diametral pitch — nearest stocked cutter is ${dp.value} DP.`,
      }),
      selectField('Preferred sizes', Object.values(SERIES).map((series) => ({ value: series.id, label: series.label })),
        g.series, (series) => patch({ series }), {
          info: 'The gear equivalent of the E-series: cutters only exist in certain sizes, so a module between them cannot be bought.',
        }),
      snapped.value !== g.m && Number.isFinite(snapped.value) ? buttonRow([
        button(`Snap to ${snapped.value} mm (${fmtPct(-snapped.deviationPct, 3)})`, () => patch({ m: snapped.value }), { small: true }),
      ]) : el('p', { class: 'field__hint', text: `${fmtNum(g.m, 4)} mm is a preferred module${snapped.series ? ` (series ${snapped.series})` : ''}.` }),

      /*
       * Diameter and module are two views of one number, d = m·z, and people
       * arrive with either. Typing a diameter sets the module to suit the
       * tooth count; typing a module changes the diameter. Same object, two
       * ways in — the house pattern for bidirectional inputs.
       */
      numberField('Pitch diameter', geometry.d, (d) => patch({ m: d / Math.max(1, g.z) }), {
        min: 1, max: 4000, step: 1, unit: 'mm', key: 'pitch-diameter',
        info: 'The circle that actually rolls. Setting it here works out the module for the tooth count you have — which is how you hit a centre distance you have been given.',
        hint: `Ø${fmtNum(geometry.da, 5)} mm over the tips, Ø${fmtNum(geometry.df, 5)} mm at the roots.`,
      }),

      numberField('Teeth', g.z, (z) => patch({ z }), {
        min: 6, max: 400, step: 1, integer: true,
        hint: `Undercut begins below ${fmtNum(minTeethNoUndercut(g.alphaDeg, 1), 4)} teeth at ${fmtNum(g.alphaDeg, 3)}°.`,
      }),
      chipField('Pressure angle', [
        { value: 14.5, label: '14.5°' }, { value: 20, label: '20°' }, { value: 25, label: '25°' },
      ], g.alphaDeg, (value) => patch({ alphaDeg: Number(value) }), {
        info: 'The angle the flanks push at. 20° is the modern standard; 14.5° is old imperial stock; 25° is stronger but noisier and pushes the shafts apart harder.',
      }),
      numberField('Profile shift', g.x, (x) => patch({ x }), {
        min: -1, max: 1.5, step: 0.05,
        hint: `The shift that just cures undercut here is ${fmtNum(minProfileShift(g.z, g.alphaDeg, 1), 3)}.`,
        info: 'Cutting the tooth from further out on the rack. It fattens the root of a small pinion at the cost of a thinner tip, and it moves the centre distance.',
      }),
      toggleField('Internal (ring gear)', g.internal, (internal) => patch({ internal }), {
        info: 'Teeth pointing inward. A pinion running inside a ring turns the same way as the ring, meshes more quietly, and carries more load — which is why every planetary set has one.',
      }),
    ], { key: 'gear' }),

    boreSection(g, bore, geometry, patch),

    section('Every dimension', [dimensionTable(geometry)], { key: 'dimensions' }),

    section('Export', [
      buttonRow([
        button('SVG', () => downloadSvg(drawing, `gear-m${g.m}-z${g.z}`), { small: true }),
        button('PNG', () => downloadPng(drawing, `gear-m${g.m}-z${g.z}`), { small: true }),
        button('DXF', () => downloadGearDxf(geometry, {
          name: 'gear', bore: g.bore / 2, boreProfile: borePoints,
        }), { small: true, primary: true }),
      ]),
      el('p', {
        class: 'field__hint',
        text: 'The DXF is 1:1 in millimetres with real involute flanks and a proper root fillet — profile, bore, pitch circle and centre marks each on their own layer.',
      }),
    ], { key: 'export' }),
  );

  /* -- teaching -------------------------------------------------------- */

  const measured = measuredToothThickness(gearOutline(geometry), geometry.r, geometry.z);

  explainHost.append(...explainStack([
    {
      title: 'What the module actually is',
      plain: [
        'A gear is a circle that rolls without slipping. The circle is the pitch circle, and the teeth exist only to stop it slipping — they are not the mechanism, they are the grip.',
        'The module is how much pitch diameter each tooth is given. Fix the module and the tooth size is fixed, so any two gears of that module will mesh; change it and the whole gear scales without a single ratio changing.',
      ],
      formula: 'd  = m · z            pitch diameter\np  = π · m            circular pitch — arc from one tooth to the next\nd_a = d + 2m          tip, one module above the pitch circle\nd_f = d − 2.5m        root, 1.25 modules below (the extra 0.25 is clearance)\nd_b = d · cos α       base circle',
      worked: [
        `m = ${fmtNum(g.m, 4)} mm, z = ${g.z}, α = ${fmtNum(g.alphaDeg, 4)}°`,
        '',
        `d   = ${fmtNum(g.m, 4)} × ${g.z} = ${fmtMm(geometry.d, 6)}`,
        `p   = π × ${fmtNum(g.m, 4)} = ${fmtMm(geometry.circularPitch, 6)}`,
        `d_a = ${fmtMm(geometry.da, 6)}`,
        `d_f = ${fmtMm(geometry.df, 6)}`,
        `d_b = ${fmtMm(geometry.d, 6)} × cos ${fmtDeg(g.alphaDeg, 4)} = ${fmtMm(geometry.db, 6)}`,
        '',
        `Whole depth ${fmtMm(geometry.wholeDepth, 5)}, tip clearance ${fmtMm(geometry.clearance, 4)}.`,
      ].join('\n'),
    },
    {
      title: 'Why the flank is an involute and not a circle',
      plain: [
        'Tie a string round a circle, pull it taut and unwind it. The path the end traces is an involute, and it is the shape of every modern gear tooth.',
        'It is used because of one property: two involutes touching always push along the same fixed straight line, whatever position the gears are in. The ratio therefore stays exactly constant through the tooth — and it survives a centre distance that is a little bit wrong, which no other profile manages.',
      ],
      formula: 'inv(α) = tan α − α\n\nHalf the tooth, measured from its centreline, at radius ρ:\n\n  φ(ρ) = s/(2r) + inv(α) − inv(α_ρ),   cos α_ρ = r_b/ρ\n\nThe tooth is a wedge: φ shrinks as ρ grows.',
      worked: [
        `inv(${fmtDeg(g.alphaDeg, 4)}) = tan ${fmtNum(g.alphaDeg, 4)}° − ${fmtNum(g.alphaDeg * DEG, 6)} rad = ${fmtNum(involute(g.alphaDeg * DEG), 6)}`,
        '',
        `On the pitch circle  (ρ = ${fmtMm(geometry.r, 5)}):  tooth ${fmtMm(geometry.toothThickness, 5)} wide`,
        `On the tip circle    (ρ = ${fmtMm(geometry.ra, 5)}):  tooth ${fmtMm(geometry.tipThickness, 5)} wide`,
        `On the base circle   (ρ = ${fmtMm(geometry.rb, 5)}):  the flank runs out — nothing below it`,
        '',
        `The drawing above is measured, not assumed: the polygon it exports comes out ${fmtMm(measured, 6)} thick on the pitch circle against ${fmtMm(geometry.toothThickness, 6)} from the formula, a difference of ${fmtPct(((measured - geometry.toothThickness) / geometry.toothThickness) * 100, 2)}.`,
      ].join('\n'),
    },
    {
      title: 'Undercut, and what profile shift is for',
      plain: [
        'Gears are cut by a rack that rolls past the blank. On a gear with few teeth the corner of that rack swings inside the base circle and scoops metal out of the root of the flank — undercut. The tooth ends up thin exactly where the bending stress is highest.',
        'The cure is to cut from further out on the rack: a positive profile shift. The tooth gets a fatter root and a thinner tip, and the gears end up sitting slightly further apart than the nominal centre distance.',
      ],
      formula: 'z_min = 2·h_a / sin²α          fewest teeth before undercut\nx_min = h_a − z·sin²α / 2      the shift that just cures it\n\ns = m·(π/2 + 2·x·tan α)        tooth thickness, with shift',
      worked: [
        `z_min = 2 / sin²(${fmtDeg(g.alphaDeg, 4)}) = ${fmtNum(minTeethNoUndercut(g.alphaDeg, 1), 6)} teeth`,
        `this gear has ${g.z} → ${geometry.undercut ? 'undercut' : 'no undercut'}`,
        '',
        `x_min = 1 − ${g.z} × sin²(${fmtDeg(g.alphaDeg, 4)}) / 2 = ${fmtNum(geometry.xMin, 5)}`,
        `x set to ${fmtNum(g.x, 4)} → ${g.x >= geometry.xMin ? 'clear' : `${fmtNum(geometry.xMin - g.x, 4)} short`}`,
        '',
        `s = ${fmtNum(g.m, 4)} × (π/2 + 2 × ${fmtNum(g.x, 4)} × tan ${fmtDeg(g.alphaDeg, 4)}) = ${fmtMm(geometry.toothThickness, 6)}`,
        `space = ${fmtMm(geometry.spaceWidth, 6)}  (the two always add up to ${fmtMm(geometry.circularPitch, 6)})`,
      ].join('\n'),
    },
  ]));

  return null;
}

/**
 * How the gear is fixed to its shaft.
 *
 * A gear that cannot transmit torque to the shaft is an ornament, so this is
 * not a detail. Defaults come from DIN 6885 for keys and DIN 5463 for splines,
 * chosen from the bore size — right without being asked, and overridable when
 * the shaft in your hand disagrees with the standard.
 */
function boreSection(g, bore, geometry, patch) {
  const key = keyForBore(g.bore);
  const spline = splineForBore(g.bore);
  const fields = [
    numberField('Bore diameter', g.bore, (value) => patch({ bore: value }), {
      min: 0, max: 400, step: 1, unit: 'mm', key: 'bore-diameter',
      hint: 'Zero leaves the gear solid.',
    }),
    chipField('Fixing', Object.values(BORE_TYPES).map((type) => ({
      value: type.id, label: type.label, title: type.hint,
    })), g.boreType, (value) => patch({
      // Clearing the overrides puts the standard back for the new type.
      boreType: value, boreSlotWidth: 0, boreSlotDepth: 0, boreCount: 0, boreMajor: 0,
    })),
    el('p', { class: 'field__hint', text: BORE_TYPES[g.boreType]?.hint || '' }),
  ];

  if (g.boreType === 'keyway' || g.boreType === 'keyway2') {
    fields.push(
      numberField('Key width', bore.slotWidth, (value) => patch({ boreSlotWidth: value }), {
        min: 0.5, max: 60, step: 0.5, unit: 'mm', key: 'key-width',
        info: 'The b dimension of a parallel key. DIN 6885 fixes it by shaft size — the standard key for this bore is the default.',
      }),
      numberField('Slot depth', bore.slotDepth, (value) => patch({ boreSlotDepth: value }), {
        min: 0.2, max: 30, step: 0.1, unit: 'mm', key: 'key-depth',
        info: 'The t2 dimension: how far the slot goes into the hub, measured out from the bore. The rest of the key sits in the shaft.',
      }),
      key ? el('p', {
        class: 'field__hint',
        text: `DIN 6885 for a ${fmtNum(g.bore, 4)} mm shaft: ${key.b} × ${key.h} mm key, ${key.t2} mm into the hub.`,
      }) : null,
    );
  }

  if (g.boreType === 'spline') {
    fields.push(
      numberField('Splines', bore.count, (value) => patch({ boreCount: value }), {
        min: 3, max: 24, step: 1, integer: true, key: 'spline-count',
      }),
      numberField('Major diameter', bore.majorDiameter, (value) => patch({ boreMajor: value }), {
        min: 1, max: 400, step: 0.5, unit: 'mm', key: 'spline-major',
        info: 'The D dimension: the top of the spline slots. The bore diameter is the minor one, d.',
      }),
      numberField('Spline width', bore.slotWidth, (value) => patch({ boreSlotWidth: value }), {
        min: 0.5, max: 40, step: 0.5, unit: 'mm', key: 'spline-width',
      }),
      spline ? el('p', {
        class: 'field__hint',
        text: `Nearest DIN 5463 medium series: ${spline.count} × ${spline.d} × ${spline.D}, ${spline.B} mm wide.`,
      }) : null,
    );
  }

  if (g.bore > 0 && g.boreType !== 'plain') {
    const wall = geometry.rf - (bore.radius + bore.slotDepth);
    fields.push(el('dl', { class: 'dims' }, [
      el('dt', { text: 'Metal to the tooth roots' }),
      el('dd', { class: 'value', text: `${fmtNum(wall, 4)} mm` }),
    ]));
  }

  return section('Bore and fixing', fields, {
    key: 'bore',
    info: 'Keys and splines are cut into the gear, so they are part of the geometry and go out in the DXF on their own layer.',
  });
}

function dimensionTable(geometry) {
  const rows = [
    ['Pitch diameter', 'd = m·z', geometry.d],
    ['Base diameter', 'd_b = d·cos α', geometry.db],
    ['Tip diameter', geometry.internal ? 'd_a = d − 2m' : 'd_a = d + 2m', geometry.da],
    ['Root diameter', geometry.internal ? 'd_f = d + 2.5m' : 'd_f = d − 2.5m', geometry.df],
    ['Addendum', 'h_a = m', geometry.addendum],
    ['Dedendum', 'h_f = 1.25m', geometry.dedendum],
    ['Whole depth', 'h = h_a + h_f', geometry.wholeDepth],
    ['Tip clearance', 'c = 0.25m', geometry.clearance],
    ['Circular pitch', 'p = π·m', geometry.circularPitch],
    ['Base pitch', 'p_b = π·m·cos α', geometry.basePitch],
    ['Tooth thickness', 's, on the pitch circle', geometry.toothThickness],
    ['Space width', 'e = p − s', geometry.spaceWidth],
    ['Tip thickness', 's_a, on the tip circle', geometry.tipThickness],
  ];
  return table(
    [{ key: 'name', label: 'Dimension' }, { key: 'formula', label: 'From' }, { key: 'value', label: 'mm', num: true }],
    rows.map(([name, formula, value]) => ({ name, formula, value: fmtNum(value, 5) })),
  );
}

/**
 * Drawing gears.
 *
 * Two decisions shape this file.
 *
 * 1. **The scene is built once and animated by transform.** A 127-tooth gear is
 *    six thousand points; regenerating that path sixty times a second would be
 *    absurd. Each gear is drawn once into its own group, and a frame only
 *    rewrites `transform` and a couple of text nodes.
 *
 * 2. **Colour means something.** Gears are tinted by which axial plane they sit
 *    in and outlined by what the shaft is doing — driven, held, selected.
 *    Nothing is coloured merely to tell it apart from its neighbour; the label
 *    does that. Every colour is a token, so both themes come out right.
 *
 * Gear geometry arrives in maths coordinates (y up) and is drawn in screen
 * coordinates (y down). The flip happens once, in JS, so that no text ever
 * ends up inside a mirrored transform.
 */

import { svg } from './dom.js';
import { gearOutline, toPath, rimRadius } from '../involute.js';
import { geometryOf, planetarySpec, nodeById } from '../train.js';
import { gearGeometry } from '../gearmath.js';
import { fmtNum, turnsClockwise } from '../format.js';
import { screenRotationDeg } from '../phase.js';


/* ------------------------------------------------------- outline cache -- */

const cache = new Map();

/** The tooth outline for a spec, generated once and kept. */
export function outlineFor(geometry, steps = 10) {
  const key = [geometry.m, geometry.z, geometry.alphaDeg, geometry.x, geometry.internal, steps].join('|');
  let value = cache.get(key);
  if (!value) {
    const points = gearOutline(geometry, {
      flankSteps: steps, tipSteps: 3, rootSteps: Math.max(3, steps >> 1),
    });
    value = { points, path: toPath(points) };
    cache.set(key, value);
    if (cache.size > 240) cache.delete(cache.keys().next().value);
  }
  return value;
}

/** Hub size: big enough to look like a part, never bigger than the root. */
export const boreRadius = (geometry) =>
  Math.max(0.8, Math.min(geometry.d * 0.11, Math.max(1, geometry.rf - 2.2 * geometry.m)));

/* ------------------------------------------------------------ one gear -- */

/**
 * One gear as a `<g>`, drawn in millimetres about its own centre. The caller
 * supplies the transform that places, scales and rotates it, so animating is a
 * single attribute write.
 */
export function gearGroup(geometry, {
  fill = 'var(--plane-0)',
  stroke = 'var(--border-strong)',
  strokeWidth = 1,
  steps = 10,
  showPitch = true,
  showBore = true,
  showMark = true,
  halo = false,
  boreProfile = null,
} = {}) {
  const group = svg('g', { class: 'gear' });
  const { path } = outlineFor(geometry, steps);

  // A gear on a higher axial plane sits *in front* of the one below it, and a
  // tint alone does not say so — least of all in dark mode, where the panel
  // shades are close together. Painting the same outline in the panel colour
  // first cuts a clean gap around it, so the stack reads as a stack.
  if (halo && !geometry.internal) {
    group.appendChild(svg('path', {
      d: path, fill: 'var(--panel)', stroke: 'var(--panel)',
      'stroke-width': strokeWidth * 4, 'stroke-linejoin': 'round',
    }));
  }

  if (geometry.internal) {
    // A ring gear is an annulus: the rim, minus the toothed bore. Even-odd fill
    // turns the two subpaths into a hole rather than a blob.
    const rim = rimRadius(geometry);
    group.appendChild(svg('path', {
      d: `M ${-rim} 0 A ${rim} ${rim} 0 1 0 ${rim} 0 A ${rim} ${rim} 0 1 0 ${-rim} 0 Z ${path}`,
      fill, stroke, 'stroke-width': strokeWidth, 'fill-rule': 'evenodd', 'stroke-linejoin': 'round',
    }));
  } else {
    group.appendChild(svg('path', {
      d: path, fill, stroke, 'stroke-width': strokeWidth, 'stroke-linejoin': 'round',
    }));
    if (showBore) {
      // A keyway or a spline is a shape rather than a hole, so it is drawn as
      // a path when one is supplied. It sits inside the gear group so it turns
      // with the teeth — which is the point of a keyway.
      group.appendChild(boreProfile?.length
        ? svg('path', {
          d: toPath(boreProfile), fill: 'var(--panel)', stroke,
          'stroke-width': strokeWidth * 0.8, 'stroke-linejoin': 'round',
        })
        : svg('circle', {
          r: boreRadius(geometry), fill: 'var(--panel)', stroke, 'stroke-width': strokeWidth * 0.8,
        }));
    }
  }

  if (showPitch) {
    group.appendChild(svg('circle', {
      r: geometry.r, fill: 'none', stroke: 'var(--accent)', 'stroke-width': strokeWidth * 0.9,
      'stroke-dasharray': `${(geometry.m * 1.6).toFixed(2)} ${(geometry.m * 1.1).toFixed(2)}`,
    }));
  }

  // One tooth marked. Without it a spinning 60-tooth gear looks entirely still.
  if (showMark) {
    const from = Math.min(geometry.rf, geometry.ra);
    const to = Math.max(geometry.rf, geometry.ra);
    group.appendChild(svg('path', {
      d: `M ${from.toFixed(3)} 0 L ${to.toFixed(3)} 0`,
      stroke: 'var(--accent-strong)', 'stroke-width': strokeWidth * 1.8, 'stroke-linecap': 'round',
    }));
  }
  return group;
}

/* ------------------------------------------------------------ overlays -- */

/**
 * A curved arrow showing which way a shaft turns.
 *
 * An arrowhead is barb → apex → barb, with the apex exactly on the tip of the
 * arc and the barbs trailing back along it. Drawn any other way it reads as
 * pointing backwards. See references/pitfalls.md #6.
 *
 * Drawn **anticlockwise** by default, because a positive speed turns
 * anticlockwise on screen — see `turnsClockwise` in js/format.js, which is the
 * one place that convention is decided. Mirroring the group reverses it, which
 * is how `apply` switches direction without rebuilding anything.
 */
export function directionArrow(radius, { colour = 'var(--text-dim)', width = 1.3, clockwise = false } = {}) {
  const group = svg('g', { class: 'direction' });
  const r = Math.max(4, radius);

  // Screen coordinates: y points down, so *increasing* angle sweeps clockwise.
  // The head goes at whichever end the travel actually finishes at, and the
  // barbs are built from that travel direction rather than assumed — drawing
  // the arc one way and the head the other is what makes an arrow read
  // backwards. See references/pitfalls.md #6.
  const from = clockwise ? -2.2 : -0.5;
  const to = clockwise ? -0.5 : -2.2;
  const point = (a) => [r * Math.cos(a), r * Math.sin(a)];
  const [x0, y0] = point(from);
  const [x1, y1] = point(to);

  group.appendChild(svg('path', {
    d: `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 ${clockwise ? 1 : 0} ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    fill: 'none', stroke: colour, 'stroke-width': width, 'stroke-linecap': 'round',
  }));

  // Tangent at the tip, pointing the way of travel; barbs trail back from it.
  const sense = clockwise ? 1 : -1;
  const ux = sense * -Math.sin(to);
  const uy = sense * Math.cos(to);
  const size = Math.max(2.4, r * 0.3);
  const barb = (turn) => [
    x1 - size * (ux * Math.cos(turn) - uy * Math.sin(turn)),
    y1 - size * (ux * Math.sin(turn) + uy * Math.cos(turn)),
  ];
  const [bx1, by1] = barb(0.42);
  const [bx2, by2] = barb(-0.42);
  group.appendChild(svg('path', {
    d: `M ${bx1.toFixed(2)} ${by1.toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)} L ${bx2.toFixed(2)} ${by2.toFixed(2)}`,
    fill: 'none', stroke: colour, 'stroke-width': width, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }));
  return group;
}

/**
 * A belt as its two external tangent lines.
 * The tangent touches both pulleys at the same angle, α ± acos((r₁ − r₂)/d),
 * which is why a belt around unequal pulleys is not simply two parallel lines.
 */
export function beltPath(ax, ay, ar, bx, by, br) {
  const dx = bx - ax;
  const dy = by - ay;
  const distance = Math.hypot(dx, dy);
  if (!(distance > Math.abs(ar - br))) return '';
  const alpha = Math.atan2(dy, dx);
  const beta = Math.acos(Math.max(-1, Math.min(1, (ar - br) / distance)));

  const segments = [];
  for (const side of [1, -1]) {
    const a = alpha + side * beta;
    const p1 = [ax + ar * Math.cos(a), ay + ar * Math.sin(a)];
    const p2 = [bx + br * Math.cos(a), by + br * Math.sin(a)];
    segments.push(`M ${p1[0].toFixed(2)} ${p1[1].toFixed(2)} L ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`);
  }
  return segments.join(' ');
}

/** A scale bar, so a drawing that has been fitted still states its real size. */
export function scaleBar(pxPerMm, { x = 0, y = 0 } = {}) {
  const targets = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  const wanted = 90 / pxPerMm;
  const mm = targets.reduce((best, t) => (Math.abs(t - wanted) < Math.abs(best - wanted) ? t : best), targets[0]);
  const width = mm * pxPerMm;

  const group = svg('g', { class: 'scale-bar', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` });
  group.appendChild(svg('path', {
    d: `M 0 0 L 0 6 M 0 3 L ${width.toFixed(2)} 3 M ${width.toFixed(2)} 0 L ${width.toFixed(2)} 6`,
    stroke: 'var(--text-faint)', 'stroke-width': 1, fill: 'none',
  }));
  group.appendChild(svg('text', {
    x: width / 2, y: 17, 'text-anchor': 'middle', 'font-size': 10,
    fill: 'var(--text-faint)', 'font-family': 'var(--font)',
  }, `${mm} mm`));
  return group;
}

/* -------------------------------------------------------- the palette --- */

/** Fill tint by axial plane; outline colour by what the shaft is doing. */
export const planeFill = (plane) => `var(--plane-${((plane % 3) + 3) % 3})`;

export function strokeFor({ selected, driven, grounded }) {
  if (selected) return { stroke: 'var(--accent-strong)', width: 2 };
  if (grounded) return { stroke: 'var(--warn)', width: 1.6 };
  if (driven) return { stroke: 'var(--ok)', width: 1.6 };
  return { stroke: 'var(--border-strong)', width: 1 };
}

/* ------------------------------------------------------- a single gear -- */

/**
 * One gear on its own, with its reference circles — the drawing for the
 * single-gear tool.
 *
 * The caption is a full-width line centred under the drawing, never text hung
 * off the side of the gear: a label of unpredictable length run leftwards ends
 * up outside the canvas and vanishes from the export, even though it still
 * paints on screen. See references/pitfalls.md #4.
 */
export function renderSingleGear(geometry, {
  width = 520, showCircles = true, caption = '', boreProfile = null,
} = {}) {
  const reach = geometry.internal ? rimRadius(geometry) : geometry.ra;
  const margin = 24;
  const captionRoom = caption ? 24 : 0;
  const scale = Math.max(0.3, Math.min(7, (width - margin * 2) / (reach * 2)));
  const size = reach * 2 * scale + margin * 2;

  const root = svg('svg', {
    viewBox: `0 0 ${size.toFixed(1)} ${(size + captionRoom).toFixed(1)}`,
    class: 'gear-svg', role: 'img',
    'aria-label': `${geometry.z} tooth gear, module ${geometry.m}`,
  });

  const centre = size / 2;
  const scene = svg('g', { transform: `translate(${centre.toFixed(2)} ${centre.toFixed(2)}) scale(${scale.toFixed(5)})` });
  scene.appendChild(gearGroup(geometry, {
    strokeWidth: 1 / scale, steps: 18, showPitch: false, boreProfile,
  }));

  if (showCircles) {
    const ring = (r, colour, dashed) => svg('circle', {
      r, fill: 'none', stroke: colour, 'stroke-width': 1 / scale,
      'stroke-dasharray': dashed ? `${(4 / scale).toFixed(3)} ${(3 / scale).toFixed(3)}` : null,
    });
    scene.appendChild(ring(geometry.r, 'var(--accent-strong)', true));
    scene.appendChild(ring(geometry.rb, 'var(--warn)', true));
  }
  root.appendChild(scene);

  if (caption) {
    root.appendChild(svg('text', {
      x: size / 2, y: size + 15, 'text-anchor': 'middle', 'font-size': 12,
      fill: 'var(--text-dim)', 'font-family': 'var(--font)',
    }, caption));
  }
  root.appendChild(scaleBar(scale, { x: 10, y: size - 26 }));
  return root;
}

/* ----------------------------------------------------------- the train -- */

/** How far a concentric member's label sits outside the ring, in pixels. */
export const CONCENTRIC_LABEL_GAP = 16;

const STAGE_WIDTH = 860;
const STAGE_MIN_WIDTH = 380;
const MARGIN = 34;

/**
 * The whole train, built once.
 *
 * Returns the SVG plus `apply(phases, result)`, which rewrites only what
 * changes with time: each gear's transform, each arrow's direction, each speed
 * label. Nothing is regenerated per frame.
 */
export function buildTrainScene(model, layout, result, {
  zoom = 1, selectedId = null, showPitch = true, showLabels = true, steps = 10,
} = {}) {
  const { bounds } = layout;
  const contentWidth = Math.max(bounds.width, 1);
  const contentHeight = Math.max(bounds.height, 1);

  // Fit to the stage, then clamp. A lone 10 mm pinion should not be blown up to
  // fill an 860 px panel, and a 900 mm train should not shrink to nothing.
  const fit = Math.min(
    (STAGE_WIDTH - MARGIN * 2) / contentWidth,
    (STAGE_WIDTH * 0.6 - MARGIN * 2) / contentHeight,
  );
  const scale = Math.max(0.25, Math.min(9, fit)) * zoom;

  // A planetary set hangs two labels outside its rim, so it needs the room.
  const labelPad = showLabels && model.nodes.some((n) => n.kind === 'planetary')
    ? CONCENTRIC_LABEL_GAP + 20
    : 0;

  const width = Math.max(STAGE_MIN_WIDTH, contentWidth * scale + MARGIN * 2);
  const height = contentHeight * scale + MARGIN * 2 + 16 + labelPad * 2;

  const root = svg('svg', {
    viewBox: `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`,
    class: 'train-svg', role: 'img', 'aria-label': 'Gear train',
  });

  const offsetX = MARGIN + (width - MARGIN * 2 - contentWidth * scale) / 2;
  const px = (x) => offsetX + (x - bounds.minX) * scale;
  const py = (y) => MARGIN + labelPad + (bounds.maxY - y) * scale;

  const belts = svg('g', { class: 'belts' });
  const stack = svg('g', { class: 'planes' });
  const overlay = svg('g', { class: 'overlay' });
  root.append(belts, stack, overlay);

  const drives = model.drives || {};
  const grounds = new Set(model.grounds || []);
  const parts = [];

  // Lower planes first, so a compound stack reads as a stack.
  const ordered = [...model.nodes].sort(
    (a, b) => (layout.planes[a.id] ?? 0) - (layout.planes[b.id] ?? 0),
  );

  for (const node of ordered) {
    const position = layout.positions[node.id];
    if (!position) continue;

    if (node.kind === 'planetary') {
      parts.push(...planetaryParts(model, node, layout, {
        px, py, scale, plane: layout.planes[node.id] ?? 0, selectedId, showPitch, steps, drives, grounds,
      }, stack));
      continue;
    }

    const geometry = geometryOf(model, node);
    const look = strokeFor({
      selected: node.id === selectedId,
      driven: drives[node.id] !== undefined,
      grounded: grounds.has(node.id),
    });
    const holder = svg('g', { class: 'gear-holder', 'data-node': node.id, 'data-body': node.id });
    holder.appendChild(gearGroup(geometry, {
      fill: planeFill(layout.planes[node.id] ?? 0),
      stroke: look.stroke,
      strokeWidth: look.width / scale,
      halo: (layout.planes[node.id] ?? 0) > 0,
      steps, showPitch,
    }));
    stack.appendChild(holder);

    parts.push({
      nodeId: node.id,
      bodyId: node.id,
      angleKey: node.id,
      holder,
      cx: px(position.x),
      cy: py(position.y),
      radius: (geometry.internal ? geometry.r : geometry.ra) * scale,
      label: node.name || node.id,
    });

    if (node.link === 'belt') {
      const parent = nodeById(model, node.parent);
      const anchor = parent && layout.positions[parent.id];
      if (anchor) {
        belts.appendChild(svg('path', {
          d: beltPath(
            px(anchor.x), py(anchor.y), geometryOf(model, parent).r * scale,
            px(position.x), py(position.y), geometry.r * scale,
          ),
          stroke: 'var(--text-faint)', 'stroke-width': 3, fill: 'none',
          'stroke-linecap': 'round', opacity: '0.75',
        }));
      }
    }
  }

  /*
   * Anything coaxial shares a centre, and so would share a label position.
   * Two gears on one shaft are the common case; a planetary set is the extreme
   * one, and it places its own labels outside the rim because stacking three
   * in the middle of a ring gear would be unreadable.
   *
   * Whatever has not already been placed deliberately gets stacked, smallest
   * gear nearest the middle, so the label belongs to the gear you can see.
   */
  if (showLabels) {
    const coaxial = new Map();
    for (const part of parts) {
      if (part.labelOffset || !part.label) continue;
      const key = `${Math.round(part.cx)}:${Math.round(part.cy)}`;
      if (!coaxial.has(key)) coaxial.set(key, []);
      coaxial.get(key).push(part);
    }
    for (const group of coaxial.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => a.radius - b.radius);
      // A label is two lines — the name at −3 and the speed at +10 — so a pair
      // stands about 28px tall. The step has to clear that, not merely differ.
      const step = 34;
      const first = -((group.length - 1) * step) / 2;
      group.forEach((part, index) => { part.labelOffset = { x: 0, y: first + index * step }; });
    }
  }

  // Direction arrows and labels sit in an overlay, because they must stay
  // upright while the gear under them turns.
  for (const part of parts) {
    part.arrow = directionArrow(Math.max(6, part.radius * 0.46));
    part.arrowHolder = svg('g', {
      class: 'gear-mark',
      transform: `translate(${part.cx.toFixed(2)} ${part.cy.toFixed(2)})`,
    });
    part.arrowHolder.appendChild(part.arrow);

    if (showLabels && part.label) {
      const text = (attrs, content) => svg('text', {
        'text-anchor': 'middle', 'font-family': 'var(--font)', 'paint-order': 'stroke',
        stroke: 'var(--panel)', 'stroke-width': 3.5, 'stroke-linejoin': 'round', ...attrs,
      }, content);
      // Offsets live on the text rather than on the holder, so a planet that
      // orbits still carries its label with it.
      const dx = part.labelOffset?.x ?? 0;
      const dy = part.labelOffset?.y ?? 0;
      part.arrowHolder.appendChild(text({
        x: dx, y: dy - 3, 'font-size': 11, 'font-weight': '600', fill: 'var(--text)',
      }, part.label));
      part.speedText = text({
        x: dx, y: dy + 10, 'font-size': 10.5, fill: 'var(--text-dim)', 'font-family': 'var(--font-mono)',
      }, '');
      part.arrowHolder.appendChild(part.speedText);
    }
    overlay.appendChild(part.arrowHolder);
  }

  root.appendChild(scaleBar(scale, { x: 10, y: height - 22 }));

  const apply = (phases, solved) => {
    for (const part of parts) {
      const angle = part.orbit
        ? phases.planets?.[part.setId]?.[part.planetIndex] ?? 0
        : phases.angles?.[part.angleKey] ?? 0;

      if (part.orbit) {
        const theta = phases.orbits?.[part.setId]?.[part.planetIndex] ?? 0;
        const centre = layout.positions[part.setId];
        part.cx = px(centre.x + part.orbitRadius * Math.cos(theta));
        part.cy = py(centre.y + part.orbitRadius * Math.sin(theta));
        part.arrowHolder.setAttribute('transform', `translate(${part.cx.toFixed(2)} ${part.cy.toFixed(2)})`);
      }
      part.holder.setAttribute(
        'transform',
        `translate(${part.cx.toFixed(2)} ${part.cy.toFixed(2)}) scale(${scale.toFixed(5)}) rotate(${screenRotationDeg(angle).toFixed(3)})`,
      );

      const rpm = solved?.speeds?.[part.bodyId];
      const spinning = Number.isFinite(rpm) && Math.abs(rpm) > 1e-9;
      part.arrow.setAttribute('opacity', spinning ? '0.9' : '0.2');
      // The arrow is drawn anticlockwise, which is what a positive speed does.
      // Mirroring it in x gives the clockwise one.
      part.arrow.setAttribute('transform', spinning && turnsClockwise(rpm) ? 'scale(-1 1)' : 'scale(1 1)');
      if (part.speedText) {
        part.speedText.textContent = Number.isFinite(rpm) ? `${fmtNum(rpm, 4)} rpm` : '— rpm';
      }
    }
  };

  apply({ angles: {}, planets: {}, orbits: {} }, result);

  // The inverse mapping, so a pointer landing on the drawing can be turned back
  // into millimetres — which is what the drag handler needs to work out what
  // angle a gear has been swung to.
  const unpx = (screenX) => (screenX - offsetX) / scale + bounds.minX;
  const unpy = (screenY) => bounds.maxY - (screenY - MARGIN) / scale;

  return { svg: root, apply, scale, width, height, parts, px, py, unpx, unpy };
}

/** The pieces of one planetary set: ring, carrier arms, planets and sun. */
function planetaryParts(model, node, layout, ctx, host) {
  const { px, py, scale, plane, selectedId, showPitch, steps, drives, grounds } = ctx;
  const spec = planetarySpec(model, node);
  const centre = layout.positions[node.id];
  const name = node.name || node.id;
  const selected = node.id === selectedId;
  const parts = [];

  const add = (geometry, bodyId, extra) => {
    const look = strokeFor({
      selected,
      driven: drives[bodyId] !== undefined,
      grounded: grounds.has(bodyId),
    });
    const holder = svg('g', { class: 'gear-holder', 'data-node': node.id, 'data-body': bodyId });
    holder.appendChild(gearGroup(geometry, {
      fill: planeFill(plane + (extra.planetIndex === undefined ? 0 : 1)),
      stroke: look.stroke,
      strokeWidth: look.width / scale,
      halo: extra.planetIndex !== undefined,
      steps, showPitch,
    }));
    host.appendChild(holder);
    parts.push({
      nodeId: node.id, bodyId, holder, angleKey: bodyId,
      cx: px(centre.x), cy: py(centre.y),
      radius: (geometry.internal ? geometry.r : geometry.ra) * scale,
      ...extra,
    });
    return holder;
  };

  /*
   * The sun, the ring and the carrier are all on one axis, so a label at each
   * part's own centre puts three of them in exactly the same place. They are
   * pushed clear along y instead: the ring above the rim, the carrier below it,
   * the sun left in the middle where there is nothing else. The offsets are in
   * screen pixels because that is what keeps them legible at any zoom, and the
   * scene adds matching padding so nothing lands outside the viewBox.
   */
  const ringGeometry = gearGeometry({ m: spec.m, z: spec.zRing, alphaDeg: spec.alphaDeg, internal: true });
  const rimPx = rimRadius(ringGeometry) * scale;

  add(ringGeometry, `${node.id}.ring`, {
    label: `${name} ring`,
    labelOffset: { x: 0, y: -(rimPx + CONCENTRIC_LABEL_GAP) },
  });

  // The carrier: arms from the axis out to each planet, drawn in local
  // millimetres so the same translate-scale-rotate animates them.
  const arms = svg('g', { class: 'carrier', 'data-node': node.id, 'data-body': `${node.id}.carrier` });
  const armWidth = Math.max(1.2, spec.m * 0.85);
  const held = grounds.has(`${node.id}.carrier`);
  for (let i = 0; i < Math.max(1, spec.planets); i += 1) {
    const a = (i * 2 * Math.PI) / Math.max(1, spec.planets);
    arms.appendChild(svg('line', {
      x1: 0, y1: 0,
      x2: (spec.carrierR * Math.cos(a)).toFixed(3),
      y2: (-spec.carrierR * Math.sin(a)).toFixed(3),
      stroke: held ? 'var(--warn)' : 'var(--text-faint)',
      'stroke-width': armWidth, 'stroke-linecap': 'round', opacity: '0.5',
    }));
  }
  arms.appendChild(svg('circle', { r: armWidth * 1.2, fill: held ? 'var(--warn)' : 'var(--text-faint)', opacity: '0.5' }));
  host.appendChild(arms);
  parts.push({
    nodeId: node.id, bodyId: `${node.id}.carrier`, angleKey: `${node.id}.carrier`,
    holder: arms, cx: px(centre.x), cy: py(centre.y),
    radius: spec.carrierR * scale, label: `${name} carrier`,
    labelOffset: { x: 0, y: rimPx + CONCENTRIC_LABEL_GAP + 4 },
  });

  const planetGeometry = gearGeometry({ m: spec.m, z: spec.zPlanet, alphaDeg: spec.alphaDeg });
  (layout.planets[node.id] || []).forEach((planet, index) => {
    const holder = add(planetGeometry, `${node.id}.planet`, {
      label: index === 0 ? `${name} planet` : '',
      setId: node.id,
      planetIndex: index,
      orbit: true,
      orbitRadius: spec.carrierR,
      angleKey: null,
    });
    holder.setAttribute('data-planet', String(index));
    const part = parts[parts.length - 1];
    part.cx = px(planet.x);
    part.cy = py(planet.y);
  });

  add(
    gearGeometry({ m: spec.m, z: spec.zSun, alphaDeg: spec.alphaDeg }),
    `${node.id}.sun`,
    { label: `${name} sun` },
  );
  return parts;
}

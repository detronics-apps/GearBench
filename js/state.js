/**
 * One state object, three ways of keeping it.
 *
 * | Session persistence | localStorage        | stays on this device        |
 * | Sharing             | the URL fragment    | never sent to a server       |
 * | Save / open         | a local JSON file   | a plain file on your disk    |
 *
 * The fragment is the important one: everything after the `#` is handled by the
 * browser alone and is never transmitted with the request, which is what makes
 * "share this exact gearbox" a private operation.
 *
 * Everything arriving from any of those three routes is older than the code
 * reading it, so it all goes through `migrate` — and nothing is merged with a
 * bare spread, because a key that is present but `undefined` will happily
 * overwrite a perfectly good default. See references/pitfalls.md #8.
 */

import { createTrain, migrateTrain } from './train.js';

const KEY = 'gear-bench';
export const STATE_VERSION = 2;

export const TOOLS = ['train', 'planetary', 'gear', 'ratio'];

export const defaults = () => ({
  version: STATE_VERSION,
  tool: 'train',
  theme: 'system',
  selectedId: 'g1',

  train: createTrain(),

  planetary: {
    m: 2,
    zSun: 24,
    zPlanet: 18,
    planets: 3,
    fixed: 'ring',
    input: 'sun',
    inputRpm: 10,
    inputTorque: 5,
  },

  gear: {
    m: 2,
    z: 24,
    alphaDeg: 20,
    x: 0,
    internal: false,
    bore: 10,
    boreType: 'plain',
    boreSlotWidth: 0,      // 0 means "use the standard for this bore"
    boreSlotDepth: 0,
    boreCount: 0,
    boreMajor: 0,
    series: 'I',
  },

  ratio: {
    // 12.5:1 from a single pair would need a 150-tooth wheel off a 12-tooth
    // pinion, so the honest default is the two-stage search.
    target: 12.5,
    mode: 'compound',
    minTeeth: 12,
    maxTeeth: 90,
    planets: 3,
  },

  view: {
    zoom: 1,
    showPitch: true,
    showLabels: true,
    animate: true,
    speed: 1,
  },

  // Which sidebar panels are open, keyed `tool:section`. Chrome, not design —
  // but it has to survive a re-render or every edit would spring them all open.
  ui: { sections: {} },
});

export const state = defaults();

const number = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/** Bring any incoming state — old, partial or hostile — up to the current shape. */
export function migrate(incoming) {
  const base = defaults();
  if (!incoming || typeof incoming !== 'object') return base;

  return {
    version: STATE_VERSION,
    tool: oneOf(incoming.tool, TOOLS, base.tool),
    theme: oneOf(incoming.theme, ['system', 'light', 'dark'], base.theme),
    selectedId: typeof incoming.selectedId === 'string' ? incoming.selectedId : base.selectedId,

    train: migrateTrain(incoming.train),

    planetary: {
      m: number(incoming.planetary?.m, base.planetary.m),
      zSun: Math.round(number(incoming.planetary?.zSun, base.planetary.zSun)),
      zPlanet: Math.round(number(incoming.planetary?.zPlanet, base.planetary.zPlanet)),
      planets: Math.round(number(incoming.planetary?.planets, base.planetary.planets)),
      fixed: oneOf(incoming.planetary?.fixed, ['sun', 'ring', 'carrier', 'none'], base.planetary.fixed),
      input: oneOf(incoming.planetary?.input, ['sun', 'ring', 'carrier'], base.planetary.input),
      inputRpm: number(incoming.planetary?.inputRpm, base.planetary.inputRpm),
      inputTorque: number(incoming.planetary?.inputTorque, base.planetary.inputTorque),
    },

    gear: {
      m: number(incoming.gear?.m, base.gear.m),
      z: Math.round(number(incoming.gear?.z, base.gear.z)),
      alphaDeg: number(incoming.gear?.alphaDeg, base.gear.alphaDeg),
      x: number(incoming.gear?.x, base.gear.x),
      internal: bool(incoming.gear?.internal, base.gear.internal),
      bore: number(incoming.gear?.bore, base.gear.bore),
      // Added after v1.2: an older save has none of these, and every one of
      // them means "use the standard", so the defaults are the migration.
      boreType: oneOf(incoming.gear?.boreType, ['plain', 'keyway', 'keyway2', 'spline'], base.gear.boreType),
      boreSlotWidth: Math.max(0, number(incoming.gear?.boreSlotWidth, base.gear.boreSlotWidth)),
      boreSlotDepth: Math.max(0, number(incoming.gear?.boreSlotDepth, base.gear.boreSlotDepth)),
      boreCount: Math.max(0, Math.round(number(incoming.gear?.boreCount, base.gear.boreCount))),
      boreMajor: Math.max(0, number(incoming.gear?.boreMajor, base.gear.boreMajor)),
      series: oneOf(incoming.gear?.series, ['I', 'II', 'any'], base.gear.series),
    },

    ratio: {
      target: number(incoming.ratio?.target, base.ratio.target),
      mode: oneOf(incoming.ratio?.mode, ['single', 'compound', 'planetary'], base.ratio.mode),
      minTeeth: Math.round(number(incoming.ratio?.minTeeth, base.ratio.minTeeth)),
      maxTeeth: Math.round(number(incoming.ratio?.maxTeeth, base.ratio.maxTeeth)),
      planets: Math.round(number(incoming.ratio?.planets, base.ratio.planets)),
    },

    view: {
      zoom: Math.max(0.25, Math.min(4, number(incoming.view?.zoom, base.view.zoom))),
      showPitch: bool(incoming.view?.showPitch, base.view.showPitch),
      showLabels: bool(incoming.view?.showLabels, base.view.showLabels),
      animate: bool(incoming.view?.animate, base.view.animate),
      speed: Math.max(0.05, Math.min(8, number(incoming.view?.speed, base.view.speed))),
    },

    ui: { sections: sectionFlags(incoming.ui?.sections) },
  };
}

/** Only `tool:section -> boolean` survives; anything else in there is noise. */
function sectionFlags(incoming) {
  const out = {};
  if (!incoming || typeof incoming !== 'object') return out;
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof key === 'string' && key.length <= 80 && typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/** Load from localStorage, then let a share link override it. */
export function load() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { stored = null; }

  let shared = null;
  if (typeof location !== 'undefined' && location.hash.length > 1) {
    try { shared = JSON.parse(decodeURIComponent(location.hash.slice(1))); } catch { shared = null; }
  }

  Object.assign(state, migrate(shared || stored));
  return state;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: carry on */ }
}

let pending = null;
/** Writing on every keystroke is wasteful; writing never loses work. */
export function saveSoon() {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => { pending = null; save(); }, 400);
}

/** A link that reopens this exact bench. The fragment never leaves the browser. */
export function shareLink() {
  const base = location.origin + location.pathname;
  return `${base}#${encodeURIComponent(JSON.stringify(state))}`;
}

/** The contents of a saved project file. */
export function projectJson() {
  return JSON.stringify({ app: 'gear-bench', saved: new Date().toISOString(), state }, null, 2);
}

/** Read a project file back, tolerating both the wrapper and a bare state. */
export function loadProject(text) {
  const parsed = JSON.parse(text);
  Object.assign(state, migrate(parsed?.state ?? parsed));
  return state;
}

export function reset() {
  Object.assign(state, defaults());
  return state;
}

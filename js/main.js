/**
 * The app shell: chrome, tool routing, rendering and the animation clock.
 *
 * There is one render path. Any edit calls `update`, which mutates the state
 * object, saves it and re-renders the current tool from scratch — no diffing,
 * no partial updates, nothing that can drift out of step with the state. The
 * only thing that does *not* go through it is the animation, which rewrites a
 * transform per gear per frame and touches nothing else.
 */

import { load, save, saveSoon, state, reset } from './state.js';
import { el, clear, toast, hideTooltip } from './ui/dom.js';
import { capDiagramScale, dualLabel } from './ui/patterns.js';
import { configureSections, levelSwitch } from './ui/widgets.js';
import { copyLink, saveProject, openProject, printSheet } from './ui/export.js';

import * as trainTool from './ui/tools/train.js';
import * as planetaryTool from './ui/tools/planetary.js';
import * as gearTool from './ui/tools/gear.js';
import * as ratioTool from './ui/tools/ratio.js';
import * as guideTool from './ui/tools/guide.js';

/** Bumped on every release. Read it before debugging anything: a stale cache
 *  serving yesterday's build has cost more time here than any actual bug. */
export const APP_VERSION = '1.6.0';

/*
 * Tab order tells the story: build a train, then design a gear for it, then the
 * one arrangement that needs its own tool, then work backwards from a ratio.
 * The guide is last, and separated, because it is about the app rather than
 * part of the job.
 */
const TOOLS = [trainTool, gearTool, planetaryTool, ratioTool, guideTool];

/** A rule is drawn before these tabs, blocking the bar into groups. */
const TAB_GROUP_BREAK = new Set(['guide']);
const byId = Object.fromEntries(TOOLS.map((tool) => [tool.meta.id, tool]));

const dom = {};
let current = null;
let clock = { last: 0, seconds: 0, raf: 0 };

/* ---------------------------------------------------------------- theme -- */

function applyTheme() {
  if (state.theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', state.theme);
}

const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_LABEL = { system: 'Auto', light: 'Light', dark: 'Dark' };
// Monochrome, state-bearing glyphs: the glyph itself reports the current theme
// and takes the palette text colour. Anything depicting an object gets an SVG.
const THEME_GLYPH = { system: '◐', light: '☀', dark: '☾' };

/* ---------------------------------------------------------------- chrome -- */

/** A round icon button, drawn as a line SVG in currentColor so it follows the theme. */
function iconSvg(paths, { size = 18 } = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('width', size);
  node.setAttribute('height', size);
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.8');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    node.appendChild(path);
  }
  return node;
}

/* A side-view cup. Never the emoji: it carries its own off-palette colours. */
const COFFEE_PATHS = [
  'M6.5 8 H15.5 V13 A4.5 4.5 0 0 1 6.5 13 Z',
  'M15.5 9.5 h1.8 a2.6 2.6 0 0 1 0 5.2 h-1.8',
  'M4 19.5 Q 11 21.8 18 19.5',
  'M9.3 5.2 q -1.4 -1.1 0 -2.2 q 1.4 -1.1 0 -2.2',
  'M12.7 5.2 q -1.4 -1.1 0 -2.2 q 1.4 -1.1 0 -2.2',
];

function buildHeader() {
  const themeButton = el('button', {
    class: 'btn btn-icon', type: 'button', id: 'theme-toggle',
    title: `Theme: ${THEME_LABEL[state.theme]} — click to change`,
    'aria-label': `Theme: ${THEME_LABEL[state.theme]} — click to change`,
    on: {
      click: () => update((draft) => {
        draft.theme = THEME_ORDER[(THEME_ORDER.indexOf(draft.theme) + 1) % THEME_ORDER.length];
      }),
    },
  }, el('span', { 'aria-hidden': 'true', text: THEME_GLYPH[state.theme] }));
  dom.themeButton = themeButton;

  const coffee = el('a', {
    class: 'btn btn-icon',
    href: 'https://buymeacoffee.com/detronics',
    target: '_blank',
    rel: 'noopener noreferrer',
    title: 'Buy me a coffee (opens in a new tab)',
    'aria-label': 'Buy me a coffee (opens in a new tab)',
  }, iconSvg(COFFEE_PATHS));

  return el('header', { class: 'app-header' }, [
    el('div', { class: 'brand' }, [
      // The logo is the home link: clicking the brand goes to the site.
      el('a', {
        class: 'brand__home',
        href: 'https://www.detronics.co.za/',
        target: '_blank',
        rel: 'noopener noreferrer',
        title: 'detronics.co.za (opens in a new tab)',
      }, el('img', { class: 'brand__logo', src: 'assets/logo.png', alt: 'Detronics' })),
      el('span', { class: 'brand__sep', 'aria-hidden': 'true' }),
      el('span', { class: 'brand__tool', text: 'Gear Bench' }),
    ]),
    // Only the three things you reach for while working: keep the project,
    // fetch a project, change the theme. Sharing and printing are things you
    // do when you have finished, so they live at the bottom with Reset, where
    // they cannot crowd the wordmark on a phone.
    el('div', { class: 'header-actions' }, [
      el('button', {
        class: 'btn', type: 'button', title: 'Save this bench as a file on your own machine',
        on: { click: () => saveProject('gear-bench') },
      }, dualLabel('Save project', 'Save')),
      el('button', {
        class: 'btn', type: 'button', title: 'Load a saved bench',
        on: { click: () => openProject(() => render()) },
      }, dualLabel('Load project', 'Load')),
      coffee,
      themeButton,
    ]),
  ]);
}

/*
 * The workspace bar: what you are working on, and how much of it you want to
 * see. The detail level belongs here rather than in the sidebar because it
 * governs every panel below it — putting it inside one of those panels would
 * make it look like a setting for that panel.
 */
function buildTabs() {
  dom.tabs = el('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Tools' });
  dom.levels = el('div', { class: 'workspace-bar__levels' });
  return el('div', { class: 'workspace-bar' }, [dom.tabs, dom.levels]);
}

function renderTabs() {
  clear(dom.tabs);
  for (const tool of TOOLS) {
    if (TAB_GROUP_BREAK.has(tool.meta.id)) {
      dom.tabs.appendChild(el('span', { class: 'segmented__sep', 'aria-hidden': 'true' }));
    }
    dom.tabs.appendChild(el('button', {
      class: 'segmented__btn',
      type: 'button',
      role: 'tab',
      'data-field': `tab-${tool.meta.id}`,
      'aria-selected': String(tool.meta.id === state.tool),
      on: { click: () => update((draft) => { draft.tool = tool.meta.id; }) },
    }, [
      el('span', { class: 'tab-label tab-label--long', text: tool.meta.label }),
      el('span', { class: 'tab-label tab-label--short', text: tool.meta.short }),
    ]));
  }

  clear(dom.levels);
  dom.levels.appendChild(levelSwitch(state.ui.level, (level) => update((draft) => {
    draft.ui.level = level;
  })));
}

function buildViewport() {
  dom.stage = el('div', { class: 'viewport__stage', id: 'stage' });
  dom.readout = el('div', { class: 'readout', id: 'readout' });
  dom.banners = el('div', { class: 'banners', id: 'banners' });
  dom.explain = el('div', { class: 'explain-host', id: 'explain' });
  dom.viewport = el('section', { class: 'viewport' },
    [buildTabs(), dom.stage, dom.readout, dom.banners, dom.explain]);
  return dom.viewport;
}

function buildFooter() {
  return el('footer', { class: 'app-footer' }, [
    el('span', { text: 'Everything runs in your browser. Nothing is uploaded, and the share link keeps its data in the URL fragment, which is never sent to a server.' }),
    el('nav', {}, [
      el('button', {
        class: 'btn btn-sm', type: 'button', text: 'Share link',
        title: 'Copy a link that reopens this exact bench',
        on: { click: () => copyLink() },
      }),
      el('button', {
        class: 'btn btn-sm', type: 'button', text: 'Print',
        title: 'Print the drawing, the numbers and the working',
        on: { click: () => printSheet() },
      }),
      el('button', {
        class: 'btn btn-sm', type: 'button', text: 'Reset',
        title: 'Back to the default bench',
        on: {
          click: () => {
            reset();
            render();
            toast('Reset to the default bench');
          },
        },
      }),
      el('a', {
        class: 'linkish',
        href: 'https://buymeacoffee.com/detronics',
        target: '_blank',
        rel: 'noopener noreferrer',
        text: 'Buy me a coffee',
      }),
      el('span', { class: 'muted', text: `v${APP_VERSION}` }),
    ]),
  ]);
}

/* ---------------------------------------------------------------- render -- */

/**
 * Mutate the state and redraw. Everything the user does comes through here, so
 * there is exactly one place where the state and the screen are reconciled.
 */
export function update(mutate) {
  mutate(state);
  saveSoon();
  render();
}

/*
 * Rebuilding the whole sidebar on every edit is what keeps the state and the
 * screen honest — but it also throws away everything the browser was holding
 * on the user's behalf: where the panel was scrolled to, which field had the
 * caret, where in that field the caret was.
 *
 * Losing those turns the tool into a form you fight. Type a speed four
 * sections down, press Enter, and the panel snaps back to the top with the
 * field you were using now off screen — which reads as "I cannot change this".
 * So they are captured before the teardown and put back afterwards.
 *
 * Controls carry a stable `data-field` name for exactly this.
 */
function captureFocus() {
  const active = document.activeElement;
  const key = active?.dataset?.field;
  return {
    sidebar: dom.sidebar?.scrollTop ?? 0,
    viewport: dom.viewport?.scrollTop ?? 0,
    key: key || null,
    start: key && active.selectionStart != null ? active.selectionStart : null,
    end: key && active.selectionEnd != null ? active.selectionEnd : null,
  };
}

function restoreFocus(snapshot) {
  if (dom.sidebar) dom.sidebar.scrollTop = snapshot.sidebar;
  if (dom.viewport) dom.viewport.scrollTop = snapshot.viewport;
  if (!snapshot.key) return;

  const target = document.querySelector(`[data-field="${CSS.escape(snapshot.key)}"]`);
  if (!target) return;
  target.focus({ preventScroll: true });
  if (snapshot.start != null && target.setSelectionRange) {
    try { target.setSelectionRange(snapshot.start, snapshot.end); } catch { /* not a text field */ }
  }
  // Focusing can nudge a scroll container even with preventScroll, so put the
  // scroll back after, not before.
  if (dom.sidebar) dom.sidebar.scrollTop = snapshot.sidebar;
  if (dom.viewport) dom.viewport.scrollTop = snapshot.viewport;
}

export function render() {
  const snapshot = captureFocus();
  hideTooltip();
  // Applied here rather than only at the toggle, so every route that can change
  // the theme — the button, opening a project, a share link — takes effect.
  applyTheme();
  renderTabs();
  // The guide switches the stage to a reading column; reset it so the next tool
  // gets the drawing canvas back.
  dom.stage.className = 'viewport__stage';
  clear(dom.stage);
  clear(dom.sidebar);
  clear(dom.readout);
  clear(dom.banners);
  clear(dom.explain);

  if (dom.themeButton) {
    const label = `Theme: ${THEME_LABEL[state.theme]} — click to change`;
    dom.themeButton.firstChild.textContent = THEME_GLYPH[state.theme];
    dom.themeButton.title = label;
    dom.themeButton.setAttribute('aria-label', label);
  }

  const tool = byId[state.tool] || TOOLS[0];
  current = tool.render({
    state,
    stage: dom.stage,
    sidebar: dom.sidebar,
    readout: dom.readout,
    banners: dom.banners,
    explainHost: dom.explain,
    update,
  }) || null;

  // A drawing sized to its contents must never be magnified to fill the panel.
  // Called after the stage has been replaced, on every render — pitfalls.md #3.
  capDiagramScale(dom.stage);

  restoreFocus(snapshot);

  // Draw frame zero, so a paused bench still shows its teeth in mesh.
  current?.frame?.(clock.seconds);
  startClock();
}

/* ----------------------------------------------------------------- clock -- */

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function startClock() {
  cancelAnimationFrame(clock.raf);
  if (!current?.frame) return;
  // Someone who has asked their system not to animate things is not asking for
  // an exception here; the drawing still shows the mesh, it just holds still.
  if (!state.view.animate || reducedMotion()) return;

  clock.last = performance.now();
  const step = (now) => {
    const delta = Math.min(0.1, (now - clock.last) / 1000);
    clock.last = now;
    clock.seconds += delta * (state.view.speed || 1);
    current.frame(clock.seconds);
    clock.raf = requestAnimationFrame(step);
  };
  clock.raf = requestAnimationFrame(step);
}

// A tab in the background should not be burning a core on gears nobody is
// watching, and returning to it should not jump the animation forward.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelAnimationFrame(clock.raf);
  else startClock();
});

/* ------------------------------------------------------------------ init -- */

function init() {
  load();
  applyTheme();

  // Which sidebar panels are open is remembered per tool, and remembered
  // between visits — but it is chrome, not design, so changing it never
  // triggers a re-render.
  configureSections({
    get: (id) => state.ui.sections[`${state.tool}:${id}`] ?? true,
    set: (id, open) => { state.ui.sections[`${state.tool}:${id}`] = open; saveSoon(); },
    level: () => state.ui.level,
  });

  dom.sidebar = el('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Controls' });

  // Tools legitimately pass null for a section that does not apply — nothing is
  // selected, or the section is above the current detail level. Native
  // `append()` stringifies that null and drops the word "null" into the panel,
  // so it is filtered once here rather than at every call site.
  const nativeAppend = dom.sidebar.append.bind(dom.sidebar);
  dom.sidebar.append = (...kids) => nativeAppend(...kids.filter(Boolean));
  document.body.append(
    buildHeader(),
    el('main', { class: 'app-main' }, [buildViewport(), dom.sidebar]),
    buildFooter(),
  );

  render();
  save();

  // The share link has done its job once it has been read; leaving it in the
  // address bar means a later reload silently overrides the saved bench.
  if (location.hash.length > 1) history.replaceState(null, '', location.pathname + location.search);
}

init();

// Exposed for the in-browser verification pass: assert on real values rather
// than looking at a screenshot. `tick` drives one animation frame by hand, so
// the mesh can be checked at a given instant without waiting for the clock.
window.GearBench = {
  state, render, update, APP_VERSION,
  tick: (seconds) => current?.frame?.(seconds),
};

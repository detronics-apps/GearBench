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
import { configureSections } from './ui/widgets.js';
import { copyLink, saveProject, openProject, printSheet } from './ui/export.js';

import * as trainTool from './ui/tools/train.js';
import * as planetaryTool from './ui/tools/planetary.js';
import * as gearTool from './ui/tools/gear.js';
import * as ratioTool from './ui/tools/ratio.js';

/** Bumped on every release. Read it before debugging anything: a stale cache
 *  serving yesterday's build has cost more time here than any actual bug. */
export const APP_VERSION = '1.3.0';

const TOOLS = [trainTool, planetaryTool, gearTool, ratioTool];
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
const THEME_LABEL = { system: 'Theme: auto', light: 'Theme: light', dark: 'Theme: dark' };

/* ---------------------------------------------------------------- chrome -- */

function buildHeader() {
  const themeButton = el('button', {
    class: 'btn', type: 'button', id: 'theme-toggle',
    title: 'System, light or dark. Set it explicitly before screen-recording.',
    on: {
      click: () => update((draft) => {
        draft.theme = THEME_ORDER[(THEME_ORDER.indexOf(draft.theme) + 1) % THEME_ORDER.length];
      }),
    },
  }, dualLabel(THEME_LABEL[state.theme], '◐'));
  dom.themeButton = themeButton;

  return el('header', { class: 'app-header' }, [
    el('div', { class: 'brand' }, [
      el('img', { class: 'brand__logo', src: 'assets/logo.png', alt: 'Detronics' }),
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
      themeButton,
    ]),
  ]);
}

function buildTabs() {
  dom.tabs = el('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Tools' });
  return dom.tabs;
}

function renderTabs() {
  clear(dom.tabs);
  for (const tool of TOOLS) {
    dom.tabs.appendChild(el('button', {
      class: 'segmented__btn',
      type: 'button',
      role: 'tab',
      'aria-selected': String(tool.meta.id === state.tool),
      on: { click: () => update((draft) => { draft.tool = tool.meta.id; }) },
    }, [
      el('span', { class: 'tab-label tab-label--long', text: tool.meta.label }),
      el('span', { class: 'tab-label tab-label--short', text: tool.meta.short }),
    ]));
  }
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
  clear(dom.stage);
  clear(dom.sidebar);
  clear(dom.readout);
  clear(dom.banners);
  clear(dom.explain);

  if (dom.themeButton) {
    const [long, short] = dom.themeButton.querySelectorAll('.btn-label');
    if (long) long.textContent = THEME_LABEL[state.theme];
    if (short) short.textContent = state.theme === 'dark' ? '●' : state.theme === 'light' ? '○' : '◐';
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
  });

  dom.sidebar = el('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Controls' });
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

import test from 'node:test';
import assert from 'node:assert/strict';

import { defaults, migrate, STATE_VERSION, TOOLS } from '../js/state.js';
import { solveTrain, nodeById } from '../js/train.js';

/*
 * localStorage, saved project files and share links all outlive the code, so
 * every one of these cases is something a real user could hand the app
 * tomorrow. See references/pitfalls.md #8.
 */

test('the defaults are a complete, working bench', () => {
  const base = defaults();
  assert.equal(base.version, STATE_VERSION);
  assert.ok(TOOLS.includes(base.tool));
  assert.equal(solveTrain(base.train).status, 'unique');
  assert.ok(nodeById(base.train, base.selectedId), 'the selected gear exists');
});

test('defaults() hands out a fresh object every time', () => {
  const a = defaults();
  const b = defaults();
  a.train.nodes.push({ id: 'x', kind: 'gear', z: 10, parent: null, link: null });
  a.view.zoom = 3;
  assert.equal(b.train.nodes.length, defaults().train.nodes.length);
  assert.equal(b.view.zoom, 1);
});

test('garbage in gives a working bench out', () => {
  for (const junk of [null, undefined, 0, 'x', [], true]) {
    const migrated = migrate(junk);
    assert.equal(migrated.version, STATE_VERSION);
    assert.equal(solveTrain(migrated.train).status, 'unique');
  }
});

test('a key that is present but undefined does not wipe out its default', () => {
  // The failure mode `{ ...defaults, ...incoming }` walks straight into.
  const migrated = migrate({
    tool: undefined,
    theme: undefined,
    gear: { m: undefined, z: undefined, series: undefined },
    view: { zoom: undefined, animate: undefined },
    ratio: { target: undefined },
  });
  const base = defaults();
  assert.equal(migrated.tool, base.tool);
  assert.equal(migrated.theme, base.theme);
  assert.equal(migrated.gear.m, base.gear.m);
  assert.equal(migrated.gear.z, base.gear.z);
  assert.equal(migrated.gear.series, base.gear.series);
  assert.equal(migrated.view.zoom, base.view.zoom);
  assert.equal(migrated.view.animate, base.view.animate);
  assert.equal(migrated.ratio.target, base.ratio.target);
});

test('values outside the allowed set fall back rather than sticking', () => {
  const migrated = migrate({
    tool: 'nonsense',
    theme: 'neon',
    gear: { series: 'Z' },
    ratio: { mode: 'quantum' },
    planetary: { fixed: 'moon', input: 'moon' },
  });
  assert.equal(migrated.tool, 'train');
  assert.equal(migrated.theme, 'system');
  assert.equal(migrated.gear.series, 'I');
  assert.equal(migrated.ratio.mode, defaults().ratio.mode);
  assert.equal(migrated.planetary.fixed, 'ring');
  assert.equal(migrated.planetary.input, 'sun');
});

test('numbers are clamped to what the controls can actually reach', () => {
  const wild = migrate({ view: { zoom: 900, speed: -40 } });
  assert.ok(wild.view.zoom <= 4 && wild.view.zoom >= 0.25);
  assert.ok(wild.view.speed >= 0.05 && wild.view.speed <= 8);
});

test('tooth counts come back as whole numbers', () => {
  const migrated = migrate({ gear: { z: 24.7 }, planetary: { zSun: 23.2, planets: 3.9 } });
  assert.equal(migrated.gear.z, 25);
  assert.equal(migrated.planetary.zSun, 23);
  assert.equal(migrated.planetary.planets, 4);
});

test('a share link from an older build still opens', () => {
  // Pasted from a v1 link, not regenerated: no `view`, old link names, no ratio.
  const old = {
    version: 1,
    tool: 'train',
    theme: 'dark',
    selectedId: 'g2',
    train: {
      defaults: { m: 1.5, alphaDeg: 20 },
      nodes: [
        { id: 'g1', kind: 'gear', name: 'In', z: 14, parent: null, link: null },
        { id: 'g2', kind: 'gear', name: 'Out', z: 42, parent: 'g1', link: 'mesh' },
        { id: 'g3', kind: 'gear', name: 'Pinion', z: 14, parent: 'g2', link: 'compound' },
      ],
      drives: { g1: 900 },
    },
  };
  const migrated = migrate(old);
  assert.equal(migrated.theme, 'dark');
  assert.equal(migrated.selectedId, 'g2');
  assert.equal(migrated.train.defaults.m, 1.5);
  assert.equal(nodeById(migrated.train, 'g3').link, 'shaft');
  assert.equal(migrated.train.drives.g1, 900);
  assert.equal(solveTrain(migrated.train).speeds.g3, -300);

  // and the slices the old link had never heard of are simply the defaults
  assert.deepEqual(migrated.view, defaults().view);
  assert.deepEqual(migrated.ratio, defaults().ratio);
});

test('migration is idempotent', () => {
  const once = migrate({ tool: 'gear', gear: { z: 33 }, view: { zoom: 1.5 } });
  assert.deepEqual(migrate(once), once);
});

test('a hostile payload cannot smuggle anything through', () => {
  const migrated = migrate({
    __proto__: { polluted: true },
    evil: '<script>',
    tool: 'gear',
    train: { nodes: [{ id: 'g1', kind: 'gear', z: 'twelve', parent: null }] },
  });
  assert.equal(migrated.evil, undefined, 'unknown keys are dropped, not carried');
  assert.equal({}.polluted, undefined);
  assert.equal(nodeById(migrated.train, 'g1').z, 20, 'an unparseable tooth count falls back');
});

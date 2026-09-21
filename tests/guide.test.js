import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SEARCH_ALIASES, searchText, guideMatches,
  HOWTOS, FAQS, FEATURES, CATEGORIES, howtoText, faqText, featureText,
} from '../js/guide.js';

test('a search in the user\'s words finds an item written in the app\'s words', () => {
  // The whole point of the alias map: nobody searches for "internal mesh".
  const ring = HOWTOS.find((h) => h.id === 'change-direction');
  assert.ok(guideMatches(howtoText(ring), 'backwards'));
  assert.ok(guideMatches(howtoText(ring), 'which way'));

  const cut = HOWTOS.find((h) => h.id === 'cut-a-gear');
  assert.ok(guideMatches(howtoText(cut), 'laser'));
  assert.ok(guideMatches(howtoText(cut), 'cnc'));
  assert.ok(guideMatches(howtoText(cut), 'stop it slipping'), 'keyway aliases');
});

test('every word must match, so a second word narrows', () => {
  const text = 'Export a gear to cut with a keyway';
  assert.ok(guideMatches(text, 'cut'));
  assert.ok(guideMatches(text, 'cut keyway'));
  assert.equal(guideMatches(text, 'cut planetary'), false);
});

test('an empty query matches everything', () => {
  for (const h of HOWTOS) assert.ok(guideMatches(howtoText(h), ''));
  assert.ok(guideMatches('anything', null));
});

test('searchText only folds in aliases for terms actually present', () => {
  assert.ok(searchText('about the bore').includes('shaft hole'));
  assert.equal(searchText('nothing relevant here').includes('shaft hole'), false);
  assert.equal(searchText(''), '');
});

test('the alias map is well formed', () => {
  for (const [term, synonyms] of Object.entries(SEARCH_ALIASES)) {
    assert.equal(term, term.toLowerCase(), `${term} must be lowercase to match`);
    assert.ok(Array.isArray(synonyms) && synonyms.length, term);
    for (const s of synonyms) assert.equal(s, s.toLowerCase(), `${term}: ${s}`);
  }
});

test('every how-to is complete and its steps are instructions', () => {
  const ids = new Set();
  for (const h of HOWTOS) {
    assert.ok(h.id && !ids.has(h.id), `duplicate id ${h.id}`);
    ids.add(h.id);
    assert.ok(h.title && h.category);
    assert.ok(h.steps.length >= 2, `${h.id} needs real steps`);
    for (const s of h.steps) assert.ok(s.length > 15, `${h.id}: "${s}" is too short to act on`);
  }
});

test('every FAQ answers its question', () => {
  for (const f of FAQS) {
    assert.ok(f.q.endsWith('?'), `"${f.q}" is not a question`);
    assert.ok(f.a.length > 60, `"${f.q}" needs a real answer`);
  }
});

test('every feature tile says where it lives', () => {
  for (const f of FEATURES) {
    assert.ok(f.name && f.what);
    assert.ok(f.where, `${f.name} must say where to find it`);
  }
});

test('categories are derived from the how-tos, not restated', () => {
  assert.deepEqual(CATEGORIES, [...new Set(HOWTOS.map((h) => h.category))]);
  for (const h of HOWTOS) assert.ok(CATEGORIES.includes(h.category));
});

test('the searchable blobs cover every field a user might type', () => {
  const h = HOWTOS[0];
  assert.ok(howtoText(h).includes(h.title) && howtoText(h).includes(h.steps[0]));
  assert.ok(faqText(FAQS[0]).includes(FAQS[0].a));
  assert.ok(featureText(FEATURES[0]).includes(FEATURES[0].where));
});

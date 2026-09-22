import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CONTACT, LICENCE, LICENCE_DOC, PRIVACY_DOC, QUICK_START, FOOTER_DOCS,
} from '../js/legal.js';

const licenseFile = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');

test('the licence named in the app is the one in the LICENSE file', () => {
  // The single thing that must never drift: what the footer claims and what
  // ships in the repository have to be the same licence. Checked by its parts,
  // because the file states the base licence and the condition separately.
  for (const part of ['Commons Clause', 'MIT']) {
    assert.ok(licenseFile.includes(part), `LICENSE does not mention ${part}`);
    assert.ok(LICENCE.name.includes(part), `LICENCE.name does not mention ${part}`);
  }
  assert.ok(licenseFile.includes(LICENCE.holder), 'LICENSE names no copyright holder');
  assert.ok(licenseFile.includes(LICENCE.year), 'LICENSE carries no year');
  assert.ok(LICENCE_DOC.sections[0].body.includes(LICENCE.name));
});

test('the licence permits commercial use and forbids only resale', () => {
  // The distinction that matters, and the one that is easy to state backwards:
  // using the tool commercially is fine; selling the tool is not.
  const body = LICENCE_DOC.sections.map((s) => s.body).join(' ');
  assert.match(body, /including commercial work|commercial work/i, 'it must permit commercial use');
  assert.match(body, /selling the tool itself|not allow is selling/i, 'and forbid selling the tool');
  assert.doesNotMatch(body, /noncommercial|non-commercial/i,
    'it must not describe itself as noncommercial — that is a different, wider restriction');

  // Spelt out for the person who will actually ask: what they make is theirs.
  const output = LICENCE_DOC.sections.find((s) => /paid work|drawings|output/i.test(s.heading));
  assert.ok(output, 'it must say what the reader may do with the output');
  assert.match(output.body, /yours/i);
  assert.match(output.body, /sell|invoice/i);
});

test('no markdown leaks into text that is rendered as a text node', () => {
  // The modal sets textContent, so ** or _ would show as literal characters.
  for (const doc of [LICENCE_DOC, PRIVACY_DOC]) {
    for (const section of doc.sections) {
      assert.doesNotMatch(section.body, /\*\*/, `${doc.title} / ${section.heading} contains **`);
    }
  }
});

test('every document section is complete', () => {
  for (const doc of [...FOOTER_DOCS, LICENCE_DOC, PRIVACY_DOC]) {
    assert.ok(doc.title, 'a document needs a title');
    assert.ok(doc.sections.length >= 3, `${doc.title} is too thin`);
    for (const section of doc.sections) {
      assert.ok(section.heading, `${doc.title} has a section with no heading`);
      assert.ok(section.body.length > 40, `${doc.title} / ${section.heading} is too short to be useful`);
    }
  }
});

test('the privacy note covers what an imprint has to', () => {
  const headings = PRIVACY_DOC.sections.map((s) => s.heading.toLowerCase()).join(' ');
  for (const required of ['collects', 'device', 'hosting', 'third parties', 'contact']) {
    assert.ok(headings.includes(required), `no section about ${required}`);
  }
  const contact = PRIVACY_DOC.sections.find((s) => /contact/i.test(s.heading));
  assert.ok(contact.body.includes(CONTACT.email), 'the imprint must give a way to reach a human');
});

test('the privacy claims match what the app actually does', () => {
  const body = PRIVACY_DOC.sections.map((s) => s.body).join(' ');
  assert.match(body, /localStorage/, 'it stores settings, and must say so');
  assert.match(body, /after the #|fragment/i, 'share links put data in the URL fragment');
  assert.match(body, /no analytics|no tracking/i);
  // Server logs exist even for a static site; claiming "no record at all" would
  // be the easy overstatement.
  assert.match(body, /logs/i, 'it must admit the host keeps its own logs');
});

test('the quick start is five or fewer real actions', () => {
  assert.ok(QUICK_START.intro.length > 60);
  assert.ok(QUICK_START.steps.length >= 3 && QUICK_START.steps.length <= 6,
    'more than six steps is a manual, not a quick start');
  for (const step of QUICK_START.steps) {
    assert.ok(step.length > 30, `"${step}" is too vague to follow`);
  }
});

test('the contact block is the one used everywhere', () => {
  assert.match(CONTACT.email, /@/);
  assert.match(CONTACT.site, /^https:\/\//);
  assert.equal(LICENCE.holder, CONTACT.name);
});

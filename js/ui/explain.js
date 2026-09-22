/**
 * The "How this works" panel.
 *
 * Every tool carries one, and it always has the same three parts: the idea in
 * plain language, the formula, and that formula worked through with the values
 * currently on screen. The third part is the one that matters — a formula on
 * its own teaches nobody, and a number on its own teaches nobody, but a number
 * with its own arithmetic shown next to it does.
 *
 * Nothing here formats a number itself: everything arrives already rounded by
 * js/format.js, because a worked example reading `n = 428.571428571 rpm` is
 * worse than no worked example at all.
 */

import { el } from './dom.js';
import { atLeast } from './widgets.js';

/**
 * @param {object} spec
 * @param {string} spec.title    the summary line
 * @param {string|string[]} spec.plain the idea, one or more paragraphs
 * @param {string} spec.formula  the general form
 * @param {string} spec.worked   the same thing with this screen's numbers in it
 * @param {string|string[]} [spec.notes] anything worth knowing afterwards
 * @param {boolean} [spec.open]
 */
export function explain({ title, plain, formula, worked, notes, open = false }) {
  const paragraphs = (value) => (Array.isArray(value) ? value : [value]).filter(Boolean);

  const body = el('div', { class: 'explain__body' }, [
    ...paragraphs(plain).map((text) => el('p', { text })),
    formula ? el('p', { class: 'explain__caption', text: 'The formula' }) : null,
    formula ? el('pre', { class: 'explain__formula', text: formula }) : null,
    worked ? el('p', { class: 'explain__caption', text: 'With the values on screen' }) : null,
    worked ? el('pre', { class: 'explain__worked', text: worked }) : null,
    ...paragraphs(notes).map((text) => el('p', { class: 'muted', text })),
  ]);

  return el('details', { class: 'explain', open: open || null }, [
    el('summary', { text: title }),
    body,
  ]);
}

/** A stack of panels, the first one open. */
/**
 * The teaching panels for a tool, filtered to the detail level.
 *
 * This is where the three levels earn their keep. Simple wants the idea and the
 * formula and nothing else — someone who has just arrived is not helped by how
 * the solver builds its matrix. Advanced adds the working a daily user checks
 * against. Expert is where the app explains *itself*: the equations it forms,
 * the assumptions it makes, and why.
 *
 * A panel with no `level` is Simple, so leaving it off shows it to everyone —
 * the right default for the one idea a tool is about.
 */
export function explainStack(specs) {
  const visible = specs.filter(Boolean).filter((spec) => atLeast(spec.level));
  return visible.map((spec, i) => explain({ ...spec, open: spec.open ?? i === 0 }));
}

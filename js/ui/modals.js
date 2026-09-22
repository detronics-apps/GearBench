/**
 * Modals: the footer documents and the quick start.
 *
 * One at a time, closed by the ×, by Escape, or by clicking the backdrop —
 * three ways out, because a dialog with only one is a trap on a phone.
 */

import { el } from './dom.js';

let open = null;

export function closeModal() {
  if (!open) return;
  open.backdrop.remove();
  document.removeEventListener('keydown', open.onKey);
  const { restoreFocus } = open;
  open = null;
  restoreFocus?.focus?.();
}

/**
 * Show a dialog.
 *
 * @param {string} title
 * @param {Node[]} body
 * @param {object} [options]
 * @param {Node[]} [options.actions] buttons for the footer row
 */
export function openModal(title, body, { actions = [] } = {}) {
  closeModal();
  const restoreFocus = document.activeElement;

  const close = el('button', {
    class: 'modal__close', type: 'button',
    'aria-label': 'Close', title: 'Close', text: '×',
    on: { click: closeModal },
  });

  const panel = el('div', {
    class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
    on: { click: (event) => event.stopPropagation() },
  }, [
    el('div', { class: 'modal__head' }, [
      el('h2', { class: 'modal__title', text: title }),
      close,
    ]),
    el('div', { class: 'modal__body' }, body),
    actions.length ? el('div', { class: 'modal__row' }, actions) : null,
  ]);

  const backdrop = el('div', {
    class: 'modal-backdrop',
    on: { click: closeModal },
  }, panel);

  const onKey = (event) => { if (event.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(backdrop);
  open = { backdrop, onKey, restoreFocus };
  close.focus();
  return backdrop;
}

/** A `{ title, sections }` document from `js/legal.js`, as modal content. */
export const docBody = (doc) => doc.sections.flatMap((section) => [
  el('h3', { class: 'doc__heading', text: section.heading }),
  el('p', { class: 'doc__body', text: section.body }),
]);

/** The quick start: what this is, then the things to actually do. */
export function quickStartBody(quickStart, { extra = null } = {}) {
  return [
    el('p', { class: 'doc__lede', text: quickStart.intro }),
    el('h3', { class: 'doc__heading', text: 'Quick start' }),
    el('ol', { class: 'howto-steps' }, quickStart.steps.map((step) => el('li', { text: step }))),
    quickStart.footnote ? el('p', { class: 'field__hint', text: quickStart.footnote }) : null,
    extra,
  ];
}

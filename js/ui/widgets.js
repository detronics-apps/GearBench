/**
 * The small reusable pieces of interface: sections, numeric fields, stat tiles,
 * banners. Nothing here knows anything about gears — it is the vocabulary the
 * four tools are written in.
 *
 * Two things every control does, because the shell rebuilds the whole sidebar
 * on every edit:
 *
 * - it carries a stable `data-field` name, so the caret can be put back where
 *   it was afterwards;
 * - it commits on `change`, never on `input`. Committing mid-interaction
 *   replaces the very element being used.
 */

import { el, field, infoIcon, select, chips } from './dom.js';
import { parseEng } from '../units.js';
import { fmtNum } from '../format.js';

/**
 * `parseEng` is the shared Detronics number parser — `1500`, `1.5k`, `1k5` all
 * arrive as 1500 — but it was written for component values, which are never
 * negative. Speeds and profile shifts are, so the sign is peeled off here and
 * put back afterwards, and a trailing gear unit is dropped on the way in.
 */
export function parseNumber(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (typeof text !== 'string') return null;
  const cleaned = text.trim().replace(/\s*(rpm|mm|deg|degrees?|teeth|°)\s*$/i, '').trim();
  const negative = /^[-−]/.test(cleaned);
  const value = parseEng(negative ? cleaned.slice(1).trim() : cleaned);
  if (value === null) return null;
  return negative ? -value : value;
}

/* --------------------------------------------------------------- layout -- */

/*
 * Collapsible sections.
 *
 * Whether a section is open has to outlive the re-render, or every edit would
 * spring the whole sidebar back open. It is not part of the design, though, so
 * it lives in a small store the shell installs rather than being threaded
 * through every tool.
 */
let sectionStore = { get: () => true, set: () => {} };

export function configureSections(store) {
  sectionStore = store;
}

/** A titled, collapsible block in the sidebar. */
export function section(title, children, { info = null, actions = null, key = null } = {}) {
  const id = key || title;
  return el('details', {
    class: 'section',
    open: sectionStore.get(id) ? '' : null,
    'data-section': id,
    on: {
      // Recorded, not re-rendered: collapsing a panel is not a change to the
      // design, and rebuilding the sidebar here would fight the animation.
      toggle: (event) => sectionStore.set(id, event.target.open),
    },
  }, [
    el('summary', { class: 'section__title' }, [title, info ? infoIcon(info) : null, actions]),
    el('div', { class: 'section__body' }, Array.isArray(children) ? children : [children]),
  ]);
}

/* --------------------------------------------------------------- fields -- */

/**
 * A number field that accepts what an engineer types.
 *
 * `1500`, `1.5k` and `1 500` all mean the same thing, and refusing two of them
 * is a way of being right and useless at the same time. The value is only
 * pushed upstream when it parses; while it does not, the field says so and
 * keeps what was typed.
 */
export function numberField(label, value, onChange, {
  info, hint, min = -Infinity, max = Infinity, step = null, integer = false, unit = '', digits = 6,
  key = null,
} = {}) {
  const input = el('input', {
    class: 'input',
    type: 'text',
    inputmode: integer ? 'numeric' : 'decimal',
    value: formatFor(value, digits),
    autocomplete: 'off',
    spellcheck: 'false',
    'data-field': key || label,
  });

  const commit = () => {
    const parsed = parseNumber(input.value);
    if (parsed === null || !Number.isFinite(parsed)) {
      input.classList.add('input--invalid');
      return;
    }
    const clamped = Math.min(max, Math.max(min, integer ? Math.round(parsed) : parsed));
    input.classList.remove('input--invalid');
    if (clamped !== parsed) input.value = formatFor(clamped, digits);
    onChange(clamped);
  };

  input.addEventListener('input', () => {
    const parsed = parseNumber(input.value);
    input.classList.toggle('input--invalid', parsed === null || !Number.isFinite(parsed));
  });
  input.addEventListener('change', commit);
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { commit(); return; }
    if (!step) return;
    const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const current = parseNumber(input.value) ?? 0;
    const next = Math.min(max, Math.max(min, current + direction * step * (event.shiftKey ? 10 : 1)));
    input.value = formatFor(next, digits);
    onChange(integer ? Math.round(next) : next);
  });

  return field(unit ? `${label} (${unit})` : label, input, { info, hint });
}

/**
 * A sensible arrow-key step for a speed field.
 *
 * A fixed step cannot serve both ends of the range: 50 rpm is right next to a
 * motor speed and absurd next to 10, where it jumps straight past every value
 * worth trying.
 */
export const rpmStep = (value) => {
  const v = Math.abs(Number(value) || 0);
  if (v >= 1000) return 50;
  if (v >= 200) return 10;
  if (v >= 20) return 5;
  return 1;
};

const formatFor = (value, digits) => (Number.isFinite(Number(value)) ? fmtNum(Number(value), digits) : '');

/**
 * A slider, for anything worth scrubbing rather than typing.
 *
 * The number beside it follows the thumb live, but the value is only committed
 * on release. Committing on every `input` event re-renders the sidebar, which
 * replaces the very element being dragged: the drag dies on the first pixel of
 * movement and the panel jumps back to the top. Live feedback without live
 * commits gets both.
 */
export function sliderField(label, value, onChange, {
  min, max, step = 1, info, format = (v) => v, key = null,
} = {}) {
  const readout = el('span', { class: 'value muted', text: String(format(value)) });
  const input = el('input', {
    type: 'range', min, max, step, value,
    'data-field': key || label,
    on: {
      input: (event) => { readout.textContent = String(format(Number(event.target.value))); },
      change: (event) => onChange(Number(event.target.value)),
    },
  });
  return el('div', { class: 'field' }, [
    el('div', { class: 'field__label' }, [
      label, info ? infoIcon(info) : null,
      el('span', { class: 'stage-tools__spacer' }), readout,
    ]),
    input,
  ]);
}

/** A labelled on/off control. */
export function toggleField(label, value, onChange, { info, key = null } = {}) {
  const input = el('input', {
    type: 'checkbox',
    checked: value || null,
    'data-field': key || label,
    on: { change: (event) => onChange(event.target.checked) },
  });
  return el('label', { class: 'field field--toggle' }, [
    input,
    el('span', { class: 'field__label field__label--inline' }, [label, info ? infoIcon(info) : null]),
  ]);
}

export function selectField(label, options, value, onChange, { info, hint, key = null } = {}) {
  const control = select(options, value, onChange);
  control.dataset.field = key || label;
  return field(label, control, { info, hint });
}

export function chipField(label, options, value, onChange, { info } = {}) {
  return el('div', { class: 'field' }, [
    el('div', { class: 'field__label' }, [label, info ? infoIcon(info) : null]),
    chips(options, value, onChange),
  ]);
}

/* -------------------------------------------------------------- readout -- */

/** A headline number. `note` is where the units and the caveats go. */
export function stat(label, value, { note = '', info = null, accent = false } = {}) {
  return el('div', { class: `stat${accent ? ' stat--accent' : ''}` }, [
    el('div', { class: 'stat__label' }, [label, info ? infoIcon(info) : null]),
    el('div', { class: 'stat__value', text: value }),
    note ? el('div', { class: 'stat__note', text: note }) : null,
  ]);
}

/**
 * A headline number the user can type into.
 *
 * The input speed belongs here rather than only in the sidebar: it is the value
 * people reach for constantly, and hunting for it four sections down a
 * scrolling panel is the difference between a tool and a form.
 */
export function statInput(label, value, onChange, {
  note = '', info = null, unit = '', step = null, min = -Infinity, max = Infinity, key = null,
} = {}) {
  const input = el('input', {
    class: 'input stat__input',
    type: 'text',
    inputmode: 'decimal',
    value: Number.isFinite(Number(value)) ? fmtNum(Number(value), 6) : '',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': label,
    'data-field': key || `stat:${label}`,
  });

  const commit = () => {
    const parsed = parseNumber(input.value);
    if (parsed === null || !Number.isFinite(parsed)) { input.classList.add('input--invalid'); return; }
    input.classList.remove('input--invalid');
    onChange(Math.min(max, Math.max(min, parsed)));
  };
  input.addEventListener('input', () => {
    const parsed = parseNumber(input.value);
    input.classList.toggle('input--invalid', parsed === null || !Number.isFinite(parsed));
  });
  input.addEventListener('change', commit);
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { commit(); return; }
    if (!step) return;
    const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const current = parseNumber(input.value) ?? 0;
    const next = Math.min(max, Math.max(min, current + direction * step * (event.shiftKey ? 10 : 1)));
    input.value = fmtNum(next, 6);
    onChange(next);
  });

  return el('div', { class: 'stat stat--editable' }, [
    el('div', { class: 'stat__label' }, [label, info ? infoIcon(info) : null]),
    el('div', { class: 'stat__field' }, [
      input,
      unit ? el('span', { class: 'stat__unit', text: unit }) : null,
    ]),
    note ? el('div', { class: 'stat__note', text: note }) : null,
  ]);
}

/* -------------------------------------------------------------- banners -- */

const BANNER_MARK = { error: '!', warn: '!', ok: '✓', info: 'i' };
const BANNER_CLASS = { error: 'banner-danger', warn: 'banner-warn', ok: 'banner-ok', info: 'banner-info' };

/**
 * Live warnings rather than validation on submit.
 *
 * A design being edited is allowed to be wrong for a moment; what it must never
 * be is silently wrong.
 */
export function banner(level, text) {
  return el('div', { class: `banner ${BANNER_CLASS[level] || BANNER_CLASS.info}` }, [
    el('span', { class: 'banner__mark', text: BANNER_MARK[level] || 'i' }),
    el('span', { text }),
  ]);
}

export function bannerList(problems, { emptyText = null } = {}) {
  const order = { error: 0, warn: 1, ok: 2, info: 3 };
  const sorted = [...problems].sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9));
  if (!sorted.length && emptyText) return [banner('ok', emptyText)];
  return sorted.map((problem) => banner(problem.level, problem.text));
}

/* --------------------------------------------------------------- tables -- */

/** A plain table. `columns` may mark a cell as numeric so it aligns on the decimal. */
export function table(columns, rows, { onRowClick = null, selectedIndex = -1 } = {}) {
  const head = el('tr', {}, columns.map((column) => el('th', {
    class: column.num ? 'num' : null, text: column.label,
  })));

  const body = rows.map((row, index) => el('tr', {
    class: onRowClick ? 'is-clickable' : null,
    'aria-selected': index === selectedIndex ? 'true' : null,
    on: onRowClick ? { click: () => onRowClick(row, index) } : undefined,
  }, columns.map((column) => el('td', {
    class: column.num ? 'num value' : null,
    text: String(row[column.key] ?? ''),
  }))));

  return el('div', { class: 'table-wrap' }, [
    el('table', { class: 'table' }, [
      el('thead', {}, head),
      el('tbody', {}, body),
    ]),
  ]);
}

/* -------------------------------------------------------------- buttons -- */

export const buttonRow = (buttons) => el('div', { class: 'btn-row' }, buttons);

export function button(label, onClick, {
  primary = false, small = false, danger = false, title = null, pressed = null, key = null,
} = {}) {
  return el('button', {
    class: `btn${primary ? ' btn-primary' : ''}${small ? ' btn-sm' : ''}${danger ? ' btn-danger' : ''}`,
    type: 'button',
    title,
    text: label,
    'aria-pressed': pressed === null ? null : String(pressed),
    'data-field': key,
    on: { click: onClick },
  });
}

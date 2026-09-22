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

import { el, field, infoIcon, select, chips, iconSvg, LOCK_CLOSED, LOCK_OPEN } from './dom.js';
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
let sectionStore = {
  get: () => true,
  set: () => {},
  level: () => 'expert',
  locked: () => false,
  setLocked: () => {},
};

export function configureSections(store) {
  sectionStore = { ...sectionStore, ...store };
}

/*
 * Detail levels.
 *
 * The same tool has to serve someone who has never seen a gear and someone
 * tuning the model, without either getting the wrong app. A level only ever
 * *hides*: the arithmetic is identical at every level, and switching down and
 * back must not change a single number.
 */
export const LEVELS = ['simple', 'advanced', 'expert'];

export const LEVEL_LABEL = {
  simple: 'Simple',
  advanced: 'Advanced',
  expert: 'Expert',
};

export const LEVEL_HINT = {
  simple: 'Just what you need for a right answer.',
  advanced: 'The controls you reach for daily, and the numbers behind the result.',
  expert: 'Everything, including the assumptions the model itself runs on.',
};

/** Is `need` within the level currently on? Used to gate a section or a field. */
export const atLeast = (need) =>
  LEVELS.indexOf(sectionStore.level()) >= LEVELS.indexOf(need || 'simple');

/**
 * Close the other sections in a group when one is opened — unless they are
 * locked open.
 *
 * This is why the accordion is not the native `<details name>` one. Native
 * grouping always closes every sibling, with no way to exempt one, and the
 * common real need is to pin a panel you are working against — the gear list,
 * say — while still cycling through the rest.
 */
function collapseSiblings(group, exceptId) {
  if (!group) return;
  for (const other of document.querySelectorAll(`details.section[data-group="${group}"]`)) {
    if (other.dataset.section === exceptId) continue;
    if (other.dataset.locked === 'true') continue;
    if (other.open) other.open = false;          // fires its own toggle, which records it
  }
}

/**
 * A titled, collapsible block in the sidebar.
 *
 * `group` puts the section in an accordion: opening one closes its siblings, so
 * a single thing is in view at a time. Each section also carries a **lock**,
 * which exempts it from that — pin the panel you are working against and cycle
 * through the others around it.
 *
 * Returns null when the section is above the current detail level, so a caller
 * can list every section unconditionally.
 */
export function section(title, children, {
  info = null, actions = null, key = null, group = null, level = null,
} = {}) {
  if (level && !atLeast(level)) return null;
  const id = key || title;
  const isLocked = !!sectionStore.locked(id);

  const lock = el('button', {
    class: 'section__lock',
    type: 'button',
    'aria-pressed': String(isLocked),
    'data-field': `lock:${id}`,
    title: isLocked
      ? 'Locked open — it will stay open when you open another section'
      : 'Lock this section open',
    'aria-label': isLocked ? `Unlock ${title}` : `Lock ${title} open`,
    on: {
      click: (event) => {
        // Inside a <summary>, so stop it reaching the fold.
        event.preventDefault();
        event.stopPropagation();
        const next = node.dataset.locked !== 'true';
        node.dataset.locked = String(next);
        lock.setAttribute('aria-pressed', String(next));
        lock.replaceChildren(iconSvg(next ? LOCK_CLOSED : LOCK_OPEN, { size: 14, width: 1.9 }));
        lock.title = next
          ? 'Locked open — it will stay open when you open another section'
          : 'Lock this section open';
        lock.setAttribute('aria-label', next ? `Unlock ${title}` : `Lock ${title} open`);
        sectionStore.setLocked(id, next);
      },
    },
  }, iconSvg(isLocked ? LOCK_CLOSED : LOCK_OPEN, { size: 14, width: 1.9 }));

  const node = el('details', {
    class: 'section',
    open: sectionStore.get(id) ? '' : null,
    'data-section': id,
    'data-group': group,
    'data-level': level,
    'data-locked': String(isLocked),
    on: {
      // Recorded, not re-rendered: collapsing a panel is not a change to the
      // design, and rebuilding the sidebar here would fight the animation.
      toggle: (event) => {
        sectionStore.set(id, event.target.open);
        if (event.target.open) collapseSiblings(group, id);
      },
    },
  }, [
    el('summary', { class: 'section__title' }, [
      el('span', { class: 'section__name', text: title }),
      info ? infoIcon(info) : null,
      actions,
      lock,
    ]),
    el('div', { class: 'section__body' }, Array.isArray(children) ? children : [children]),
  ]);
  return node;
}

/**
 * The Simple / Advanced / Expert switch.
 *
 * Sits in the workspace bar beside the tabs, not in a panel: it governs every
 * panel below it, and anything that governs the whole screen has to live above
 * the whole screen. The reason for each level is in its tooltip rather than a
 * line of prose, because the bar has to stay one row.
 */
export function levelSwitch(current, onChange) {
  return el('div', {
    class: 'chipset chipset--modes', role: 'group', 'aria-label': 'Detail level',
  }, LEVELS.map((id) => el('button', {
    class: 'chip', type: 'button',
    'aria-pressed': String(id === current),
    'data-field': `level:${id}`,
    title: LEVEL_HINT[id],
    text: LEVEL_LABEL[id],
    on: { click: () => onChange(id) },
  })));
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
const BANNER_ORDER = { error: 0, warn: 1, ok: 2, info: 3 };

/*
 * Dismissed notifications, by content.
 *
 * These messages are *derived* — recomputed from the model on every render —
 * so "closed" cannot live on the message itself; it has to be remembered
 * against what the message says. Keyed on the text, which gives the behaviour
 * you want for free: acknowledge a warning and it stays gone, but change the
 * design so it says something different and it speaks up again.
 *
 * Deliberately in memory only. A dismissal is "I have read this", not a
 * setting, and an error that survives a reload should get to say so once more.
 */
const dismissed = new Set();

const bannerId = (level, text) => `${level}:${text}`;

/** The × that every notification carries, whatever shape it is drawn in. */
function closeButton(className, onClose) {
  return el('button', {
    class: className,
    type: 'button',
    'aria-label': 'Dismiss this notification',
    title: 'Dismiss',
    text: '×',
    on: { click: (event) => { event.stopPropagation(); onClose(); } },
  });
}

/**
 * Live warnings rather than validation on submit.
 *
 * A design being edited is allowed to be wrong for a moment; what it must never
 * be is silently wrong. Every one of them closes — a notification the reader
 * cannot get rid of stops being information and becomes furniture.
 */
export function banner(level, text, { dismissible = true } = {}) {
  const node = el('div', {
    class: `banner ${BANNER_CLASS[level] || BANNER_CLASS.info}`,
    'data-banner': bannerId(level, text),
  }, [
    el('span', { class: 'banner__mark', 'aria-hidden': 'true', text: BANNER_MARK[level] || 'i' }),
    el('span', { class: 'banner__text', text }),
    dismissible ? closeButton('banner__x', () => {
      dismissed.add(bannerId(level, text));
      node.remove();
    }) : null,
  ]);
  return node;
}

/**
 * Every notification for the current state, as one thing to look at.
 *
 * One message is a banner. **More than one is a group** — a `<details>` that
 * folds them all away behind a single line, because several stacked banners
 * push the actual work off the screen, and the reader wants either all of them
 * or none. Errors sort to the top, so the folded summary always names the worst
 * of what is inside.
 */
export function bannerList(problems, { emptyText = null } = {}) {
  const sorted = [...problems].sort(
    (a, b) => (BANNER_ORDER[a.level] ?? 9) - (BANNER_ORDER[b.level] ?? 9),
  );

  // The all-clear is a notification like any other: it goes through the same
  // list so that closing it also makes it stay closed.
  const all = sorted.length ? sorted
    : (emptyText ? [{ level: 'ok', text: emptyText }] : []);

  // Forget dismissals whose message is no longer being raised, so the same
  // problem occurring again is reported again.
  const present = new Set(all.map((p) => bannerId(p.level, p.text)));
  for (const id of [...dismissed]) if (!present.has(id)) dismissed.delete(id);

  const visible = all.filter((p) => !dismissed.has(bannerId(p.level, p.text)));

  if (!visible.length) return [];
  if (visible.length === 1) return [banner(visible[0].level, visible[0].text)];
  return [noticeGroup(visible)];
}

/** The collapsible form, used as soon as there is more than one. */
function noticeGroup(items) {
  const count = el('span', { class: 'notices__count' });
  const list = el('div', { class: 'notices__list' });

  const worst = items[0].level;
  const group = el('details', {
    class: `notices notices--${worst}`,
    open: (sectionStore.get('notices') ?? true) ? '' : null,
    'data-section': 'notices',
    on: { toggle: (event) => sectionStore.set('notices', event.target.open) },
  }, [
    el('summary', { class: 'notices__summary' }, [
      el('span', { class: 'notices__label', text: 'Notifications' }),
      count,
    ]),
    list,
  ]);

  const retally = () => {
    const rows = [...list.children];
    if (!rows.length) { group.remove(); return; }
    const errors = rows.filter((r) => r.classList.contains('notices__item--error')).length;
    const warns = rows.filter((r) => r.classList.contains('notices__item--warn')).length;
    const parts = [];
    if (errors) parts.push(`${errors} problem${errors === 1 ? '' : 's'}`);
    if (warns) parts.push(`${warns} to check`);
    count.textContent = parts.length ? `${rows.length} — ${parts.join(', ')}` : String(rows.length);
  };

  for (const item of items) {
    const row = el('div', { class: `notices__item notices__item--${item.level}` }, [
      el('span', { class: 'notices__dot', 'aria-hidden': 'true' }),
      el('span', { class: 'notices__text', text: item.text }),
      closeButton('notices__x', () => {
        dismissed.add(bannerId(item.level, item.text));
        row.remove();
        retally();
      }),
    ]);
    list.appendChild(row);
  }
  retally();
  return group;
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

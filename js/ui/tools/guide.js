/**
 * How to use it.
 *
 * The last tab, always present. One search box over everything, because a
 * newcomer does not know the app's words — they search for what they would call
 * the thing. The alias map in `js/guide.js` is that translator; everything here
 * is rendering.
 */

import { el } from '../dom.js';
import { section, stat, atLeast, banner } from '../widgets.js';
import {
  HOWTOS, FAQS, FEATURES, CATEGORIES,
  guideMatches, howtoText, faqText, featureText,
} from '../../guide.js';

export const meta = { id: 'guide', label: 'How to use', short: 'Guide' };

export function render(ctx) {
  const { state, stage, sidebar, readout, banners, explainHost, update } = ctx;
  const query = state.ui.guideQuery || '';
  const category = state.ui.guideCategory || 'all';

  // A plain reading column, not a drawing canvas.
  stage.className = 'viewport__stage viewport__stage--text';

  const howtos = HOWTOS.filter((h) =>
    (category === 'all' || h.category === category) && guideMatches(howtoText(h), query));
  const faqs = FAQS.filter((f) => guideMatches(faqText(f), query));
  const features = FEATURES.filter((f) => guideMatches(featureText(f), query));
  const found = howtos.length + faqs.length + features.length;

  /* -- the search box, above everything ---------------------------------- */

  const search = el('input', {
    class: 'input guide__search',
    type: 'search',
    value: query,
    placeholder: 'Search in your own words — "backwards", "laser cut", "make it slower"',
    'aria-label': 'Search the guide',
    'data-field': 'guide-search',
    autocomplete: 'off',
  });
  // Typing is the whole interaction here, so this one commits live. It is safe
  // because the field is restored by name after the rebuild, caret and all.
  search.addEventListener('input', () => update((draft) => {
    draft.ui.guideQuery = search.value;
  }));

  stage.append(el('div', { class: 'guide' }, [
    el('div', { class: 'guide__searchbar' }, [
      search,
      query ? el('button', {
        class: 'btn btn-sm', type: 'button', text: 'Clear',
        on: { click: () => update((draft) => { draft.ui.guideQuery = ''; }) },
      }) : null,
    ]),
    el('p', {
      class: 'field__hint',
      text: query
        ? `${found} match${found === 1 ? '' : 'es'} for “${query}”.`
        : 'Search everything at once, or read down the page. Nothing here needs the app open.',
    }),

    heading('How do I…', `${howtos.length}`),
    howtos.length
      ? el('div', { class: 'guide__list' }, howtos.map(howtoBlock))
      : el('p', { class: 'muted', text: 'No how-to matches that. Try a plainer word.' }),

    heading('Questions', `${faqs.length}`),
    faqs.length
      ? el('div', { class: 'guide__list' }, faqs.map(faqBlock))
      : el('p', { class: 'muted', text: 'No question matches that.' }),

    heading('Worth knowing about', `${features.length}`),
    features.length
      ? el('div', { class: 'guide__features' }, features.map(featureTile))
      : el('p', { class: 'muted', text: 'Nothing matches that.' }),
  ]));

  /* -- the ideas the app is built on ------------------------------------- */

  readout.append(
    stat('Gears', String(HOWTOS.length + FAQS.length + FEATURES.length), {
      note: 'things explained here',
    }),
    stat('Ratio', 'n₁ / n₂', {
      accent: true,
      note: 'the one idea everything else hangs off',
      info: 'Every mesh trades speed for torque by the ratio of the tooth counts. A reduction is slower and stronger by exactly the same factor — nothing is gained, only exchanged.',
    }),
    stat('Module', 'd / z', {
      note: 'tooth size, in mm',
      info: 'Two gears mesh only if their teeth are the same size. The module is that size, and it is the first thing to match.',
    }),
    stat('Held member', 'sun · ring · carrier',
      { note: 'what makes a planetary set what it is' }),
  );

  /* -- sidebar ----------------------------------------------------------- */

  sidebar.append(

    section('Filter', [
      el('div', { class: 'chipset' }, ['all', ...CATEGORIES].map((id) => el('button', {
        class: 'chip', type: 'button',
        'aria-pressed': String(id === category),
        text: id === 'all' ? 'Everything' : id,
        'data-field': `guide-cat:${id}`,
        on: { click: () => update((draft) => { draft.ui.guideCategory = id; }) },
      }))),
    ], { key: 'guide-filter', group: 'guide' }),

    section('Where things are', [
      el('dl', { class: 'dims' }, [
        ['Gear train', 'build a train, drive it, export it'],
        ['Planetary set', 'sun, planets, ring and carrier'],
        ['Single gear', 'one gear, dimensioned, with a bore'],
        ['Ratio solver', 'work backwards from a ratio'],
      ].flatMap(([tab, what]) => [
        el('dt', { text: tab }),
        el('dd', { text: what }),
      ])),
    ], { key: 'guide-map', group: 'guide' }),

    atLeast('advanced') ? section('Accuracy', [
      el('p', {
        class: 'field__hint',
        text: 'Involute flanks and a 0.38·m tangent root fillet — not the trochoid a hob cuts, a few hundredths of a millimetre different at the root. No backlash allowance is applied. Spline dimensions are the DIN 5463 medium series, indicative only.',
      }),
    ], { key: 'guide-accuracy', group: 'guide', level: 'advanced' }) : null,
  );

  // Through the shared helper, so this one closes like every other notification.
  banners.append(banner('ok', 'Nothing here leaves your browser, and nothing here needs an account.'));

  explainHost.append(el('details', { class: 'panel explain', open: '' }, [
    el('summary', { class: 'explain__summary', text: 'Simple, Advanced and Expert' }),
    el('div', { class: 'explain__body' }, [
      el('p', { text: 'The switch at the top of the panel changes how much is on screen, and nothing else. The arithmetic is identical at every level, and moving between them never changes a number — a hidden field keeps whatever it was set to.' }),
      el('p', { text: 'Simple is enough to get a right answer: teeth, what connects to what, and a speed. Advanced adds the working — positions, centre distances, the view and export controls. Expert exposes the knobs that tune the model itself: profile shift, module overrides and the pressure angle.' }),
      el('p', { text: 'Start Simple. The switch is remembered, so a power user finds it once.' }),
    ]),
  ]));

  return null;
}

const heading = (text, count) => el('h2', { class: 'guide__heading' }, [
  el('span', { text }),
  el('span', { class: 'guide__count', text: count }),
]);

function howtoBlock(howto) {
  return el('details', { class: 'section guide__item', name: 'howto', 'data-section': howto.id }, [
    el('summary', { class: 'section__title' }, [
      el('span', { class: 'guide__cat', text: howto.category }),
      el('span', { text: howto.title }),
    ]),
    el('div', { class: 'section__body' }, [
      el('ol', { class: 'howto-steps' }, howto.steps.map((s) => el('li', { text: s }))),
    ]),
  ]);
}

function faqBlock(faq) {
  return el('details', { class: 'section guide__item', name: 'faq' }, [
    el('summary', { class: 'section__title' }, el('span', { text: faq.q })),
    el('div', { class: 'section__body' }, el('p', { class: 'faq__a', text: faq.a })),
  ]);
}

const featureTile = (feature) => el('div', { class: 'feature' }, [
  el('div', { class: 'feature__name', text: feature.name }),
  el('div', { class: 'feature__where', text: feature.where }),
  el('div', { class: 'feature__what', text: feature.what }),
]);

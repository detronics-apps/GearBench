/**
 * The help content, and the search over it. Pure.
 *
 * A newcomer searches for what *they* would call the thing — "backwards",
 * "make it slower", "cut one" — not what the screen says. The alias map is the
 * translator between the two, and it is the reason the search finds anything.
 */

/** App term → the everyday phrases that mean it. */
export const SEARCH_ALIASES = {
  ratio: ['how much slower', 'speed up', 'slow down', 'gearing', 'reduction', 'step up', 'step down'],
  module: ['tooth size', 'how big', 'size of teeth', 'pitch', 'dp'],
  mesh: ['connect', 'join', 'touch', 'next to', 'engage', 'link'],
  shaft: ['same axle', 'stack', 'on top of', 'compound', 'two gears together'],
  ring: ['internal', 'inside', 'annulus', 'outer gear'],
  planetary: ['epicyclic', 'sun', 'carrier', 'planets', 'hub gear'],
  direction: ['backwards', 'reverse', 'which way', 'clockwise', 'anticlockwise', 'turns the other way'],
  dxf: ['cad', 'cut', 'laser', 'cnc', 'export', 'fusion', 'machine it', '3d print'],
  bore: ['hole', 'shaft hole', 'centre hole', 'mount'],
  keyway: ['key', 'slot', 'grub screw', 'fix to shaft', 'stop it slipping'],
  spline: ['splined', 'many keys', 'sliding gear'],
  torque: ['force', 'strength', 'power', 'stronger', 'pulling power'],
  undercut: ['weak tooth', 'thin root', 'too few teeth'],
  share: ['send', 'link', 'url', 'show someone'],
  drive: ['input', 'motor', 'driven by', 'power it'],
  hold: ['fixed', 'stationary', 'ground', 'bolt it', 'casing'],
};

/**
 * Fold an item's alias phrases into its searchable text, so a query in the
 * user's words matches an item written in the app's words.
 */
export function searchText(text) {
  const low = String(text || '').toLowerCase();
  let extra = '';
  for (const [term, synonyms] of Object.entries(SEARCH_ALIASES)) {
    if (low.includes(term)) extra += ` ${synonyms.join(' ')}`;
  }
  return `${text}${extra}`;
}

/** Every word must appear — "ring ratio" narrows the list, it does not widen it. */
export function guideMatches(text, query) {
  if (!query) return true;
  const hay = searchText(text).toLowerCase();
  return String(query).toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/** One searchable blob per item, so the same query filters every kind at once. */
export const howtoText = (h) => `${h.category} ${h.title} ${h.steps.join(' ')}`;
export const faqText = (f) => `${f.q} ${f.a}`;
export const featureText = (f) => `${f.name} ${f.where} ${f.what}`;

export const HOWTOS = [
  {
    id: 'first-train', title: 'Build a gear train from scratch', category: 'Getting started',
    steps: [
      'Open Gear train. Pick a starting point under "Start from" — Simple train is the shortest one.',
      'Click a gear in the Gears list to select it, then set its Teeth in the Selected panel.',
      'Under Add, choose how the next gear attaches: Meshed, Inside a ring, Same shaft or Toothed belt.',
      'Type the input speed straight into the Input tile under the drawing.',
      'Read the Overall ratio tile. Above 1 is a reduction — slower, and stronger by the same factor.',
    ],
  },
  {
    id: 'change-direction', title: 'Make the output turn the other way', category: 'Gear train',
    steps: [
      'Every external mesh reverses direction, so an odd number of meshes reverses the output and an even number does not.',
      'Add one more gear with Add → Meshed. Its size changes nothing about the ratio if it sits between two others — that is an idler.',
      'Or use Add → Inside a ring, which keeps the direction the same.',
      'Check the Output tile: it names the direction in words.',
    ],
  },
  {
    id: 'big-reduction', title: 'Get a large reduction without a huge gear', category: 'Gear train',
    steps: [
      'One mesh runs out of room past about 7:1 — the wheel gets absurd.',
      'Add a gear with Same shaft to the driven gear. That is a countershaft, and it costs no ratio by itself.',
      'Mesh the next gear onto that one. The two stages multiply: 3:1 then 3:1 is 9:1.',
      'Or use a planetary set, which gets 1 + z_ring/z_sun in line with the input shaft.',
    ],
  },
  {
    id: 'planetary-config', title: 'Choose what to hold in a planetary set', category: 'Planetary',
    steps: [
      'Open Planetary set. The six rows under Configurations are every way of driving it.',
      'Click a row to set it up — it sets which member is held, which is driven and which is the output.',
      'Ring held, sun driven, carrier out is the common reduction: 1 + z_ring/z_sun.',
      'Hold the carrier instead and the output reverses. Nothing else does.',
    ],
  },
  {
    id: 'assembly', title: 'Fix "the planets will not fit"', category: 'Planetary',
    steps: [
      'The banner names the problem: the assembly condition, or planets overlapping.',
      'For assembly: (z_sun + z_ring) must divide exactly by the number of planets. The banner lists the counts that do work.',
      'For overlap: use fewer planets, a smaller planet, or a bigger sun.',
      'Both are checked live — you never have to build it to find out.',
    ],
  },
  {
    id: 'cut-a-gear', title: 'Export a gear to cut or print', category: 'Making it',
    steps: [
      'Open Single gear and set the module and tooth count, or type the pitch diameter you need.',
      'Under Bore and fixing, pick Plain, Keyway, Two keyways or Spline. Key sizes default to the DIN standard for that bore.',
      'Watch the banner: it warns if the keyway would break through into the tooth roots.',
      'Press DXF. It is 1:1 in millimetres, with the profile, bore, pitch circle and centre marks on separate layers.',
    ],
  },
  {
    id: 'whole-train-dxf', title: 'Export the whole train at its real centre distances', category: 'Making it',
    steps: [
      'Open Gear train and build the arrangement you want.',
      'Check Positions and sizes — that table is where every shaft goes, with the driving gear at 0, 0.',
      'Under Export press DXF. Every gear comes out at its true centre distance, so the plate can be drilled from it.',
    ],
  },
  {
    id: 'hit-a-ratio', title: 'Work backwards from a ratio you need', category: 'Getting started',
    steps: [
      'Open Ratio solver and type the ratio into Target ratio.',
      'Choose One pair, Two stages or Planetary under Arrangement.',
      'The Candidates list is real tooth counts, closest first, with how far each one misses by.',
      'Click a row to load it into the Gear train designer.',
    ],
  },
  {
    id: 'share', title: 'Send someone your exact bench', category: 'Getting started',
    steps: [
      'Press Share link in the footer.',
      'The whole design is encoded in the link itself, so nothing is uploaded anywhere.',
      'Or press Save project in the header for a file you keep on your own machine.',
    ],
  },
];

export const FAQS = [
  {
    q: 'Why does the middle gear not change the ratio?',
    a: 'An idler reverses the direction and nothing else. The ratio depends only on the first and last gear in a chain of meshes — the ones between cancel out. Change the idler size and watch the Overall ratio tile stay put.',
  },
  {
    q: 'What is the module, and why do both gears need the same one?',
    a: 'The module is the tooth size: pitch diameter divided by tooth count, in millimetres. Two gears only mesh if their teeth are the same size, so the module must match. It is the gear equivalent of a thread pitch.',
  },
  {
    q: 'The app says my train has degrees of freedom left. What does that mean?',
    a: 'A planetary set couples three shafts, so it needs two of them pinned down before there is a single answer. With nothing held it is a differential, not a gearbox — genuinely free to turn more than one way. Drive or hold one more shaft.',
  },
  {
    q: 'Why is 17 teeth a magic number?',
    a: 'Below about 17 teeth at a 20° pressure angle the cutter carves into the root of the tooth as it forms it — undercut — which makes the tooth weaker exactly where it bends. Profile shift cures it, and the app tells you how much you need.',
  },
  {
    q: 'A positive speed turns anticlockwise. Is that not backwards?',
    a: 'It is a convention, and this one follows maths: x right, y up, positive angles anticlockwise. The drawing renders that faithfully, so a positive speed turns anticlockwise on screen. Every arrow and every word in the app reads it from one place, so they cannot disagree.',
  },
  {
    q: 'How accurate is the DXF?',
    a: 'The flanks are real involutes and the root fillet is a true tangent arc of 0.38·m — the tip radius of a standard hob, not the trochoid a hob actually cuts. The difference is hundredths of a millimetre at the root. No backlash allowance is applied; add your own.',
  },
  {
    q: 'Does anything I type get uploaded?',
    a: 'No. There is no server, no analytics and no request of any kind after the page loads. Share links carry the design in the part of the URL after the #, which browsers never send to a server.',
  },
  {
    q: 'What is the difference between Simple, Advanced and Expert?',
    a: 'Only how much is on screen. The arithmetic is identical at every level, and switching level never changes a number — hidden fields keep whatever they were set to. Simple is enough to get a right answer; Expert exposes the tuning knobs.',
  },
];

export const FEATURES = [
  { name: 'Drag a gear round its parent', where: 'Gear train → the drawing', what: 'The distance is fixed by the tooth counts, so dragging only swings the angle. Hold Shift for free rotation instead of a 5° grid.' },
  { name: 'Drive and Hold on every shaft', where: 'Gear train → Gears', what: 'Drive moves the input to that shaft. Hold bolts it to the casing. A planetary set gets one row per member, which is the whole character of the set.' },
  { name: 'Re-hang a gear on a different parent', where: 'Gear train → Selected → Hangs off', what: 'Re-plumbs the train without rebuilding it. Only legal moves are offered — nothing can hang off itself.' },
  { name: 'Positions and sizes', where: 'Gear train → Positions and sizes', what: 'Every shaft centre in one frame with the driving gear at 0, 0, plus the centre distance to its parent. This is the table you drill a plate from.' },
  { name: 'Set the pitch diameter directly', where: 'Single gear → Pitch diameter', what: 'Type the diameter you need and the module follows from the tooth count. That is how you hit a centre distance you have been given.' },
  { name: 'Keyways and splines', where: 'Single gear → Bore and fixing', what: 'DIN 6885 keys and DIN 5463 splines, defaulting from the bore size. They are real geometry — they turn with the teeth and go out in the DXF.' },
  { name: 'The ratio solver loads into the designer', where: 'Ratio solver → Candidates', what: 'Click any candidate row and it becomes a real train you can keep building on.' },
  { name: 'Every tool explains itself', where: 'under the drawing, "How this works"', what: 'The concept in plain language, the formula, and that formula worked through with the numbers currently on screen.' },
  { name: 'Share link carries the whole design', where: 'footer → Share link', what: 'The bench is encoded in the URL fragment. Nothing is uploaded, and the link reopens exactly what you had.' },
];

export const CATEGORIES = [...new Set(HOWTOS.map((h) => h.category))];

/**
 * Planetary (epicyclic) gearsets. Pure.
 *
 * A planetary set is the one gear arrangement where three shafts share a
 * single mesh, so it has *two* degrees of freedom instead of one. Pin one
 * member down and the other two are related; pin nothing down and it is a
 * differential.
 *
 * Everything below comes from one equation. Stand on the carrier and the set
 * looks like an ordinary train from sun to ring, so relative to the carrier:
 *
 *     (ω_sun − ω_carrier) / (ω_ring − ω_carrier) = −z_ring / z_sun
 *
 * which rearranges to the form used throughout this file:
 *
 *     z_sun·ω_sun + z_ring·ω_ring = (z_sun + z_ring)·ω_carrier
 *
 * The planets do not appear in it at all: they change the *direction* nothing
 * and the *ratio* nothing, they only bridge the gap. Their tooth count sets
 * the geometry — where the ring has to be — not the ratio.
 */

export const MEMBERS = ['sun', 'ring', 'carrier'];

export const MEMBER_LABEL = { sun: 'Sun', ring: 'Ring', carrier: 'Carrier' };

/** z_ring = z_sun + 2·z_planet — the planets have to span the gap exactly. */
export const ringTeeth = (zSun, zPlanet) => zSun + 2 * zPlanet;

/** The planet that fits a given sun and ring. Half-integers do not exist. */
export const planetTeeth = (zSun, zRing) => (zRing - zSun) / 2;

export const sunTeeth = (zRing, zPlanet) => zRing - 2 * zPlanet;

/** Willis' fundamental ratio: what the set looks like from the carrier. */
export const basicRatio = (zSun, zRing) => -zRing / zSun;

/** Distance from the sun's axis to a planet's axis. */
export const carrierRadius = (m, zSun, zPlanet) => (m * (zSun + zPlanet)) / 2;

/**
 * Solve the Willis equation for whichever member was left out.
 * Pass two of `sun`, `ring`, `carrier` as numbers and the third as null.
 */
export function willis({ zSun, zRing, sun = null, ring = null, carrier = null }) {
  const zc = zSun + zRing;
  if (sun === null && ring !== null && carrier !== null) {
    return { sun: (zc * carrier - zRing * ring) / zSun, ring, carrier };
  }
  if (ring === null && sun !== null && carrier !== null) {
    return { sun, ring: (zc * carrier - zSun * sun) / zRing, carrier };
  }
  if (carrier === null && sun !== null && ring !== null) {
    return { sun, ring, carrier: (zSun * sun + zRing * ring) / zc };
  }
  return { sun, ring, carrier };
}

/**
 * How fast a planet spins about its own axis.
 * Seen from the carrier the planet is just an idler on the sun, so its
 * relative speed is −z_sun/z_planet times the sun's; add the carrier back on
 * to get the speed an observer on the casing sees.
 */
export function planetSpeed({ zSun, zPlanet, sun, carrier }) {
  return carrier + (sun - carrier) * (-zSun / zPlanet);
}

/**
 * Can `count` planets be spaced equally around the set?
 *
 * The sun and ring teeth have to divide up evenly between the planets, or the
 * last planet arrives at a tooth where it needs a space. This is the condition
 * that quietly rules out most tooth counts people first try.
 */
export function assemblyCondition(zSun, zRing, count) {
  const total = zSun + zRing;
  const ok = count > 0 && Number.isInteger(count) && total % count === 0;
  return {
    ok,
    total,
    count,
    remainder: ((total % count) + count) % count,
    text: ok
      ? `(${zSun} + ${zRing}) ÷ ${count} = ${total / count}, a whole number, so ${count} planets sit evenly.`
      : `(${zSun} + ${zRing}) ÷ ${count} = ${(total / count).toFixed(3)}. It has to be a whole number, or the last planet meets a tooth where it needs a space.`,
  };
}

/** Planet counts that would assemble, for a given sun and ring. */
export function possiblePlanetCounts(zSun, zRing, max = 8) {
  const total = zSun + zRing;
  const out = [];
  for (let n = 2; n <= max; n += 1) if (total % n === 0) out.push(n);
  return out;
}

/**
 * Do neighbouring planets clear each other?
 * Their centres sit on a circle, so the chord between two adjacent ones has to
 * be longer than a planet's tip diameter — otherwise they collide long before
 * anything turns.
 */
export function neighbourClearance({ m, zSun, zPlanet, count }) {
  const rc = carrierRadius(m, zSun, zPlanet);
  const spacing = 2 * rc * Math.sin(Math.PI / Math.max(2, count));
  const tipDiameter = m * (zPlanet + 2);
  return { spacing, tipDiameter, clearance: spacing - tipDiameter, ok: spacing > tipDiameter };
}

/** Every way of driving a planetary set, with the ratio each one gives. */
export function configurations(zSun, zRing) {
  const rows = [
    { fixed: 'ring', input: 'sun', output: 'carrier', ratio: zSun / (zSun + zRing), name: 'Star reduction' },
    { fixed: 'ring', input: 'carrier', output: 'sun', ratio: (zSun + zRing) / zSun, name: 'Overdrive' },
    { fixed: 'sun', input: 'ring', output: 'carrier', ratio: zRing / (zSun + zRing), name: 'Mild reduction' },
    { fixed: 'sun', input: 'carrier', output: 'ring', ratio: (zSun + zRing) / zRing, name: 'Mild overdrive' },
    { fixed: 'carrier', input: 'sun', output: 'ring', ratio: -zSun / zRing, name: 'Reversing overdrive' },
    { fixed: 'carrier', input: 'ring', output: 'sun', ratio: -zRing / zSun, name: 'Reversing reduction' },
  ];
  return rows.map((row) => ({
    ...row,
    reduction: 1 / row.ratio,
    reverses: row.ratio < 0,
    id: `${row.input}-${row.output}-${row.fixed}`,
  }));
}

/**
 * Torque on each member, in the ratio z_sun : z_ring : −(z_sun + z_ring).
 *
 * The signs are what surprise people: the carrier always takes the opposite
 * sign to the other two, because it has to carry the reaction of both. And
 * with a lossless set the three torques sum to zero whatever the speeds are.
 */
export function torqueSplit({ zSun, zRing, member = 'sun', torque = 1 }) {
  const share = { sun: zSun, ring: zRing, carrier: -(zSun + zRing) };
  const scale = torque / share[member];
  return {
    sun: share.sun * scale,
    ring: share.ring * scale,
    carrier: share.carrier * scale,
  };
}

/**
 * Everything that is wrong with a proposed set, in plain language.
 * Warnings, not exceptions: a design being edited is allowed to be wrong for a
 * moment.
 */
export function planetaryProblems({ m = 1, zSun, zRing, zPlanet, count = 3 }) {
  const problems = [];
  const fitted = planetTeeth(zSun, zRing);

  if (!Number.isInteger(fitted)) {
    problems.push({
      level: 'error',
      text: `The sun and ring differ by ${zRing - zSun} teeth, which is odd. z_ring − z_sun has to be even, because the gap is bridged by two planet radii.`,
    });
  } else if (zPlanet !== undefined && Math.abs(zPlanet - fitted) > 1e-9) {
    problems.push({
      level: 'error',
      text: `A ${zPlanet}-tooth planet does not span the gap. z_ring = z_sun + 2·z_planet needs ${fitted} teeth.`,
    });
  }
  if (zRing <= zSun) {
    problems.push({ level: 'error', text: 'The ring has to have more teeth than the sun — it goes round the outside.' });
  }

  const assembly = assemblyCondition(zSun, zRing, count);
  if (!assembly.ok) {
    const options = possiblePlanetCounts(zSun, zRing);
    problems.push({
      level: 'error',
      text: `${assembly.text}${options.length ? ` With these tooth counts you can have ${options.join(', ')} planets.` : ''}`,
    });
  }

  const planet = Number.isFinite(zPlanet) ? zPlanet : fitted;
  if (Number.isFinite(planet) && planet > 0) {
    const gap = neighbourClearance({ m, zSun, zPlanet: planet, count });
    if (!gap.ok) {
      problems.push({
        level: 'error',
        text: `${count} planets will not fit: their tips are ${(-gap.clearance).toFixed(2)} mm into each other. Use fewer planets, a smaller planet, or a bigger sun.`,
      });
    } else if (gap.clearance < m) {
      problems.push({
        level: 'warn',
        text: `Only ${gap.clearance.toFixed(2)} mm between planet tips. Under about one module there is no room for bearings or a carrier plate.`,
      });
    }
  }
  if (zRing - planet < 10) {
    problems.push({
      level: 'warn',
      text: `The ring has only ${zRing - planet} teeth more than the planet. Below about 10, the planet tip fouls the ring tooth going in.`,
    });
  }
  return problems;
}

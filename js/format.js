/**
 * Display formatting. Pure.
 *
 * Internal values are kept at full precision so repeated arithmetic does not
 * drift; nothing here is allowed to leak that precision into prose. Every
 * number the user reads goes through one of these with an explicit
 * significant-figure count.  See references/pitfalls.md #9.
 */

/** Round to `digits` significant figures. Returns a number, not a string. */
export function sig(value, digits = 4) {
  const x = Number(value);
  if (!Number.isFinite(x) || x === 0) return 0;
  const d = Math.max(1, Math.min(15, Math.trunc(digits)));
  const mag = Math.ceil(Math.log10(Math.abs(x)));
  const factor = 10 ** (d - mag);
  return Math.round(x * factor) / factor;
}

/**
 * A number as a person would write it: significant figures, no exponent for
 * anything of a size that turns up on a workbench, trailing zeros trimmed.
 */
export function fmtNum(value, digits = 4) {
  const x = Number(value);
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';

  const abs = Math.abs(x);
  if (abs >= 1e7 || abs < 1e-4) return sig(x, digits).toExponential(Math.max(0, digits - 1));

  const rounded = sig(x, digits);
  // Enough decimals to carry `digits` significant figures, capped at 6.
  const decimals = Math.max(0, Math.min(6, digits - Math.ceil(Math.log10(Math.abs(rounded)))));
  return trimZeros(rounded.toFixed(decimals));
}

function trimZeros(text) {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/** Greatest common divisor of two non-negative integers. */
export function gcd(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) { [x, y] = [y, x % y]; }
  return x;
}

/**
 * A tooth-count ratio in lowest terms. 40:16 is 5:2 — the reduced pair is what
 * tells you the hunting/non-hunting behaviour, so it is worth showing.
 */
export function reduceRatio(a, b) {
  const g = gcd(a, b) || 1;
  return { a: Math.round(a) / g, b: Math.round(b) / g, divisor: g };
}

/** `3.75 : 1`, or `1 : 3.75` when the drive is an overdrive. */
export function fmtRatio(value, digits = 4) {
  const x = Number(value);
  if (!Number.isFinite(x) || x === 0) return '—';
  const abs = Math.abs(x);
  return abs >= 1 ? `${fmtNum(abs, digits)} : 1` : `1 : ${fmtNum(1 / abs, digits)}`;
}

/** Signed value with an explicit `+`, for anything where direction matters. */
export function fmtSigned(value, digits = 4) {
  const x = Number(value);
  if (!Number.isFinite(x)) return '—';
  if (Math.abs(x) < 10 ** -12) return '0';
  return (x > 0 ? '+' : '−') + fmtNum(Math.abs(x), digits);
}

export const fmtRpm = (value, digits = 4) => `${fmtNum(value, digits)} rpm`;
export const fmtMm = (value, digits = 4) => `${fmtNum(value, digits)} mm`;
export const fmtDeg = (value, digits = 4) => `${fmtNum(value, digits)}°`;
export const fmtNm = (value, digits = 4) => `${fmtNum(value, digits)} N·m`;

/** `+2.13%`, for how far a real tooth count lands from a target ratio. */
export function fmtPct(value, digits = 3) {
  const x = Number(value);
  if (!Number.isFinite(x)) return '—';
  if (Math.abs(x) < 5e-4) return '0%';
  return `${fmtSigned(x, digits)}%`;
}

/**
 * The sign convention for rotation, in one place.
 *
 * The drawing is a faithful rendering of maths coordinates — x right, y up,
 * angles anticlockwise — so a **positive speed turns anticlockwise on screen**.
 * That is what the animation actually does; it follows from the profile
 * generator's coordinate system and the y-flip the renderer applies to reach
 * screen space.
 *
 * Everything that reports a direction — the word in the readout, the curved
 * arrow over each gear — must come from here. When they were derived
 * separately they disagreed with the animation, and with each other.
 */
export const turnsClockwise = (rpm) => Number(rpm) < 0;

/** Clockwise / anticlockwise from a signed speed, as words rather than a sign. */
export function fmtDirection(rpm) {
  const x = Number(rpm);
  if (!Number.isFinite(x) || Math.abs(x) < 1e-9) return 'stationary';
  return turnsClockwise(x) ? 'clockwise' : 'anticlockwise';
}

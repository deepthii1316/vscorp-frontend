/**
 * Excel-style 3-colour scale for conditional formatting of a column of numbers.
 * t=0 (min) → red, t=0.5 (mid) → yellow, t=1 (max) → green. Higher = greener.
 * Returns an inline `background:...;` style, or '' when it can't be computed.
 */

const RED = [248, 105, 107];
const YELLOW = [255, 235, 132];
const GREEN = [99, 190, 123];

/**
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} u
 * @returns {number[]}
 */
function mix(a, b, u) {
  return a.map((x, i) => Math.round(x + (b[i] - x) * u));
}

/**
 * Compute min/max for a set of values (ignoring non-finite ones).
 * @param {number[]} values
 * @returns {{min: number, max: number}}
 */
export function rangeOf(values) {
  const finite = values.filter(v => Number.isFinite(v));
  if (finite.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...finite), max: Math.max(...finite) };
}

/**
 * Background style for a value within [min, max]. `invert` flips direction
 * (so lower = greener) for "lower is better" metrics like markdown / degrowth.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @param {boolean} [invert=false]
 * @returns {string}
 */
export function scaleBg(value, min, max, invert = false) {
  if (!Number.isFinite(value) || max === min) return '';
  let t = (value - min) / (max - min);
  if (invert) t = 1 - t;
  t = Math.max(0, Math.min(1, t));
  const c = t < 0.5 ? mix(RED, YELLOW, t / 0.5) : mix(YELLOW, GREEN, (t - 0.5) / 0.5);
  return `background:rgb(${c[0]},${c[1]},${c[2]});`;
}
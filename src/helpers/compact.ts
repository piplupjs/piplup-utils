/**
 * Creates an array with all falsey values removed. The values `false`, `null`,
 * `0`, `""`, `undefined`, and `NaN` are falsey.
 * @param values The array to compact.
 * @returns Returns the new array of filtered values.
 * @example
 *
 * compact([0, 1, false, 2, '', 3])
 * // => [1, 2, 3]
 */
export function compact<T = unknown>(values: unknown): T[] {
  return (Array.isArray(values) ? values : []).filter(Boolean);
}

// `Object.hasOwn(obj, prop)` takes the object as an argument, unlike
// `Object.prototype.hasOwnProperty`, which takes it as `this`.
const hasOwn: (obj: object, prop: PropertyKey) => boolean =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Object as any).hasOwn ??
  ((obj: object, prop: PropertyKey) => Object.prototype.hasOwnProperty.call(obj, prop));

/**
 * Checks if the given object has a property with the specified key.
 * @param obj - The object to check.
 * @param prop - The property key to check.
 * @returns true if the object has the property, otherwise false.
 */
export function hasOwnProperty<X, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, X[keyof X]> {
  return typeof obj === 'object' && obj !== null && hasOwn(obj, prop);
}

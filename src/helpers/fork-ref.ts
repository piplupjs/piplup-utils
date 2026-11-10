import { setRef } from './set-ref';

/**
 * Creates a function that forwards an instance to multiple refs.
 *
 * This function returns a callback that assigns the provided `instance` to each ref in `refs`.
 * If all refs are `null` or `undefined`, it returns `null`.
 *
 * @param refs - An array of refs to forward the instance to.
 * @returns A function that forwards the instance to each ref, or `null` if all refs are `null`/`undefined`.
 */
export function forkRef<T>(...refs: Array<React.Ref<T> | undefined>) {
  if (refs.every((ref) => ref == null)) {
    return null;
  }

  return (instance: T) =>
    refs.forEach((ref) => {
      setRef(ref, instance);
    });
}

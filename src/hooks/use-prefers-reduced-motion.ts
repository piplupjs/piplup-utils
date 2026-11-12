import type { UseMediaQueryOptions } from './use-media-query';
import { matchesQuery, useMediaQuery } from './use-media-query';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the user asked the OS to reduce motion, read at call time. Use it in effects and
 * callbacks, for example right before starting an animation.
 */
export function prefersReducedMotion(
  options: Pick<UseMediaQueryOptions, 'matchMedia' | 'ssrMatchMedia'> = {},
): boolean {
  return matchesQuery(REDUCED_MOTION_QUERY, options);
}

/**
 * Whether the user asked the OS to reduce motion. Re-renders when the setting changes.
 */
export function usePrefersReducedMotion(options: UseMediaQueryOptions = {}): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY, options);
}

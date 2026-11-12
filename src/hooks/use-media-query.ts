// Adapted from MUI's useMediaQuery:
// https://github.com/mui/material-ui/blob/master/packages/mui-material/src/useMediaQuery/useMediaQuery.ts
// https://github.com/mui/material-ui/blob/master/LICENSE
// The MIT License (MIT)

// Copyright (c) 2014 Call-Em-All

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import * as React from 'react';

export type SsrMatchMedia = (query: string) => { matches: boolean };

export interface UseMediaQueryOptions {
  /**
   * Returned on the server and during hydration, where `window.matchMedia()` is unavailable.
   * @default false
   */
  defaultMatches?: boolean | undefined;
  /**
   * Your own `matchMedia` implementation, for example an iframe's `contentWindow.matchMedia`.
   * Pass a stable reference: a new function on every render resubscribes on every render.
   */
  matchMedia?: typeof window.matchMedia | undefined;
  /**
   * Read the real value on the first client render instead of `defaultMatches`. Use it only when
   * the component never renders on the server, otherwise hydration can mismatch.
   * @default false
   */
  noSsr?: boolean | undefined;
  /**
   * Resolves the query on the server, for example from the request's user agent.
   * @default null
   */
  ssrMatchMedia?: SsrMatchMedia | null | undefined;
}

// Module-level so its identity is stable across renders; a per-render `bind` would make
// useSyncExternalStore unsubscribe and resubscribe on every render.
const browserMatchMedia: typeof window.matchMedia = (query) => window.matchMedia(query);

function hasMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia !== 'undefined';
}

function stripMediaPrefix(query: string): string {
  return query.replace(/^@media( ?)/m, '');
}

const noopUnsubscribe = () => {};
const noopSubscribe = () => noopUnsubscribe;

/**
 * Reads a media query once, at call time. Use it in effects and callbacks, where a hook can't run
 * or the value may have changed since the last render.
 */
export function matchesQuery(
  query: string,
  options: Pick<UseMediaQueryOptions, 'matchMedia' | 'ssrMatchMedia'> = {},
): boolean {
  const { matchMedia: customMatchMedia, ssrMatchMedia = null } = options;
  const normalizedQuery = stripMediaPrefix(query);

  if (typeof window !== 'undefined' && customMatchMedia) {
    return customMatchMedia(normalizedQuery).matches;
  }

  if (hasMatchMedia()) {
    return window.matchMedia(normalizedQuery).matches;
  }

  if (ssrMatchMedia) {
    return ssrMatchMedia(normalizedQuery).matches;
  }

  return false;
}

/**
 * Subscribes to a CSS media query and re-renders when it starts or stops matching.
 *
 * @param query - any valid CSS media query, with or without a leading `@media`
 * @returns `true` while the document matches the query
 */
export function useMediaQuery(query: string, options: UseMediaQueryOptions = {}): boolean {
  const {
    defaultMatches = false,
    matchMedia: customMatchMedia,
    noSsr = false,
    ssrMatchMedia = null,
  } = options;

  const matchMedia = customMatchMedia ?? (hasMatchMedia() ? browserMatchMedia : null);
  const normalizedQuery = stripMediaPrefix(query);

  const getDefaultSnapshot = React.useCallback(() => defaultMatches, [defaultMatches]);

  const getServerSnapshot = React.useMemo(() => {
    if (noSsr && matchMedia) {
      return () => matchMedia(normalizedQuery).matches;
    }

    if (ssrMatchMedia) {
      const { matches } = ssrMatchMedia(normalizedQuery);
      return () => matches;
    }

    return getDefaultSnapshot;
  }, [getDefaultSnapshot, matchMedia, noSsr, normalizedQuery, ssrMatchMedia]);

  const [getSnapshot, subscribe] = React.useMemo(() => {
    if (!matchMedia) {
      return [getDefaultSnapshot, noopSubscribe] as const;
    }

    const mediaQueryList = matchMedia(normalizedQuery);

    return [
      () => mediaQueryList.matches,
      (notify: () => void) => {
        mediaQueryList.addEventListener('change', notify);

        return () => {
          mediaQueryList.removeEventListener('change', notify);
        };
      },
    ] as const;
  }, [getDefaultSnapshot, matchMedia, normalizedQuery]);

  const match = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  React.useDebugValue({ match, query: normalizedQuery });

  return match;
}

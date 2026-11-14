import * as React from 'react';

import { useEventCallback } from './use-event-callback';

/**
 * Calls `callback` once, `delay` milliseconds after mount or after `delay` changes. The latest
 * `callback` runs, so it doesn't need to be memoized. Pass `null` as `delay` to cancel it.
 */
export function useTimeout(callback: () => void, delay: null | number): void {
  const handleTimeout = useEventCallback(callback);

  React.useEffect(() => {
    if (delay === null) {
      return undefined;
    }

    const timeout = setTimeout(handleTimeout, delay);

    return () => {
      clearTimeout(timeout);
    };
  }, [delay, handleTimeout]);
}

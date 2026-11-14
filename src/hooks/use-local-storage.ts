import * as React from 'react';

import { useEventListener } from './use-event-listener';

export function getItem(key: string): null | string {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(key);
}

export function setItem(key: string, value: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, value);
    dispatchEvent(new Event(`local-storage-${key}`));
  }
}

export function removeItem(key: string): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(key);
    dispatchEvent(new Event(`local-storage-${key}`));
  }
}

export function useLocalStorage(key: string, initialValue: null | string = null): null | string {
  if (typeof initialValue !== 'string' && initialValue !== null) {
    throw new TypeError(
      `[useLocalStorage]: Expected initial value to be string or null but received "${typeof initialValue}"`,
    );
  }

  // State
  const [storedValue, setStoredValue] = React.useState<null | string>(
    () => getItem(key) ?? initialValue,
  );

  // Callbacks
  const handleStorageChange = React.useCallback(() => {
    setStoredValue(() => getItem(key) ?? initialValue);
  }, [key, initialValue]);

  // Effects
  React.useEffect(() => {
    // Reads the stored value again when the key changes.
    // eslint-disable-next-line react/set-state-in-effect -- localStorage is outside React
    handleStorageChange();
  }, [handleStorageChange]);

  useEventListener('storage', (event) => {
    if (event.key === key) {
      handleStorageChange();
    }
  });
  useEventListener(`local-storage-${key}`, handleStorageChange);

  return storedValue;
}

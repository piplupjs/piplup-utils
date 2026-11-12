import * as React from 'react';

/**
 * Returns `idProp` when it is provided, otherwise a unique ID from React's `useId`. Lets a
 * component accept an `id` prop and still have one for `aria-*` attributes when it isn't passed.
 */
export function useId(idProp?: string | undefined): string {
  const generatedId = React.useId();

  return idProp ?? generatedId;
}

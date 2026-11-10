import type * as React from 'react';
import { hasOwnProperty } from './has-own-property';

export function setRef<Instance>(
  ref:
    | ((instance: Instance | null) => void)
    | null
    | React.MutableRefObject<Instance | null>
    | undefined,
  value: Instance,
) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (hasOwnProperty(ref, 'current')) {
    (ref as React.MutableRefObject<Instance | null>).current = value;
  }
}

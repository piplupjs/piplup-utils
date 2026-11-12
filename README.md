# @piplup/utils

![npm bundle size](https://img.shields.io/bundlephobia/minzip/@piplup/utils)

This package contains a set of utility functions and React hooks designed to
simplify common tasks and enhance your development experience. Below is an
overview of each helper function and hook, along with usage examples.

**[Documentation](https://www.piplupjs.com/docs/utils/installation)**

## Installation

```bash
npm install @piplup/utils
```

or

```bash
yarn add @piplup/utils
```

or

```bash
pnpm add @piplup/utils
```

## Table of Contents

- [Helpers](#helpers)
  - [compact](https://github.com/piplupjs/piplup-utils/blob/main/src/helpers/compact.ts)
  - [execSequentially](https://github.com/piplupjs/piplup-utils/blob/main/src/helpers/exec-sequentially.ts)
  - [hasOwnProperty](https://github.com/piplupjs/piplup-utils/blob/main/src/helpers/has-own-property.ts)
  - [setRef](https://github.com/piplupjs/piplup-utils/blob/main/src/helpers/set-ref.ts)
  - [forkRef](https://github.com/piplupjs/piplup-utils/blob/main/src/helpers/fork-ref.ts)
- [Hooks](#hooks)
  - [useCountdown](https://github.com/piplupjs/piplup-utils/blob/main/src/hooks/use-countdown.ts)
  - [useEventCallback](https://github.com/piplupjs/piplup-utils/blob/main/src/hooks/use-event-callback.ts)
  - [useEventListener](https://github.com/piplupjs/piplup-utils/blob/main/src/hooks/use-event-listener.ts)
  - [useForkRef](https://github.com/piplupjs/piplup-utils/blob/main/src/hooks/use-fork-ref.ts)
  - [useId](https://github.com/piplupjs/piplup-utils/blob/main/src/hooks/use-id.ts)
  - [useIsomorphicEffect](https://github.com/piplupjs/piplup-utils/blob/main/src/hooks/use-isomorphic-effect.ts)
  - [useLocalStorage](https://github.com/piplupjs/piplup-utils/blob/main/src/hooks/use-local-storage.ts)
  - [useMediaQuery](https://github.com/piplupjs/piplup-utils/blob/main/src/hooks/use-media-query.ts)
  - [usePrefersReducedMotion](https://github.com/piplupjs/piplup-utils/blob/main/src/hooks/use-prefers-reduced-motion.ts)
  - [useTimeout](https://github.com/piplupjs/piplup-utils/blob/main/src/hooks/use-timeout.ts)

## Helpers

### compact

Removes all falsey values from an array.

#### Example

```tsx
import { compact } from '@piplup/utils';

const result = compact([0, 1, false, 2, '', 3]);
// => [1, 2, 3]
```

### execSequentially

Executes a series of functions sequentially with the same arguments.

#### Example

```tsx
import { execSequentially } from '@piplup/utils';

const log1 = (message: string) => console.log(`Log1: ${message}`);
const log2 = (message: string) => console.log(`Log2: ${message}`);

const executeLogs = execSequentially(log1, log2);
executeLogs('Hello');
// Output:
// Log1: Hello
// Log2: Hello
```

### hasOwnProperty

Checks if an object has a property with the specified key.

#### Example

```tsx
import { hasOwnProperty } from '@piplup/utils';

const obj = { key: 'value' };

if (hasOwnProperty(obj, 'key')) {
  console.log(obj.key); // Output: 'value'
}
```

### setRef

Sets a React ref or callback ref to a specified value.

#### Example

```tsx
import { setRef } from '@piplup/utils';

const ref = React.createRef<HTMLDivElement>();

setRef(ref, document.createElement('div'));
```

### forkRef

Creates a function that forwards an instance to multiple refs.

### Example

```tsx
import * as React from 'react';
import { forkRef } from '@piplup/utils';

type TextInputProps = React.InputHTMLAttributes<HTMLInputElement>;

function TextInputComponent(
  props: TextInputProps,
  ref?: React.Ref<HTMLInputElement>,
) {
  const internalRef = React.useRef<HTMLInputElement>(null);

  // Combine internalRef and ref received from parent component
  const handleInputRef = React.useMemo(() => forkRef(internalRef, ref), []);

  return (
    <input
      placeholder="Type something here"
      {...props}
      ref={handleInputRef} // Pass the combined ref to the input
    />
  );
}

const TextFieldInput = React.forwardRef(TextInputComponent);

export default TextFieldInput;
```

## Hooks

### useCountdown

A countdown that doesn't re-render the component that owns it. `useCountdown`
returns a controller; `useCountdownValue` subscribes to just the value a
component shows. `createCountdown` is the same countdown without React.

#### Example

```tsx
import { useCountdown, useCountdownValue } from '@piplup/utils';
import type { Countdown } from '@piplup/utils';

const ResendButton = ({ onResend }: { onResend: () => void }) => {
  const countdown = useCountdown({ from: 30, autoStart: true });
  // Re-renders once, when the countdown finishes.
  const canResend = useCountdownValue(
    countdown,
    (s) => s.status === 'finished',
  );

  return (
    <button
      disabled={!canResend}
      onClick={() => {
        onResend();
        countdown.restart();
      }}
    >
      Resend code {!canResend && <Remaining countdown={countdown} />}
    </button>
  );
};

// Re-renders every second.
const Remaining = ({ countdown }: { countdown: Countdown }) => (
  <>in {useCountdownValue(countdown)}s</>
);
```

### useEventCallback

Returns a stable callback function that always refers to the latest version of
the passed function.

#### Example

```tsx
import { useEventCallback } from '@piplup/utils';

const MyComponent = () => {
  const handleClick = useEventCallback(() => {
    console.log('Clicked!');
  });

  return <button onClick={handleClick}>Click me</button>;
};
```

### useEventListener

A hook for listening to events in react.

#### Example

```tsx
import { useEventListener } from '@piplup/utils';

const MyComponent = () => {
  useEventListener('resize', () => {
    console.log('Window resized');
  });

  return <div>Resize the window</div>;
};
```

### useForkRef

Combines multiple refs into a single ref callback.

#### Example

```tsx
import { useForkRef } from '@piplup/utils';

const MyComponent = () => {
  const ref1 = React.useRef<HTMLDivElement>(null);
  const ref2 = React.useRef<HTMLDivElement>(null);

  const forkedRef = useForkRef(ref1, ref2);

  return <div ref={forkedRef}>Combined refs</div>;
};
```

### useId

Returns the `id` prop when one is passed, otherwise a unique ID from React's
`useId`.

#### Example

```tsx
import { useId } from '@piplup/utils';

const Field = ({ id, label }: { id?: string; label: string }) => {
  const inputId = useId(id);

  return (
    <>
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} />
    </>
  );
};
```

### useIsomorphicEffect

A hook that uses `useLayoutEffect` on the client side and `useEffect` on the
server side.

#### Example

```tsx
import { useIsomorphicEffect } from '@piplup/utils';

const MyComponent = () => {
  useIsomorphicEffect(() => {
    console.log('Effect runs on the client side');
  }, []);

  return <div>Check the console</div>;
};
```

### useLocalStorage

A hook for reading value stored in `localStorage`

#### Example

```tsx
import { useLocalStorage, setItem, removeItem } from '@piplup/utils';

const MyComponent = () => {
  const [value, setValue] = useLocalStorage('myKey', 'initialValue');

  return (
    <div>
      <p>Stored value: {value}</p>
      <button onClick={() => setItem('myKey', 'newValue')}>
        Set New Value
      </button>
      <button onClick={() => removeItem('myKey')}>Remove Value</button>
    </div>
  );
};
```

### useMediaQuery

Subscribes to a CSS media query and re-renders when it starts or stops matching.
`matchesQuery` reads a query once, for use in effects and callbacks.

#### Example

```tsx
import { useMediaQuery } from '@piplup/utils';

const MyComponent = () => {
  const isWide = useMediaQuery('(min-width: 900px)');

  return <div>{isWide ? 'Wide layout' : 'Narrow layout'}</div>;
};
```

### usePrefersReducedMotion

Whether the user asked the OS to reduce motion. `prefersReducedMotion` reads the
setting once, for use right before starting an animation.

#### Example

```tsx
import { usePrefersReducedMotion } from '@piplup/utils';

const Banner = () => {
  const reduceMotion = usePrefersReducedMotion();

  return <div className={reduceMotion ? undefined : 'slide-in'}>Welcome</div>;
};
```

### useTimeout

Calls a callback once after a delay. Pass `null` as the delay to cancel it.

#### Example

```tsx
import { useTimeout } from '@piplup/utils';

const Toast = ({ onClose }: { onClose: () => void }) => {
  useTimeout(onClose, 5000);

  return <div role="status">Saved</div>;
};
```

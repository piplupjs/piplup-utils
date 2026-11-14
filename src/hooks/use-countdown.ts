import * as React from 'react';

import { useIsomorphicEffect } from './use-isomorphic-effect';

export type CountdownStatus = 'finished' | 'idle' | 'paused' | 'running';

export interface CountdownState {
  /** The current value. While idle it is `from`; once finished it is exactly `to`. */
  readonly count: number;
  readonly status: CountdownStatus;
}

export interface CountdownOptions {
  /** Value to count from. */
  from: number;
  /** Milliseconds per step. @default 1000 */
  interval?: number | undefined;
  /** Called once when the count reaches `to`. The latest function passed is called. */
  onComplete?: (() => void) | undefined;
  /**
   * Epoch milliseconds the countdown really started at, for example when a one-time code was sent.
   * The next start after this value changes counts from it instead of from now, so time that has
   * already passed is skipped.
   */
  startedAt?: number | undefined;
  /** Value to count to. Counts down when `from > to`, up when `from < to`. @default 0 */
  to?: number | undefined;
}

export interface UseCountdownOptions extends CountdownOptions {
  /** Start counting after the component mounts. Applies once per component instance. @default false */
  autoStart?: boolean | undefined;
}

/** Controls a countdown. The object and its methods keep the same identity for its lifetime. */
export interface Countdown {
  /** The current state. Changes identity only when `count` or `status` changes. */
  getState: () => CountdownState;
  /** Pauses a running countdown. */
  pause: () => void;
  /** Stops and goes back to `from`, idle. */
  reset: () => void;
  /** Starts again from `from`, counting from now, in a single update. */
  restart: () => void;
  /** Starts from `from` when idle or finished, resumes when paused. Does nothing while running. */
  start: () => void;
  /** Calls `listener` whenever `count` or `status` changes. Returns an unsubscribe function. */
  subscribe: (listener: (state: CountdownState) => void) => () => void;
}

/** A countdown that works without React. `useCountdown` creates one for you. */
export interface CountdownStore extends Countdown {
  /** Replaces the options. New `from` shows while idle; other values apply from the next start. */
  setOptions: (options: CountdownOptions) => void;
}

interface Run {
  direction: number;
  from: number;
  interval: number;
  to: number;
  totalSteps: number;
}

interface Internals {
  attach: () => void;
  detach: () => void;
}

const internals = new WeakMap<Countdown, Internals>();

function assertFiniteNumber(name: string, value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(
      `[useCountdown]: Expected "${name}" to be a finite number but received ${String(value)}`,
    );
  }
}

function validate(options: CountdownOptions): void {
  assertFiniteNumber('from', options.from);

  if (options.to !== undefined) {
    assertFiniteNumber('to', options.to);
  }

  if (options.interval !== undefined) {
    assertFiniteNumber('interval', options.interval);

    if (options.interval <= 0) {
      throw new TypeError(
        `[useCountdown]: Expected "interval" to be greater than 0 but received ${options.interval}`,
      );
    }
  }

  if (options.startedAt !== undefined) {
    assertFiniteNumber('startedAt', options.startedAt);
  }
}

/**
 * Creates a countdown store. It never starts a timer by itself: call `start()`.
 *
 * The count is worked out from the clock rather than by counting timer callbacks, so it stays
 * accurate when timers fire late, for example in a background tab.
 */
export function createCountdown(initialOptions: CountdownOptions): CountdownStore {
  validate(initialOptions);

  let options = initialOptions;
  let state: CountdownState = { count: initialOptions.from, status: 'idle' };
  let run: null | Run = null;
  // Epoch ms at which step 0 began. Moved forward on resume, back if the clock jumps back.
  let anchor = 0;
  let stepsDone = 0;
  let pausedElapsed = 0;
  // Elapsed time the pending timer is due at.
  let dueElapsed = 0;
  let lastUsedStartedAt: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attached = true;
  const listeners = new Set<(state: CountdownState) => void>();

  function setState(count: number, status: CountdownStatus): boolean {
    if (state.count === count && state.status === status) {
      return false;
    }

    state = { count, status };

    return true;
  }

  function notify(): void {
    // Copy so listeners can subscribe or unsubscribe while being notified.
    for (const listener of Array.from(listeners)) {
      listener(state);
    }
  }

  function clearTimer(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function countAt(steps: number, current: Run): number {
    return steps >= current.totalSteps ? current.to : current.from + current.direction * steps;
  }

  /**
   * Brings `stepsDone` up to date with the clock and returns the elapsed time. The count never
   * moves backwards. `expectedElapsed` is where the clock should be if it moved back, for example
   * the time a timer was due.
   */
  function syncSteps(current: Run, now: number, expectedElapsed: number): number {
    let elapsed = now - anchor;

    if (elapsed < expectedElapsed) {
      // The clock moved backwards. Trust the timer instead and count on from there.
      anchor = now - expectedElapsed;
      elapsed = expectedElapsed;
    }

    stepsDone = Math.max(
      stepsDone,
      Math.min(Math.floor(elapsed / current.interval), current.totalSteps),
    );

    return elapsed;
  }

  function finish(current: Run): void {
    clearTimer();
    stepsDone = current.totalSteps;
    setState(current.to, 'finished');
    notify();
    // After notifying, so `onComplete` can call `restart()` to loop.
    options.onComplete?.();
  }

  function schedule(current: Run, elapsed: number): void {
    clearTimer();
    // Wait until the next whole step, so lateness doesn't add up.
    dueElapsed = (stepsDone + 1) * current.interval;

    if (!attached) {
      return;
    }

    // At least 1ms, to avoid a busy loop.
    timer = setTimeout(tick, Math.max(1, dueElapsed - elapsed));
  }

  function tick(): void {
    timer = undefined;
    advance(dueElapsed);
  }

  /** `expectedElapsed`: see `syncSteps`. A fired timer expects its due time; a catch-up doesn't. */
  function advance(expectedElapsed: number): void {
    if (state.status !== 'running' || run === null) {
      return;
    }

    const current = run;
    const elapsed = syncSteps(current, Date.now(), expectedElapsed);

    if (stepsDone >= current.totalSteps) {
      finish(current);

      return;
    }

    if (setState(countAt(stepsDone, current), 'running')) {
      notify();
    }

    schedule(current, elapsed);
  }

  function begin(useStartedAt: boolean): void {
    const from = options.from;
    const to = options.to ?? 0;
    const current: Run = {
      direction: Math.sign(to - from),
      from,
      interval: options.interval ?? 1000,
      to,
      totalSteps: Math.ceil(Math.abs(to - from)),
    };
    const now = Date.now();
    const startedAt = options.startedAt;

    run = current;
    stepsDone = 0;
    anchor = now;

    if (useStartedAt && startedAt !== undefined && startedAt !== lastUsedStartedAt) {
      lastUsedStartedAt = startedAt;
      // A start time in the future counts as now.
      anchor = Math.min(startedAt, now);
    }

    const elapsed = syncSteps(current, now, 0);

    if (stepsDone >= current.totalSteps) {
      finish(current);

      return;
    }

    if (setState(countAt(stepsDone, current), 'running')) {
      notify();
    }

    schedule(current, elapsed);
  }

  const store: CountdownStore = {
    getState: () => state,

    pause: () => {
      if (state.status !== 'running' || run === null) {
        return;
      }

      clearTimer();
      pausedElapsed = syncSteps(run, Date.now(), stepsDone * run.interval);

      if (stepsDone >= run.totalSteps) {
        finish(run);

        return;
      }

      setState(countAt(stepsDone, run), 'paused');
      notify();
    },

    reset: () => {
      clearTimer();
      run = null;
      stepsDone = 0;

      if (setState(options.from, 'idle')) {
        notify();
      }
    },

    restart: () => {
      clearTimer();
      begin(false);
    },

    setOptions: (nextOptions) => {
      validate(nextOptions);
      options = nextOptions;

      if (state.status === 'idle' && setState(nextOptions.from, 'idle')) {
        notify();
      }
    },

    start: () => {
      if (state.status === 'running') {
        return;
      }

      if (state.status === 'paused' && run !== null) {
        const current = run;
        anchor = Date.now() - pausedElapsed;
        setState(state.count, 'running');
        notify();
        schedule(current, pausedElapsed);

        return;
      }

      begin(true);
    },

    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };

  internals.set(store, {
    attach: () => {
      attached = true;

      // Catch up on time that passed while detached, then keep ticking.
      if (state.status === 'running' && timer === undefined && run !== null) {
        advance(stepsDone * run.interval);
      }
    },
    detach: () => {
      attached = false;
      clearTimer();
    },
  });

  return store;
}

/**
 * Creates a countdown that lives as long as the component. It returns a controller and never
 * re-renders the component itself: read values with `useCountdownValue` in the components that
 * display them.
 */
export function useCountdown(options: UseCountdownOptions): Countdown {
  const { autoStart = false, from, interval, onComplete, startedAt, to } = options;
  const [countdown] = React.useState(() =>
    createCountdown({ from, interval, onComplete, startedAt, to }),
  );
  const autoStartRef = React.useRef(autoStart);
  const autoStartedRef = React.useRef(false);

  // Layout effect, so a `start()` in a passive effect or a click already sees the new options.
  useIsomorphicEffect(() => {
    countdown.setOptions({ from, interval, onComplete, startedAt, to });
  }, [countdown, from, interval, onComplete, startedAt, to]);

  React.useEffect(() => {
    const store = internals.get(countdown);
    store?.attach();

    if (autoStartRef.current && !autoStartedRef.current) {
      autoStartedRef.current = true;
      countdown.start();
    }

    // Stops the timer on unmount and while hidden by <Activity>. Time keeps passing, so it
    // catches up when shown again.
    return () => store?.detach();
  }, [countdown]);

  return countdown;
}

const selectCount = (state: CountdownState): number => state.count;

/**
 * Subscribes to a countdown and re-renders only when the selected value changes.
 *
 * ```tsx
 * const count = useCountdownValue(countdown);
 * const isDone = useCountdownValue(countdown, (state) => state.status === 'finished');
 * ```
 */
export function useCountdownValue(countdown: Countdown): number;
export function useCountdownValue<T>(
  countdown: Countdown,
  selector: (state: CountdownState) => T,
): T;
export function useCountdownValue<T>(
  countdown: Countdown,
  selector?: (state: CountdownState) => T,
): number | T {
  const select = selector ?? selectCount;
  const cache = React.useRef<{
    select: typeof select;
    selected: number | T;
    state: CountdownState;
  }>(null);

  // Selects again only when the state or the selector changes, so a selector that returns a new
  // object doesn't loop.
  const getSnapshot = (): number | T => {
    const state = countdown.getState();
    const cached = cache.current;

    if (cached !== null && cached.state === state && cached.select === select) {
      return cached.selected;
    }

    const selected = select(state);
    cache.current = { select, selected, state };

    return selected;
  };

  return React.useSyncExternalStore(countdown.subscribe, getSnapshot, getSnapshot);
}

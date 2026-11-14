import * as React from 'react';

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCountdown, useCountdown, useCountdownValue } from './use-countdown';

import type { Countdown, CountdownState } from './use-countdown';

const T0 = new Date('2026-01-01T00:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Advances one step at a time, each in its own `act`, the way real ticks reach React. */
function advanceSteps(steps: number, interval = 1000): void {
  for (let step = 0; step < steps; step += 1) {
    act(() => {
      vi.advanceTimersByTime(interval);
    });
  }
}

function record(countdown: Countdown): CountdownState[] {
  const states: CountdownState[] = [];
  countdown.subscribe((state) => states.push(state));

  return states;
}

describe('createCountdown', () => {
  it('counts down from `from` to `to` and calls onComplete once', () => {
    const onComplete = vi.fn();
    const countdown = createCountdown({ from: 3, onComplete });
    const states = record(countdown);

    expect(countdown.getState()).toEqual({ count: 3, status: 'idle' });

    countdown.start();
    vi.advanceTimersByTime(5000);

    expect(states).toEqual([
      { count: 3, status: 'running' },
      { count: 2, status: 'running' },
      { count: 1, status: 'running' },
      { count: 0, status: 'finished' },
    ]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('counts up when `from` is below `to`', () => {
    const countdown = createCountdown({ from: 0, interval: 100, to: 2 });
    const states = record(countdown);

    countdown.start();
    vi.advanceTimersByTime(200);

    expect(states.map((state) => state.count)).toEqual([0, 1, 2]);
    expect(countdown.getState().status).toBe('finished');
  });

  it('finishes immediately when `from` equals `to`', () => {
    const onComplete = vi.fn();
    const countdown = createCountdown({ from: 0, onComplete });

    countdown.start();

    expect(countdown.getState()).toEqual({ count: 0, status: 'finished' });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('ends exactly on `to` for non-integer values', () => {
    const countdown = createCountdown({ from: 2.5 });
    const states = record(countdown);

    countdown.start();
    vi.advanceTimersByTime(3000);

    expect(states.map((state) => state.count)).toEqual([2.5, 1.5, 0.5, 0]);
  });

  it('pauses and resumes with the rest of the current step', () => {
    const countdown = createCountdown({ from: 5 });

    countdown.start();
    vi.advanceTimersByTime(1400);
    countdown.pause();

    expect(countdown.getState()).toEqual({ count: 4, status: 'paused' });
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(10_000);
    expect(countdown.getState().count).toBe(4);

    countdown.start();
    vi.advanceTimersByTime(599);
    expect(countdown.getState().count).toBe(4);
    vi.advanceTimersByTime(1);
    expect(countdown.getState()).toEqual({ count: 3, status: 'running' });
  });

  it('starts again from `from` after finishing', () => {
    const countdown = createCountdown({ from: 1 });

    countdown.start();
    vi.advanceTimersByTime(1000);
    expect(countdown.getState().status).toBe('finished');

    countdown.start();
    expect(countdown.getState()).toEqual({ count: 1, status: 'running' });
  });

  it('ignores calls that do not apply', () => {
    const countdown = createCountdown({ from: 3 });
    const states = record(countdown);

    countdown.pause();
    countdown.reset();
    countdown.start();
    countdown.start();

    expect(states).toEqual([{ count: 3, status: 'running' }]);
  });

  it('resets to `from` and stops the timer', () => {
    const countdown = createCountdown({ from: 3 });

    countdown.start();
    vi.advanceTimersByTime(1000);
    countdown.reset();

    expect(countdown.getState()).toEqual({ count: 3, status: 'idle' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts in a single update', () => {
    const countdown = createCountdown({ from: 3 });

    countdown.start();
    vi.advanceTimersByTime(2000);

    const states = record(countdown);
    countdown.restart();

    expect(states).toEqual([{ count: 3, status: 'running' }]);
  });

  it('can loop by restarting from onComplete', () => {
    let rounds = 0;
    const countdown = createCountdown({
      from: 2,
      onComplete: () => {
        rounds += 1;

        if (rounds < 3) {
          countdown.restart();
        }
      },
    });

    countdown.start();
    vi.advanceTimersByTime(10_000);

    expect(rounds).toBe(3);
    expect(countdown.getState().status).toBe('finished');
  });

  it('lets listeners unsubscribe while being notified', () => {
    const countdown = createCountdown({ from: 2 });
    const second = vi.fn();
    const unsubscribeFirst = countdown.subscribe(() => unsubscribeFirst());
    countdown.subscribe(second);

    countdown.start();
    vi.advanceTimersByTime(1000);

    expect(second).toHaveBeenCalledTimes(2);
  });

  describe('startedAt', () => {
    it('skips the time that has already passed', () => {
      const countdown = createCountdown({ from: 10, startedAt: T0 - 3500 });

      countdown.start();
      expect(countdown.getState()).toEqual({ count: 7, status: 'running' });

      vi.advanceTimersByTime(499);
      expect(countdown.getState().count).toBe(7);
      vi.advanceTimersByTime(1);
      expect(countdown.getState().count).toBe(6);
    });

    it('finishes straight away when the deadline has passed', () => {
      const onComplete = vi.fn();
      const countdown = createCountdown({ from: 30, onComplete, startedAt: T0 - 60_000 });

      countdown.start();

      expect(countdown.getState()).toEqual({ count: 0, status: 'finished' });
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('is used once, then restarts count from now', () => {
      const countdown = createCountdown({ from: 10, startedAt: T0 - 3000 });

      countdown.start();
      expect(countdown.getState().count).toBe(7);

      countdown.reset();
      countdown.start();
      expect(countdown.getState().count).toBe(10);

      countdown.setOptions({ from: 10, startedAt: T0 - 5000 });
      countdown.reset();
      countdown.start();
      expect(countdown.getState().count).toBe(5);

      countdown.restart();
      expect(countdown.getState().count).toBe(10);
    });

    it('treats a start time in the future as now', () => {
      const countdown = createCountdown({ from: 3, startedAt: T0 + 60_000 });

      countdown.start();
      vi.advanceTimersByTime(1000);

      expect(countdown.getState().count).toBe(2);
    });
  });

  describe('clock changes', () => {
    it('never counts backwards when the clock moves back', () => {
      const countdown = createCountdown({ from: 10 });
      const states = record(countdown);

      countdown.start();
      vi.advanceTimersByTime(3000);
      vi.setSystemTime(Date.now() - 60 * 60 * 1000);
      vi.advanceTimersByTime(1000);

      expect(states.map((state) => state.count)).toEqual([10, 9, 8, 7, 6]);
    });

    it('skips steps when the clock moves forward', () => {
      const countdown = createCountdown({ from: 10 });

      countdown.start();
      vi.setSystemTime(Date.now() + 4200);
      // The first timer fires 1s later, 5.2s after the start by the clock.
      vi.advanceTimersToNextTimer();

      expect(countdown.getState().count).toBe(5);
    });

    it('catches up when a timer fires late', () => {
      const countdown = createCountdown({ from: 10 });
      const states = record(countdown);

      countdown.start();
      // The page was busy: the first timer, due at 1s, runs at 2.5s.
      vi.setSystemTime(Date.now() + 1500);
      vi.advanceTimersToNextTimer();
      expect(countdown.getState().count).toBe(8);

      // The next step comes at 3s, not 3.5s.
      vi.advanceTimersByTime(499);
      expect(countdown.getState().count).toBe(8);
      vi.advanceTimersByTime(1);
      expect(countdown.getState().count).toBe(7);
      expect(states.map((state) => state.count)).toEqual([10, 8, 7]);
    });
  });

  describe('options', () => {
    it('shows a new `from` while idle', () => {
      const countdown = createCountdown({ from: 3 });
      const states = record(countdown);

      countdown.setOptions({ from: 5 });

      expect(states).toEqual([{ count: 5, status: 'idle' }]);
    });

    it('applies new values from the next start while running', () => {
      const countdown = createCountdown({ from: 3 });

      countdown.start();
      countdown.setOptions({ from: 3, interval: 100 });
      vi.advanceTimersByTime(100);
      expect(countdown.getState().count).toBe(3);

      countdown.restart();
      vi.advanceTimersByTime(100);
      expect(countdown.getState().count).toBe(2);
    });

    it.each([
      [{ from: Number.NaN }, /"from" to be a finite number/],
      [{ from: 3, to: Number.POSITIVE_INFINITY }, /"to" to be a finite number/],
      [{ from: 3, interval: 0 }, /"interval" to be greater than 0/],
      [{ from: 3, interval: -5 }, /"interval" to be greater than 0/],
      [{ from: 3, startedAt: Number.NaN }, /"startedAt" to be a finite number/],
    ])('throws a TypeError for %o', (options, message) => {
      expect(() => createCountdown(options)).toThrow(TypeError);
      expect(() => createCountdown(options)).toThrow(message);
    });
  });
});

describe('useCountdown and useCountdownValue', () => {
  it('re-renders only the components that read the changing value', () => {
    const renders = { form: 0, remaining: 0 };

    function Remaining({ countdown }: { countdown: Countdown }) {
      renders.remaining += 1;

      return <span data-testid="remaining">{useCountdownValue(countdown)}</span>;
    }

    function Form() {
      renders.form += 1;
      const countdown = useCountdown({ autoStart: true, from: 3 });
      const isDone = useCountdownValue(countdown, (state) => state.status === 'finished');

      return (
        <div>
          <Remaining countdown={countdown} />
          {isDone && <span>done</span>}
        </div>
      );
    }

    render(<Form />);
    advanceSteps(3);

    expect(screen.getByTestId('remaining').textContent).toBe('0');
    expect(screen.getByText('done')).toBeTruthy();
    // Form: mount, then once when it finishes. Remaining: mount (3), then 2, 1, 0.
    expect(renders).toEqual({ form: 2, remaining: 4 });
  });

  it('keeps the same controller and methods across renders', () => {
    const controllers: Countdown[] = [];

    function Probe({ from }: { from: number }) {
      controllers.push(useCountdown({ from }));

      return null;
    }

    const { rerender } = render(<Probe from={3} />);
    rerender(<Probe from={5} />);

    expect(controllers[0]).toBe(controllers[1]);
    expect(controllers[0]?.start).toBe(controllers[1]?.start);
  });

  it('shows a new `from` while idle', () => {
    function Probe({ from }: { from: number }) {
      const countdown = useCountdown({ from });

      return <span data-testid="count">{useCountdownValue(countdown)}</span>;
    }

    const { rerender } = render(<Probe from={3} />);
    rerender(<Probe from={8} />);

    expect(screen.getByTestId('count').textContent).toBe('8');
  });

  it('calls the latest onComplete', () => {
    const first = vi.fn();
    const second = vi.fn();

    function Probe({ onComplete }: { onComplete: () => void }) {
      useCountdown({ autoStart: true, from: 1, onComplete });

      return null;
    }

    const { rerender } = render(<Probe onComplete={first} />);
    rerender(<Probe onComplete={second} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops the timer on unmount and never calls onComplete afterwards', () => {
    const onComplete = vi.fn();

    function Probe() {
      useCountdown({ autoStart: true, from: 2, onComplete });

      return null;
    }

    const { unmount } = render(<Probe />);
    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(vi.getTimerCount()).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('runs a single timer under StrictMode', () => {
    const onComplete = vi.fn();

    function Probe() {
      const countdown = useCountdown({ autoStart: true, from: 3, onComplete });

      return <span data-testid="count">{useCountdownValue(countdown)}</span>;
    }

    const { unmount } = render(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>,
    );

    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('count').textContent).toBe('2');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pauses its timer while hidden by <Activity> and catches up when shown', () => {
    function Probe() {
      const countdown = useCountdown({ autoStart: true, from: 10 });

      return <span data-testid="count">{useCountdownValue(countdown)}</span>;
    }

    function App({ mode }: { mode: 'hidden' | 'visible' }) {
      return (
        <React.Activity mode={mode}>
          <Probe />
        </React.Activity>
      );
    }

    const { rerender } = render(<App mode="visible" />);
    advanceSteps(2);
    expect(screen.getByTestId('count').textContent).toBe('8');

    rerender(<App mode="hidden" />);
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(3500);
    });
    rerender(<App mode="visible" />);
    expect(screen.getByTestId('count').textContent).toBe('5');

    advanceSteps(1, 500);
    expect(screen.getByTestId('count').textContent).toBe('4');
  });

  it('does not start without autoStart', () => {
    function Probe() {
      const countdown = useCountdown({ from: 3 });

      return <span data-testid="status">{useCountdownValue(countdown, (s) => s.status)}</span>;
    }

    render(<Probe />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId('status').textContent).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts a selector that returns a new object', () => {
    let renders = 0;

    function Probe({ countdown }: { countdown: Countdown }) {
      renders += 1;
      const view = useCountdownValue(countdown, (state) => ({ label: `${state.count}s` }));

      return <span data-testid="label">{view.label}</span>;
    }

    const countdown = createCountdown({ from: 2 });
    render(<Probe countdown={countdown} />);
    act(() => {
      countdown.start();
    });
    advanceSteps(2);

    expect(screen.getByTestId('label').textContent).toBe('0s');
    // Mount, start (status changes), 1, 0.
    expect(renders).toBe(4);
  });

  it('renders `from` on the server', async () => {
    const { renderToString } = await import('react-dom/server');

    function Probe() {
      const countdown = useCountdown({ autoStart: true, from: 30, startedAt: T0 - 5000 });

      return <span>{useCountdownValue(countdown)}</span>;
    }

    expect(renderToString(<Probe />)).toBe('<span>30</span>');
    expect(vi.getTimerCount()).toBe(0);
  });
});

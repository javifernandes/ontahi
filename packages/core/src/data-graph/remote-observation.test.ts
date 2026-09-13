import { Effect, Fiber, Stream } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { withObservationLifetime } from './remote-observation.js';

import {
  createRemoteDataGraphRuntime,
  entity,
  field,
  query,
  type RemoteGraphObservationTransport,
} from './index.js';

const Item = entity('ObservedItem', { id: field.id() });

describe('remote observation lifetime', () => {
  it('aborts an idle transport on interruption, keeps options intact and isolates subscriptions', async () => {
    const signals: AbortSignal[] = [];
    const seen: unknown[] = [];
    let closed = 0;
    const options = Object.freeze({ credential: 'caller-owned' });
    const observe = vi.fn<RemoteGraphObservationTransport<typeof options>>(
      async function* (_request, receivedOptions, lifecycle) {
        expect(receivedOptions).toBe(options);
        if (!lifecycle) throw new Error('Missing observation lifetime.');
        const signal = lifecycle.signal;
        signals.push(signal);
        try {
          yield { kind: 'graph-read-result', value: [{ id: 'one' }] };
          if (!signal.aborted)
            await new Promise<void>(resolve =>
              signal.addEventListener('abort', () => resolve(), { once: true }),
            );
        } finally {
          closed++;
        }
      },
    );
    const runtime = createRemoteDataGraphRuntime({ transport: vi.fn(), observeTransport: observe });
    const stream = runtime.observe(query(Item), undefined, options);
    expect(observe).not.toHaveBeenCalled();
    const first = Effect.runFork(
      Stream.runForEach(stream, row => Effect.sync(() => seen.push(row))),
    );
    const second = Effect.runFork(
      Stream.runForEach(stream, row => Effect.sync(() => seen.push(row))),
    );
    try {
      await vi.waitFor(() => expect(seen).toHaveLength(2));
      expect(signals[0]).not.toBe(signals[1]);
      await Effect.runPromise(Fiber.interrupt(first));
      expect(signals[0]?.aborted).toBe(true);
      expect(signals[1]?.aborted).toBe(false);
      expect(closed).toBe(1);
    } finally {
      await Effect.runPromise(Fiber.interrupt(first));
      await Effect.runPromise(Fiber.interrupt(second));
    }
    expect(closed).toBe(2);
    expect(options).toEqual({ credential: 'caller-owned' });
  });

  it('releases the lifetime after a finite stream, early take and transport failure', async () => {
    for (const mode of ['complete', 'take', 'fail'] as const) {
      let signal: AbortSignal | undefined;
      let closed = false;
      const runtime = createRemoteDataGraphRuntime({
        transport: vi.fn(),
        observeTransport: async function* (_request, _options, lifecycle) {
          signal = lifecycle?.signal;
          try {
            if (mode === 'fail') throw new Error('connection lost');
            yield { kind: 'graph-read-result', value: [] };
            if (mode === 'take') yield { kind: 'graph-read-result', value: [{ id: 'two' }] };
          } finally {
            closed = true;
          }
        },
      });
      const observed = runtime.observe(query(Item), undefined);
      const result = await Effect.runPromise(
        (mode === 'take' ? observed.pipe(Stream.take(1)) : observed).pipe(
          Stream.runCollect,
          Effect.either,
        ),
      );
      expect(result._tag).toBe(mode === 'fail' ? 'Left' : 'Right');
      expect(signal?.aborted).toBe(true);
      expect(closed).toBe(true);
    }
  });

  it('aborts setup failures and closes iterators that have no return method', async () => {
    let signal: AbortSignal | undefined;
    const broken = withObservationLifetime(received => {
      signal = received;
      throw new Error('cannot connect');
    });
    expect(() => broken[Symbol.asyncIterator]()).toThrow('cannot connect');
    expect(signal?.aborted).toBe(true);
    const empty = withObservationLifetime(received => {
      signal = received;
      return {
        [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }),
      };
    })[Symbol.asyncIterator]();
    expect(await empty.next()).toEqual({ done: true, value: undefined });
    expect(await empty.return?.()).toEqual({ done: true, value: undefined });
    expect(signal?.aborted).toBe(true);
  });
});

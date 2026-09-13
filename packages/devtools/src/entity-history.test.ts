import {
  createEntityRef,
  createGraphClientCache,
  entity,
  field,
  graphOutput,
} from '@ontahi/core/data-graph';
import { describe, expect, it, vi } from 'vitest';

import { createEntityHistory, historyFieldChanges } from './entity-history.js';

const Book = entity('Book', { id: field.id(), title: field.string() })
  .locators({ byId: 'id' })
  .identity('byId');

const row = (title: string) => ({ id: 'b1', title });

describe('local entity history', () => {
  it('starts disabled, captures detached baseline and normalized writes, and retains stopped history', () => {
    const cache = createGraphClientCache();
    const subscribe = vi.spyOn(cache, 'subscribe');
    const baseline = { ...row('Before'), extra: { count: 1 } };
    cache.writeEntity(Book, baseline);
    const history = createEntityHistory(cache, { now: () => 123 });
    expect(subscribe).not.toHaveBeenCalled();
    expect(history.inspect()).toMatchObject({ recording: false, entries: [] });
    history.setRecording(true);
    history.setRecording(true);
    expect(subscribe).toHaveBeenCalledTimes(1);
    baseline.extra.count = 99;
    cache.writeOutput(['books'], graphOutput.array(graphOutput.entity(Book)), [row('After')]);
    expect(history.inspect().entries).toMatchObject([
      {
        id: 1,
        at: 123,
        kind: 'baseline',
        key: 'Book:{"id":"b1"}',
        value: { title: 'Before', extra: { count: 1 } },
      },
      { id: 2, kind: 'write', value: row('After') },
    ]);
    history.setRecording(false);
    cache.writeEntity(Book, row('Unrecorded'));
    expect(history.inspect().entries).toHaveLength(2);
    history.setRecording(true);
    expect(history.inspect().entries[2]).toMatchObject({
      kind: 'baseline',
      value: row('Unrecorded'),
      segment: 2,
    });
    history.dispose();
    cache.writeEntity(Book, row('Disposed'));
    expect(history.inspect().entries).toHaveLength(3);
  });

  it('retains invalidated and cleared entities and clears only diagnostic history', () => {
    const cache = createGraphClientCache();
    const history = createEntityHistory(cache);
    history.setRecording(true);
    cache.writeEntity(Book, row('First'));
    cache.invalidateEntity(createEntityRef(Book, { id: 'b1' }));
    cache.writeEntity(Book, row('Second'));
    cache.clear();
    expect(history.inspect().entries.map(entry => entry.kind)).toEqual([
      'write',
      'invalidate',
      'write',
      'clear',
    ]);
    cache.writeEntity(Book, row('Still cached'));
    history.clear();
    expect(history.inspect()).toMatchObject({ recording: true, entries: [], bytes: 0, dropped: 0 });
    expect(cache.readEntity(createEntityRef(Book, { id: 'b1' }))).toEqual(row('Still cached'));
    cache.writeEntity(Book, row('Next'));
    expect(history.inspect().entries).toHaveLength(1);
    history.dispose();
  });

  it('bounds retention by count and bytes, including oversized entries', () => {
    const cache = createGraphClientCache();
    const history = createEntityHistory(cache, { capacity: 2, maxBytes: 600, now: () => 1 });
    history.setRecording(true);
    for (const title of ['one', 'two', 'three']) cache.writeEntity(Book, row(title));
    expect(
      history.inspect().entries.map(entry => (entry.value as { title: string }).title),
    ).toEqual(['two', 'three']);
    expect(history.inspect().dropped).toBe(1);
    cache.writeEntity(Book, row('x'.repeat(1000)));
    expect(history.inspect().dropped).toBe(2);
    expect(history.inspect().bytes).toBeLessThanOrEqual(600);
    history.dispose();
    const small = createEntityHistory(cache, { maxBytes: 300, now: () => 1 });
    small.setRecording(true);
    cache.writeEntity(Book, row('one'));
    cache.writeEntity(Book, row('two'));
    expect(small.inspect().entries).toHaveLength(1);
    expect(small.inspect().bytes).toBeLessThanOrEqual(300);
    small.dispose();
    expect(() => createEntityHistory(cache, { capacity: 0 })).toThrow(TypeError);
    expect(() => createEntityHistory(cache, { maxBytes: Infinity })).toThrow(TypeError);
  });

  it('handles non-JSON values and isolates listener and capture failures from cache writes', () => {
    const cache = createGraphClientCache();
    const history = createEntityHistory(cache);
    const listener = vi.fn(() => {
      throw new Error('listener');
    });
    const unsubscribe = history.subscribe(listener);
    history.setRecording(true);
    const cycle: Record<string, unknown> = { amount: 42n };
    cycle.self = cycle;
    cache.writeEntity(Book, { ...row('Rich'), cycle });
    expect(history.inspect().entries[0]?.value).toMatchObject({
      cycle: { amount: '42', self: '[Circular]' },
    });
    expect(cycle.self).toBe(cycle);
    const bad = {
      ...row('Getter'),
      get extra() {
        throw new Error('cannot inspect');
      },
    };
    expect(() => cache.writeEntity(Book, bad)).not.toThrow();
    expect(history.inspect().captureErrors).toBe(1);
    expect(cache.readEntity(createEntityRef(Book, { id: 'b1' }))).toBe(bad);
    unsubscribe();
    listener.mockClear();
    history.clear();
    expect(listener).not.toHaveBeenCalled();
    history.dispose();
  });

  it('compares present fields without equating removal with null or undefined', () => {
    expect(
      historyFieldChanges(
        { unchanged: { x: 1 }, removed: null, changed: 1 },
        { unchanged: { x: 1 }, changed: 2, added: undefined },
      ),
    ).toEqual([
      { field: 'removed', kind: 'removed', before: null, after: undefined },
      { field: 'changed', kind: 'changed', before: 1, after: 2 },
      { field: 'added', kind: 'added', before: undefined, after: undefined },
    ]);
  });
});

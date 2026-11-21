import { describe, expect, it } from 'vitest';

import { createEntityRef, entity, field } from '../../../data-graph/index.js';

import {
  hasFreshnessMarker,
  hasSameFreshnessMarker,
  mergeFreshSnapshot,
  resolveEntitySnapshotFreshness,
} from './freshness.js';
import { normalizeOutputCacheKey } from './normalization.js';

describe('graph client cache helpers', () => {
  it('normalizes composite output keys deterministically', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const left = normalizeOutputCacheKey([
      { z: 1, a: ['value', undefined, 2n, new Date('2026-01-02T03:04:05.000Z')] },
      circular,
      Symbol('token'),
      function operation() {},
      new Map(),
    ]);
    const right = normalizeOutputCacheKey([
      { a: ['value', undefined, 2n, new Date('2026-01-02T03:04:05.000Z')], z: 1 },
      circular,
      Symbol('token'),
      function operation() {},
      new Map(),
    ]);

    expect(left).toBe(right);
    expect(left).toContain('[Circular]');
    expect(left).toContain('symbol(token)');
    expect(left).toContain('function(');
    expect(left).toContain('{}');
  });

  it('terminates when output keys contain self-referential arrays', () => {
    const circular: unknown[] = [];
    circular.push(circular);

    expect(normalizeOutputCacheKey(circular)).toBe('[[Circular]]');
  });

  it('resolves and compares every supported freshness marker', () => {
    const Article = entity('Article', {
      id: field.id(),
      updatedAt: field.string(),
      version: field.string(),
      hash: field.string(),
    })
      .locators({ refById: 'id' })
      .identity('refById')
      .freshness({ updatedAt: 'updatedAt', version: 'version', hash: 'hash' });
    const freshness = resolveEntitySnapshotFreshness(Article, {
      updatedAt: '2026-01-02T03:04:05.000Z',
      version: 2,
      hash: true,
    });
    const articleRef = createEntityRef(Article, { id: '1' });

    expect(freshness).toEqual({
      freshnessAt: Date.parse('2026-01-02T03:04:05.000Z'),
      freshnessVersion: 2,
      freshnessHash: true,
    });
    expect(hasFreshnessMarker(freshness)).toBe(true);
    expect(hasFreshnessMarker({})).toBe(false);
    expect(hasSameFreshnessMarker(undefined, freshness)).toBe(false);
    expect(hasSameFreshnessMarker({ cachedAt: 1, ref: articleRef, value: {} }, freshness)).toBe(
      false,
    );
    expect(
      hasSameFreshnessMarker(
        {
          cachedAt: 1,
          freshnessVersion: 2,
          ref: articleRef,
          value: {},
        },
        freshness,
      ),
    ).toBe(true);
  });

  it('accepts date and numeric timestamps and ignores invalid freshness values', () => {
    const Event = entity('Event', {
      id: field.id(),
      updatedAt: field.string(),
      version: field.string(),
    })
      .locators({ refById: 'id' })
      .identity('refById')
      .freshness({ updatedAt: 'updatedAt', version: 'version' });

    expect(
      resolveEntitySnapshotFreshness(Event, {
        updatedAt: new Date('2026-01-02T03:04:05.000Z'),
        version: null,
      }),
    ).toEqual({
      freshnessAt: Date.parse('2026-01-02T03:04:05.000Z'),
      freshnessVersion: null,
    });
    expect(resolveEntitySnapshotFreshness(Event, { updatedAt: 42, version: {} })).toEqual({
      freshnessAt: 42,
    });
    expect(resolveEntitySnapshotFreshness(Event, { updatedAt: 'invalid' })).toEqual({});
  });

  it('merges defined snapshot fields without erasing cached projections', () => {
    const Article = entity('Article', { id: field.id() })
      .locators({ refById: 'id' })
      .identity('refById');

    expect(
      mergeFreshSnapshot(
        {
          cachedAt: 1,
          ref: createEntityRef(Article, { id: '1' }),
          value: { id: '1', title: 'Cached', subtitle: 'Keep me' },
        },
        { id: '1', title: 'Fresh', subtitle: undefined },
      ),
    ).toEqual({ id: '1', title: 'Fresh', subtitle: 'Keep me' });
  });
});

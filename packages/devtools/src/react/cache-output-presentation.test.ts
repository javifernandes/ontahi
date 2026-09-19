import { createGraphClientCache, graphOutput } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import { presentCacheOutput } from './cache-output-presentation.js';

const output = (key: readonly unknown[]) => ({ key, keyHash: 'key', cachedAt: 0, value: [] });

describe('cache output presentation', () => {
  it('separates read intent, selection, view and scope from its cache key', () => {
    const key = [
      'TodoList',
      'graph-read',
      ['anonymous', 'public'],
      'many',
      {
        kind: 'graph-read',
        mode: 'run',
        selection: { entityName: 'TodoList', expression: { kind: 'all' } },
        orderBy: [{ fieldName: 'name', direction: 'asc' }],
        view: { name: 'TodoListItem' },
      },
    ];
    expect(presentCacheOutput(output(key))).toEqual({
      title: 'TodoList · many',
      detail: 'TodoList.all · orderBy name asc · as TodoListItem',
      scope: 'Anonymous / public',
      family: 'Graph read',
    });
    expect(presentCacheOutput(output(key), 'declarative').detail).toBe(
      'TodoList · order by name ascending · many · as TodoListItem',
    );
    expect(
      presentCacheOutput(
        output([
          'TodoList',
          'graph-read',
          ['anonymous', 'session-loading'],
          'many',
          'view',
          'Inbox',
        ]),
      ).scope,
    ).toBe('Anonymous / session-loading');
  });

  it('uses explicit operation provenance, including custom keys, without guessing arbitrary arrays', () => {
    const cache = createGraphClientCache();
    const source = { kind: 'operation', name: 'TodoList.available()' } as const;
    cache.writeOutput(['custom'], graphOutput.opaque(), 3, source);
    expect(cache.inspect().outputs[0]?.source).toEqual(source);
    expect(presentCacheOutput(cache.inspect().outputs[0]!)).toEqual({
      title: 'TodoList.available()',
      detail: 'Operation result',
      scope: undefined,
      family: 'Operation',
    });
    expect(presentCacheOutput(output(['Something', 'arbitrary'])).title).toBe('Cached output');
    cache.writeOutput(['custom'], graphOutput.opaque(), 4);
    expect(cache.inspect().outputs[0]?.source).toBeUndefined();
  });
});

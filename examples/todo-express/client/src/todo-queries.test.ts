import { toGraphReadRequest } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import { todoListsQuery } from './todo-queries.js';

describe('Todo client Queries', () => {
  it('reads items and tags through the ordered TodoList.items relation', () => {
    const request = toGraphReadRequest(todoListsQuery.build(), 'run');
    expect(request.kind).toBe('graph-read');
    if (request.kind !== 'graph-read' || !request.view)
      throw new Error('Expected graph read View.');
    expect(request.view.name).toBe('TodoListItem');
    const items = request.view.fields.items;
    expect(items).toMatchObject({ kind: 'relation-view', relation: 'TodoList.items' });
    expect(items && 'view' in items ? items.view.fields : undefined).toMatchObject({
      list: expect.objectContaining({ kind: 'field-view' }),
      tags: expect.objectContaining({ kind: 'relation-view' }),
    });
  });

  it('projects the persisted list color for the desk cards', () => {
    expect(toGraphReadRequest(todoListsQuery.build(), 'run')).toMatchObject({
      kind: 'graph-read',
      view: {
        name: 'TodoListItem',
        fields: {
          color: expect.objectContaining({ kind: 'field-view' }),
        },
      },
    });
  });
});

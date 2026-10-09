import { describe, expect, it } from 'vitest';

import type { GraphCommandRequest } from './command-protocol.js';
import { mayAffectGraphRead, type CommittedMutation } from './mutation-impact.js';
import type { GraphReadRequest } from './read-protocol.js';
import { createEntityRef } from './ref/index.js';
import type { SelectionExpression } from './selection-ast.js';

const read = (
  entityName: string,
  expression: SelectionExpression = { kind: 'all' },
  overrides: Partial<GraphReadRequest> = {},
): GraphReadRequest => ({
  version: 1,
  kind: 'graph-read',
  mode: 'run',
  selection: { kind: 'selection', entityName, expression },
  orderBy: [],
  ...overrides,
});

const mutation = (command: GraphCommandRequest['command']): CommittedMutation => ({
  command: { version: 3, kind: 'graph-command', command },
  provenance: 'captured',
});

const equal = (fieldName: string, value: unknown): SelectionExpression => ({
  kind: 'predicate',
  operator: 'eq',
  fieldName,
  value,
});

const update = (
  expression: SelectionExpression,
  values: Record<string, unknown> = { completed: true },
): CommittedMutation =>
  mutation({
    kind: 'entity-mutation-command',
    action: 'update',
    entityName: 'TodoItem',
    target: { kind: 'selection', entityName: 'TodoItem', expression },
    values,
  });

describe('mayAffectGraphRead', () => {
  it('matches the same Selection and broad Entity Reads', () => {
    const later = equal('listId', 'later');

    expect(mayAffectGraphRead(update(later), read('TodoItem', later))).toBe(true);
    expect(mayAffectGraphRead(update(later), read('TodoItem'))).toBe(true);
  });

  it('proves different Entity roots disjoint', () => {
    expect(mayAffectGraphRead(update({ kind: 'all' }), read('TodoList'))).toBe(false);
  });

  it('keeps nested Entity dependencies conservative', () => {
    expect(
      mayAffectGraphRead(
        update({ kind: 'all' }),
        read(
          'TodoList',
          { kind: 'all' },
          {
            view: {
              version: 1,
              kind: 'entity-view',
              name: 'TodoLists',
              entity: 'TodoList',
              fields: {
                items: {
                  kind: 'relation-view',
                  relation: 'TodoList.items',
                  direction: 'inverse',
                  targetEntity: 'TodoItem',
                  cardinality: 'many',
                  nullable: false,
                  view: {
                    kind: 'view-node',
                    entity: 'TodoItem',
                    fields: { title: { kind: 'field-view', field: 'title' } },
                  },
                },
              },
            },
          },
        ),
      ),
    ).toBe(true);
  });

  it('proves incompatible equality predicates disjoint', () => {
    expect(
      mayAffectGraphRead(
        update(equal('listId', 'later')),
        read('TodoItem', equal('listId', 'inbox')),
      ),
    ).toBe(false);
  });

  it('finds contradictions inside conjunctions', () => {
    expect(
      mayAffectGraphRead(
        update({
          kind: 'and',
          operands: [equal('completed', false), equal('listId', 'later')],
        }),
        read('TodoItem', {
          kind: 'and',
          operands: [equal('completed', false), equal('listId', 'inbox')],
        }),
      ),
    ).toBe(false);
  });

  it('proves distinct concrete Refs disjoint', () => {
    const first = createEntityRef('TodoItem', { id: 'first' });
    const second = createEntityRef('TodoItem', { id: 'second' });

    expect(
      mayAffectGraphRead(
        mutation({
          kind: 'entity-mutation-command',
          action: 'delete',
          entityName: 'TodoItem',
          target: first,
        }),
        read('TodoItem', { kind: 'references', refs: [second] }),
      ),
    ).toBe(false);
  });

  it('proves Ref and equality selections disjoint in either direction', () => {
    const item = createEntityRef('TodoItem', { id: 'item-1' });

    expect(
      mayAffectGraphRead(
        mutation({
          kind: 'entity-mutation-command',
          action: 'update',
          entityName: 'TodoItem',
          target: item,
          values: { completed: true },
        }),
        read('TodoItem', equal('id', 'item-2')),
      ),
    ).toBe(false);
    expect(
      mayAffectGraphRead(
        update(equal('id', 'item-2')),
        read('TodoItem', { kind: 'references', refs: [item] }),
      ),
    ).toBe(false);
  });

  it('treats an empty Ref selection as disjoint', () => {
    expect(
      mayAffectGraphRead(
        update({ kind: 'all' }),
        read('TodoItem', { kind: 'references', refs: [] }),
      ),
    ).toBe(false);

    expect(mayAffectGraphRead(update({ kind: 'references', refs: [] }), read('TodoItem'))).toBe(
      false,
    );
    expect(mayAffectGraphRead(update({ kind: 'all' }), read('TodoItem', { kind: 'none' }))).toBe(
      false,
    );
  });

  it('matches create and delete by their semantic target', () => {
    expect(
      mayAffectGraphRead(
        mutation({
          kind: 'entity-mutation-command',
          action: 'create',
          entityName: 'TodoItem',
          values: { id: 'new', listId: 'later' },
        }),
        read('TodoItem', equal('listId', 'later')),
      ),
    ).toBe(true);

    expect(
      mayAffectGraphRead(
        mutation({
          kind: 'entity-mutation-command',
          action: 'create',
          entityName: 'TodoItem',
          values: { id: 'new', listId: 'later' },
        }),
        read('TodoItem', equal('listId', 'inbox')),
      ),
    ).toBe(false);
  });

  it('keeps materialized Reads conservative when an update changes another Field', () => {
    expect(
      mayAffectGraphRead(
        update(equal('listId', 'later'), { notes: 'changed' }),
        read('TodoItem', equal('listId', 'later'), {
          orderBy: [{ fieldName: 'title', direction: 'asc' }],
          view: {
            version: 1,
            kind: 'entity-view',
            name: 'TodoItemRow',
            entity: 'TodoItem',
            fields: { title: { kind: 'field-view', field: 'title' } },
          },
        }),
      ),
    ).toBe(true);
  });

  it('matches count Reads only when an update can change membership', () => {
    const later = equal('listId', 'later');

    expect(
      mayAffectGraphRead(
        update(later, { notes: 'changed' }),
        read('TodoItem', later, { mode: 'count' }),
      ),
    ).toBe(false);
    expect(
      mayAffectGraphRead(
        update(later, { listId: 'inbox' }),
        read('TodoItem', later, { mode: 'count' }),
      ),
    ).toBe(true);
  });

  it('derives count dependencies from broad, Ref, and compound selections', () => {
    const item = createEntityRef('TodoItem', { id: 'item-1' });

    expect(
      mayAffectGraphRead(
        update({ kind: 'all' }, { notes: 'changed' }),
        read('TodoItem', { kind: 'all' }, { mode: 'count' }),
      ),
    ).toBe(false);
    expect(
      mayAffectGraphRead(
        update({ kind: 'all' }, { id: 'item-2' }),
        read('TodoItem', { kind: 'references', refs: [item] }, { mode: 'count' }),
      ),
    ).toBe(true);
    expect(
      mayAffectGraphRead(
        update({ kind: 'all' }, { completed: true }),
        read(
          'TodoItem',
          {
            kind: 'or',
            operands: [equal('completed', false), equal('listId', 'later')],
          },
          { mode: 'count' },
        ),
      ),
    ).toBe(true);
    expect(
      mayAffectGraphRead(
        update({ kind: 'all' }, { notes: 'changed' }),
        read('TodoItem', { kind: 'not', operand: equal('completed', true) }, { mode: 'count' }),
      ),
    ).toBe(true);
  });

  it.each([
    ['projected', { title: 'changed' }],
    ['filtered', { listId: 'inbox' }],
    ['ordered', { priority: 2 }],
  ])('matches updates to %s Fields', (_case, values) => {
    expect(
      mayAffectGraphRead(
        update(equal('listId', 'later'), values),
        read('TodoItem', equal('listId', 'later'), {
          orderBy: [{ fieldName: 'priority', direction: 'asc' }],
          view: {
            version: 1,
            kind: 'entity-view',
            name: 'TodoItemRow',
            entity: 'TodoItem',
            fields: { title: { kind: 'field-view', field: 'title' } },
          },
        }),
      ),
    ).toBe(true);
  });

  it('uses OR only when every branch is provably disjoint', () => {
    const inboxOrLater: SelectionExpression = {
      kind: 'or',
      operands: [equal('listId', 'inbox'), equal('listId', 'later')],
    };

    expect(
      mayAffectGraphRead(update(equal('listId', 'other')), read('TodoItem', inboxOrLater)),
    ).toBe(false);
    expect(
      mayAffectGraphRead(update(equal('listId', 'later')), read('TodoItem', inboxOrLater)),
    ).toBe(true);

    expect(
      mayAffectGraphRead(
        update({
          kind: 'or',
          operands: [equal('listId', 'other'), equal('listId', 'archive')],
        }),
        read('TodoItem', equal('listId', 'inbox')),
      ),
    ).toBe(false);
  });

  it('tracks Entity dependencies reached through relation-image selections', () => {
    expect(
      mayAffectGraphRead(
        update({ kind: 'all' }),
        read('TodoList', {
          kind: 'relation-image',
          relationName: 'list',
          source: {
            kind: 'selection',
            entityName: 'TodoItem',
            expression: equal('completed', false),
          },
        }),
      ),
    ).toBe(true);
  });

  it('falls back to may-affect for unsupported Selection and command forms', () => {
    expect(
      mayAffectGraphRead(
        update(equal('listId', 'later')),
        read('TodoItem', { kind: 'not', operand: equal('listId', 'inbox') }),
      ),
    ).toBe(true);

    expect(
      mayAffectGraphRead(
        update({ kind: 'predicate', operator: 'gt', fieldName: 'priority', value: 10 }),
        read('TodoItem', { kind: 'predicate', operator: 'lt', fieldName: 'priority', value: 0 }),
      ),
    ).toBe(true);

    expect(
      mayAffectGraphRead(
        mutation({
          kind: 'relationship-command',
          action: 'link',
          relation: {
            sourceEntityName: 'TodoItem',
            fieldName: 'list',
            targetEntityName: 'TodoList',
          },
          source: createEntityRef('TodoItem', { id: 'item' }),
          target: createEntityRef('TodoList', { id: 'later' }),
        }),
        read('UnrelatedEntity'),
      ),
    ).toBe(true);
  });
});

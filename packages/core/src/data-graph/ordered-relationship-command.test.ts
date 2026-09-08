import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  bindEntityRefRelationshipCommands,
  createEntityRef,
  createGraphCommandDispatcher,
  createInMemoryDataGraphRuntime,
  entity,
  field,
  relationship,
  toGraphCommandRequest,
  type InMemoryDataset,
  type OrderedRelationshipCommand,
  type RelationshipCommandExecutor,
} from './index.js';

const defineGraph = () => {
  const ListBase = entity('OrderedList', { id: field.id() });
  const Item = entity('OrderedItem', {
    id: field.id(),
    list: field.ref(ListBase),
  });
  const List = ListBase.hasMany('items', Item, { via: 'list', ordered: true });
  return { List, Item };
};

const fixture = () => {
  const graph = defineGraph();
  const list = createEntityRef(graph.List, { id: 'list-1' });
  const otherList = createEntityRef(graph.List, { id: 'list-2' });
  const items = ['a', 'b', 'c'].map(id => createEntityRef(graph.Item, { id }));
  const outsider = createEntityRef(graph.Item, { id: 'x' });
  const dataset: InMemoryDataset = {
    OrderedList: [{ id: 'list-1' }, { id: 'list-2' }],
    OrderedItem: [
      { id: 'a', list: 'list-1' },
      { id: 'x', list: 'list-2' },
      { id: 'b', list: 'list-1' },
      { id: 'c', list: 'list-1' },
    ],
  };
  const runtime = createInMemoryDataGraphRuntime({ dataset, entities: [graph.List, graph.Item] });
  const ids = () =>
    dataset.OrderedItem!.filter(row => row.list === 'list-1').map(row => row.id as string);
  const run = (command: OrderedRelationshipCommand) =>
    Effect.runPromise(runtime.runOrderedRelationshipCommand(command));
  return { ...graph, dataset, ids, items, list, otherList, outsider, run, runtime };
};

describe('ordered Relationship Commands', () => {
  it('authors a canonical move command from the ordered hasMany endpoint', () => {
    const { List, Item, list, items } = fixture();
    const operations = relationship(List, 'items', list);
    // @ts-expect-error Ordered Relations expose position changes, not generic membership changes.
    expect(operations.add).toBeUndefined();
    const command = operations.before(items[2]!, items[0]!, {
      ifPosition: { before: null, after: items[1]! },
      onMismatch: 'skip',
    });

    expect(command).toEqual({
      kind: 'ordered-relationship-command',
      action: 'move',
      relation: {
        sourceEntityName: 'OrderedList',
        relationName: 'items',
        targetEntityName: 'OrderedItem',
        cardinality: 'ordered-many',
      },
      source: list,
      member: createEntityRef(Item, { id: 'c' }),
      position: { before: items[0] },
      precondition: {
        position: { before: null, after: items[1] },
        onMismatch: 'skip',
      },
    });
  });

  it('binds every ordered movement helper and reports an unsupported executor', async () => {
    const f = fixture();
    const bound = bindEntityRefRelationshipCommands(f.list, f.List, f.runtime);
    const commands = [
      bound.items.move(f.items[0]!, { after: f.items[1]! }),
      bound.items.append(f.items[0]!),
      bound.items.prepend(f.items[2]!),
      bound.items.before(f.items[2]!, f.items[1]!),
      bound.items.after(f.items[0]!, f.items[1]!),
    ];

    await expect(Effect.runPromise(commands[0]!.run())).resolves.toMatchObject({
      status: 'applied',
    });

    const unsupportedExecutor = {
      runRelationshipCommand: f.runtime.runRelationshipCommand.bind(f.runtime),
      runManyToManyRelationshipCommand: f.runtime.runManyToManyRelationshipCommand.bind(f.runtime),
    } as RelationshipCommandExecutor;
    const unsupported = bindEntityRefRelationshipCommands(f.list, f.List, unsupportedExecutor);
    expect(() => unsupported.items.append(f.items[0]!).run()).toThrow(
      'does not support ordered Relationship Commands',
    );
  });

  it('rejects invalid ordered authoring inputs before creating a command', () => {
    const f = fixture();
    const operations = relationship(f.List, 'items', f.list);

    expect(() => operations.append(f.items[0]!, { onMismatch: 'skip' } as never)).toThrow(
      'onMismatch requires ifPosition',
    );
    expect(() => relationship(f.List, 'items', f.items[0] as never).append(f.items[1]!)).toThrow(
      'Expected relationship subject Ref for OrderedList',
    );
    expect(() => operations.append(f.list as never)).toThrow(
      'Expected ordered member Ref for OrderedItem',
    );
    expect(() => operations.before(f.items[0]!, f.list as never)).toThrow(
      'Expected ordered anchor Ref for OrderedItem',
    );
    expect(() =>
      operations.append(f.items[0]!, {
        ifPosition: { before: f.list as never, after: null },
      }),
    ).toThrow('Expected ordered precondition neighbor Ref for OrderedItem');
  });

  it.each([
    [
      'move',
      (f: ReturnType<typeof fixture>) =>
        relationship(f.List, 'items', f.list).move(f.items[0]!, { after: f.items[1]! }),
      ['b', 'a', 'c'],
    ],
    [
      'prepend',
      (f: ReturnType<typeof fixture>) => relationship(f.List, 'items', f.list).prepend(f.items[2]!),
      ['c', 'a', 'b'],
    ],
    [
      'append',
      (f: ReturnType<typeof fixture>) => relationship(f.List, 'items', f.list).append(f.items[0]!),
      ['b', 'c', 'a'],
    ],
    [
      'before',
      (f: ReturnType<typeof fixture>) =>
        relationship(f.List, 'items', f.list).before(f.items[2]!, f.items[1]!),
      ['a', 'c', 'b'],
    ],
    [
      'after',
      (f: ReturnType<typeof fixture>) =>
        relationship(f.List, 'items', f.list).after(f.items[0]!, f.items[1]!),
      ['b', 'a', 'c'],
    ],
  ] as const)('moves a member using %s placement', async (_name, createCommand, expected) => {
    const f = fixture();
    const result = await f.run(createCommand(f));

    expect(f.ids()).toEqual(expected);
    expect(result).toMatchObject({
      status: 'applied',
      delta: { added: [], removed: [], moved: [{ relation: { cardinality: 'ordered-many' } }] },
    });
    expect(f.dataset.OrderedItem!.find(row => row.id === 'x')).toEqual({
      id: 'x',
      list: 'list-2',
    });
  });

  it('returns an exact empty delta for an idempotent move', async () => {
    const f = fixture();
    await expect(
      f.run(relationship(f.List, 'items', f.list).before(f.items[1]!, f.items[2]!)),
    ).resolves.toEqual({ status: 'applied', delta: { added: [], removed: [], moved: [] } });
    expect(f.ids()).toEqual(['a', 'b', 'c']);
  });

  it('treats positioning a member relative to itself as an idempotent move', async () => {
    const f = fixture();
    await expect(
      f.run(relationship(f.List, 'items', f.list).before(f.items[0]!, f.items[0]!)),
    ).resolves.toEqual({ status: 'applied', delta: { added: [], removed: [], moved: [] } });
    expect(f.ids()).toEqual(['a', 'b', 'c']);
  });

  it.each([
    [
      'unknown target Entity',
      (f: ReturnType<typeof fixture>, command: OrderedRelationshipCommand) => ({
        ...command,
        relation: { ...command.relation, targetEntityName: 'MissingItem' },
      }),
      'invalid_command',
    ],
    [
      'invalid ordered Relation',
      (_f: ReturnType<typeof fixture>, command: OrderedRelationshipCommand) => ({
        ...command,
        relation: { ...command.relation, relationName: 'missing' },
      }),
      'invalid_command',
    ],
    [
      'wrong source Ref Entity',
      (f: ReturnType<typeof fixture>, command: OrderedRelationshipCommand) => ({
        ...command,
        source: f.items[0],
      }),
      'invalid_command',
    ],
    [
      'wrong member Ref Entity',
      (f: ReturnType<typeof fixture>, command: OrderedRelationshipCommand) => ({
        ...command,
        member: f.list,
      }),
      'invalid_command',
    ],
    [
      'wrong anchor Ref Entity',
      (f: ReturnType<typeof fixture>, command: OrderedRelationshipCommand) => ({
        ...command,
        position: { before: f.list },
      }),
      'invalid_command',
    ],
    [
      'ambiguous source Ref',
      (f: ReturnType<typeof fixture>, command: OrderedRelationshipCommand) => {
        (f.dataset.OrderedList as Record<string, unknown>[]).push({ id: 'list-1' });
        return command;
      },
      'cardinality_mismatch',
    ],
    [
      'ambiguous member Ref',
      (f: ReturnType<typeof fixture>, command: OrderedRelationshipCommand) => {
        (f.dataset.OrderedItem as Record<string, unknown>[]).push({ id: 'a', list: 'list-1' });
        return command;
      },
      'cardinality_mismatch',
    ],
  ] as const)('rejects a structurally %s command', async (_name, alter, reason) => {
    const f = fixture();
    const command = relationship(f.List, 'items', f.list).prepend(f.items[0]!);

    await expect(
      Effect.runPromise(
        f.runtime
          .runOrderedRelationshipCommand(alter(f, command) as OrderedRelationshipCommand)
          .pipe(Effect.either),
      ),
    ).resolves.toMatchObject({ _tag: 'Left', left: { reason } });
  });

  it.each([
    [
      'missing source',
      (f: ReturnType<typeof fixture>) =>
        relationship(f.List, 'items', createEntityRef(f.List, { id: 'missing' })).prepend(
          f.items[0]!,
        ),
      'ordered_relationship_source_not_found',
    ],
    [
      'missing member',
      (f: ReturnType<typeof fixture>) =>
        relationship(f.List, 'items', f.list).prepend(createEntityRef(f.Item, { id: 'missing' })),
      'ordered_relationship_member_not_found',
    ],
    [
      'member from another list',
      (f: ReturnType<typeof fixture>) => relationship(f.List, 'items', f.list).prepend(f.outsider),
      'ordered_relationship_member_not_in_relation',
    ],
    [
      'anchor from another list',
      (f: ReturnType<typeof fixture>) =>
        relationship(f.List, 'items', f.list).before(f.items[0]!, f.outsider),
      'ordered_relationship_anchor_not_in_relation',
    ],
    [
      'missing anchor',
      (f: ReturnType<typeof fixture>) =>
        relationship(f.List, 'items', f.list).before(
          f.items[0]!,
          createEntityRef(f.Item, { id: 'missing' }),
        ),
      'ordered_relationship_anchor_not_found',
    ],
    [
      'precondition neighbor from another list',
      (f: ReturnType<typeof fixture>) =>
        relationship(f.List, 'items', f.list).prepend(f.items[2]!, {
          ifPosition: { before: null, after: f.outsider },
        }),
      'ordered_relationship_neighbor_not_in_relation',
    ],
    [
      'missing precondition neighbor',
      (f: ReturnType<typeof fixture>) =>
        relationship(f.List, 'items', f.list).prepend(f.items[2]!, {
          ifPosition: { before: createEntityRef(f.Item, { id: 'missing' }), after: null },
        }),
      'ordered_relationship_neighbor_not_found',
    ],
  ] as const)('rejects a %s with a stable diagnostic', async (_name, createCommand, code) => {
    const f = fixture();
    const result = await Effect.runPromise(
      f.runtime.runOrderedRelationshipCommand(createCommand(f)).pipe(Effect.either),
    );
    expect(result).toMatchObject({
      _tag: 'Left',
      left: {
        reason: 'ordered_relationship_rejected',
        rejection: { code },
      },
    });
    expect(f.ids()).toEqual(['a', 'b', 'c']);
  });

  it('supports fail and skip conflict handling without changing order', async () => {
    const stale = { before: null, after: null };
    const skipped = fixture();
    await expect(
      skipped.run(
        relationship(skipped.List, 'items', skipped.list).prepend(skipped.items[2]!, {
          ifPosition: stale,
          onMismatch: 'skip',
        }),
      ),
    ).resolves.toMatchObject({
      status: 'not-applied',
      diagnostic: { reason: 'relationship_precondition_failed' },
    });
    expect(skipped.ids()).toEqual(['a', 'b', 'c']);

    const failed = fixture();
    await expect(
      Effect.runPromise(
        failed.runtime
          .runOrderedRelationshipCommand(
            relationship(failed.List, 'items', failed.list).prepend(failed.items[2]!, {
              ifPosition: stale,
            }),
          )
          .pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'relationship_precondition_failed' },
    });
    expect(failed.ids()).toEqual(['a', 'b', 'c']);
  });

  it('is default-deny and dispatches only through an explicit move policy', async () => {
    const f = fixture();
    const command = relationship(f.List, 'items', f.list).prepend(f.items[2]!);
    const executeOrdered = async (resolved: OrderedRelationshipCommand) => f.run(resolved);
    const denied = createGraphCommandDispatcher({ policies: [], executeOrdered });
    const allowed = createGraphCommandDispatcher({
      policies: [{ entity: f.List, relationName: 'items', actions: ['move'] }],
      executeOrdered,
    });
    const unavailable = createGraphCommandDispatcher({
      policies: [{ entity: f.List, relationName: 'items', actions: ['move'] }],
    });

    expect(() =>
      createGraphCommandDispatcher({
        policies: [
          { entity: f.List, relationName: 'items', actions: ['move'] },
          { entity: f.List, relationName: 'items', actions: ['move'] },
        ],
        executeOrdered,
      }),
    ).toThrow('Duplicate Graph Command policy for Relation OrderedList.items');

    await expect(
      denied(toGraphCommandRequest(command), { authority: undefined }),
    ).resolves.toMatchObject({ kind: 'protocol-error', error: { code: 'access_denied' } });
    await expect(
      unavailable(toGraphCommandRequest(command), { authority: undefined }),
    ).resolves.toMatchObject({ kind: 'protocol-error', error: { code: 'execution_unavailable' } });
    await expect(
      allowed(toGraphCommandRequest(command), { authority: undefined }),
    ).resolves.toMatchObject({ kind: 'graph-command-result', value: { status: 'applied' } });
    expect(f.ids()).toEqual(['c', 'a', 'b']);
  });
});

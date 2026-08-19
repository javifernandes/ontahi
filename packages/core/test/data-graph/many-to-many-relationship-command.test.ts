import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  createEntityRef,
  createGraphCommandDispatcher,
  createInMemoryDataGraphRuntime,
  createRemoteDataGraphRuntime,
  entity,
  executeInMemoryManyToManyRelationshipCommandEffect,
  field,
  parseGraphCommandRequest,
  relationshipSet,
  resolveGraphCommandRequest,
  Selection,
  selection,
  toGraphCommandRequest,
  type InMemoryDataset,
  type RelationshipFact,
} from '../../src/data-graph/index.js';

const defineTodoGraph = () => {
  const Tag = entity('Tag', { id: field.id(), name: field.string() });
  const Todo = entity('Todo', { id: field.id(), title: field.string() }).manyToMany('tags', Tag);
  return { Tag, Todo };
};

describe('many-to-many Relationship Commands', () => {
  it('declares direct topology and preserves Selection-valued endpoints', () => {
    const { Tag, Todo } = defineTodoGraph();
    const todos = selection(Todo, todo => todo.id.in(['todo-1', 'todo-2']));
    const tags = selection(Tag, tag => tag.id.eq('tag-1'));

    expect(relationshipSet(Todo, 'tags', todos).add(tags)).toEqual({
      kind: 'many-to-many-relationship-command',
      action: 'link',
      relation: {
        sourceEntityName: 'Todo',
        relationName: 'tags',
        targetEntityName: 'Tag',
        cardinality: 'many-to-many',
      },
      sources: { entityName: 'Todo', selection: todos.expression },
      targets: { entityName: 'Tag', selection: tags.expression },
    });
  });

  it('round-trips Selection endpoints and resolves only server-owned topology', () => {
    const client = defineTodoGraph();
    const server = defineTodoGraph();
    const command = relationshipSet(
      client.Todo,
      'tags',
      selection(client.Todo, todo => todo.id.in(['todo-1', 'todo-2'])),
    ).add(Selection.references(client.Tag, [createEntityRef(client.Tag, { id: 'tag-1' })]));
    const transported = JSON.parse(JSON.stringify(toGraphCommandRequest(command)));
    const parsed = parseGraphCommandRequest(transported);

    expect(parsed).toEqual({ success: true, request: transported });
    if (!parsed.success) throw new Error(parsed.error.error.message);
    expect(
      resolveGraphCommandRequest(parsed.request, { entities: [server.Todo, server.Tag] }),
    ).toEqual({ success: true, request: parsed.request, command });

    const invalid = structuredClone(transported);
    invalid.command.targets.selection = {
      kind: 'predicate',
      operator: 'eq',
      fieldName: 'missing',
      value: 'tag-1',
    };
    const invalidParsed = parseGraphCommandRequest(invalid);
    if (!invalidParsed.success) throw new Error(invalidParsed.error.error.message);
    expect(
      resolveGraphCommandRequest(invalidParsed.request, { entities: [server.Todo, server.Tag] }),
    ).toMatchObject({ success: false, error: { error: { code: 'invalid_selection' } } });
  });

  it('applies the exact Cartesian delta and treats repeated add/remove as no-ops', async () => {
    const { Tag, Todo } = defineTodoGraph();
    const dataset: InMemoryDataset = {
      Todo: [
        { id: 'todo-1', title: 'One' },
        { id: 'todo-2', title: 'Two' },
      ],
      Tag: [
        { id: 'tag-1', name: 'Urgent' },
        { id: 'tag-2', name: 'Research' },
      ],
    };
    const facts: RelationshipFact[] = [];
    const runtime = createInMemoryDataGraphRuntime({
      dataset,
      entities: [Todo, Tag],
      relationships: facts,
    });
    const todos = Selection.references(Todo, [
      createEntityRef(Todo, { id: 'todo-1' }),
      createEntityRef(Todo, { id: 'todo-2' }),
    ]);
    const tags = Selection.references(Tag, [
      createEntityRef(Tag, { id: 'tag-1' }),
      createEntityRef(Tag, { id: 'tag-2' }),
    ]);
    const add = relationshipSet(Todo, 'tags', todos).add(tags);
    const execute = (command: typeof add) =>
      Effect.runPromise(runtime.runManyToManyRelationshipCommand(command));

    const added = await execute(add);
    expect(added.added).toHaveLength(4);
    expect(added.removed).toEqual([]);
    expect(facts).toEqual(added.added);
    await expect(execute(add)).resolves.toEqual({ added: [], removed: [] });

    const removeTag = relationshipSet(Todo, 'tags', createEntityRef(Todo, { id: 'todo-1' })).remove(
      createEntityRef(Tag, { id: 'tag-1' }),
    );
    await expect(execute(removeTag)).resolves.toEqual({
      added: [],
      removed: [
        expect.objectContaining({
          source: createEntityRef(Todo, { id: 'todo-1' }),
          target: createEntityRef(Tag, { id: 'tag-1' }),
        }),
      ],
    });
    await expect(execute(removeTag)).resolves.toEqual({ added: [], removed: [] });
    expect(facts).toHaveLength(3);
  });

  it('rejects missing explicit Refs atomically but permits empty filtered Selections', async () => {
    const { Tag, Todo } = defineTodoGraph();
    const dataset: InMemoryDataset = {
      Todo: [{ id: 'todo-1', title: 'One' }],
      Tag: [{ id: 'tag-1', name: 'Urgent' }],
    };
    const facts: RelationshipFact[] = [];
    const missing = relationshipSet(
      Todo,
      'tags',
      createEntityRef(Todo, { id: 'missing-todo' }),
    ).add(createEntityRef(Tag, { id: 'tag-1' }));

    await expect(
      Effect.runPromise(
        executeInMemoryManyToManyRelationshipCommandEffect(
          dataset,
          [Todo, Tag],
          facts,
          missing,
        ).pipe(Effect.either),
      ),
    ).resolves.toMatchObject({
      _tag: 'Left',
      left: { reason: 'cardinality_mismatch' },
    });
    expect(facts).toEqual([]);

    const emptyFiltered = relationshipSet(
      Todo,
      'tags',
      selection(Todo, todo => todo.title.eq('Missing')),
    ).add(selection(Tag, tag => tag.name.eq('Urgent')));
    await expect(
      Effect.runPromise(
        executeInMemoryManyToManyRelationshipCommandEffect(
          dataset,
          [Todo, Tag],
          facts,
          emptyFiltered,
        ),
      ),
    ).resolves.toEqual({ added: [], removed: [] });
  });

  it('is default-deny and executes through an explicit many-to-many policy', async () => {
    const { Tag, Todo } = defineTodoGraph();
    const dataset: InMemoryDataset = {
      Todo: [{ id: 'todo-1', title: 'One' }],
      Tag: [{ id: 'tag-1', name: 'Urgent' }],
    };
    const facts: RelationshipFact[] = [];
    const runtime = createInMemoryDataGraphRuntime({
      dataset,
      entities: [Todo, Tag],
      relationships: facts,
    });
    const todoRef = createEntityRef(Todo, { id: 'todo-1' });
    const tagRef = createEntityRef(Tag, { id: 'tag-1' });
    const command = relationshipSet(Todo, 'tags', todoRef).add(tagRef);
    const denied = createGraphCommandDispatcher({
      policies: [],
      execute: async () => ({ added: [], removed: [] }),
    });
    const allowed = createGraphCommandDispatcher({
      policies: [{ entity: Todo, relationName: 'tags', actions: ['link', 'unlink'] }],
      execute: async () => ({ added: [], removed: [] }),
      executeManyToMany: manyCommand =>
        Effect.runPromise(runtime.runManyToManyRelationshipCommand(manyCommand)),
    });

    await expect(
      denied(toGraphCommandRequest(command), { authority: 'system' }),
    ).resolves.toMatchObject({
      kind: 'protocol-error',
      error: { code: 'access_denied' },
    });
    await expect(allowed(toGraphCommandRequest(command), { authority: 'system' })).resolves.toEqual(
      {
        kind: 'graph-command-result',
        value: {
          added: [expect.objectContaining({ source: todoRef, target: tagRef })],
          removed: [],
        },
      },
    );
    expect(facts).toHaveLength(1);
  });

  it('preserves the same command and delta through remote in-process routing', async () => {
    const client = defineTodoGraph();
    const server = defineTodoGraph();
    const dataset: InMemoryDataset = {
      Todo: [{ id: 'todo-1', title: 'One' }],
      Tag: [{ id: 'tag-1', name: 'Urgent' }],
    };
    const facts: RelationshipFact[] = [];
    const serverRuntime = createInMemoryDataGraphRuntime({
      dataset,
      entities: [server.Todo, server.Tag],
      relationships: facts,
    });
    const dispatch = createGraphCommandDispatcher({
      policies: [{ entity: server.Todo, relationName: 'tags', actions: ['link'] }],
      execute: async () => ({ added: [], removed: [] }),
      executeManyToMany: command =>
        Effect.runPromise(serverRuntime.runManyToManyRelationshipCommand(command)),
    });
    const remote = createRemoteDataGraphRuntime({
      transport: async () => undefined,
      commandTransport: request => dispatch(request, { authority: 'system' }),
    });
    const command = relationshipSet(
      client.Todo,
      'tags',
      createEntityRef(client.Todo, { id: 'todo-1' }),
    ).add(createEntityRef(client.Tag, { id: 'tag-1' }));

    await expect(
      Effect.runPromise(remote.runManyToManyRelationshipCommand(command)),
    ).resolves.toEqual({
      added: [
        {
          relation: command.relation,
          source: createEntityRef(client.Todo, { id: 'todo-1' }),
          target: createEntityRef(client.Tag, { id: 'tag-1' }),
        },
      ],
      removed: [],
    });
    expect(facts).toHaveLength(1);
  });
});
